/* Trade copier Tradovate (port of tradovate-copier/copier.py) — position sync leader -> followers.
 * follower position = leader position x multiplier (same side, always), market orders, reconcile every N s.
 */
const crypto = require("crypto");

const URLS = {
  demo: ["https://demo.tradovateapi.com/v1", "wss://demo.tradovateapi.com/v1/websocket"],
  live: ["https://live.tradovateapi.com/v1", "wss://live.tradovateapi.com/v1/websocket"],
};
const TOKEN_RENEW_SEC = 3600, HEARTBEAT_MS = 2500, PENDING_TIMEOUT = 6, FAIL_BACKOFF = 30;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now() / 1000;

function mapSymbol(name, map) { // NQZ6 + {"NQ":"MNQ"} -> MNQZ6
  if (!name || name.length <= 2) return name;
  const root = name.slice(0, -2), suf = name.slice(-2);
  return (map && map[root] ? map[root] : root) + suf;
}

class Session {
  constructor(key, cfg, devId, log) {
    const env = String(cfg.environment || "demo").toLowerCase();
    if (!URLS[env]) throw new Error(`[${key}] environment doit être "demo" ou "live"`);
    Object.assign(this, { key, cfg, devId, log, rest: URLS[env][0], wsurl: URLS[env][1], token: null, tokenTime: 0, userId: null,
      accounts: {}, contracts: {}, positions: new Map(), synced: false, listeners: [], ws: null, req: 0, authReq: null, syncReq: null, stopped: false, hb: null });
  }
  headers() { return { Authorization: `Bearer ${this.token}`, Accept: "application/json", "Content-Type": "application/json" }; }
  async get(p, q) { const u = this.rest + p + (q ? "?" + new URLSearchParams(q) : ""); const r = await fetch(u, { headers: this.headers() }); if (!r.ok) throw new Error(`${p} HTTP ${r.status}`); return r.json(); }
  async post(p, body) { const r = await fetch(this.rest + p, { method: "POST", headers: this.headers(), body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${p} HTTP ${r.status}`); return r.json(); }
  async login() {
    const c = this.cfg, body = { name: c.username, password: c.password, appId: c.app_id || "PropCopier", appVersion: "1.0", deviceId: this.devId, cid: +c.cid, sec: c.sec };
    for (let i = 0; i < 6; i++) {
      const d = await (await fetch(this.rest + "/auth/accesstokenrequest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
      if (d.accessToken) { this.token = d.accessToken; this.userId = d.userId; this.tokenTime = now(); break; }
      if (d["p-ticket"]) {
        if (d["p-captcha"]) throw new Error(`[${this.key}] Tradovate demande un captcha. Connecte-toi une fois sur trader.tradovate.com avec ce compte, attends quelques minutes, puis relance.`);
        const w = +(d["p-time"] || 5); this.log("warn", `[${this.key}] Tradovate fait patienter ${w} s avant la connexion…`); await sleep(w * 1000); body["p-ticket"] = d["p-ticket"]; continue;
      }
      throw new Error(`[${this.key}] connexion refusée : ${d.errorText || JSON.stringify(d)}`);
    }
    if (!this.token) throw new Error(`[${this.key}] connexion impossible après plusieurs essais`);
    this.accounts = {};
    (await this.get("/account/list")).filter((a) => a.active !== false).forEach((a) => (this.accounts[a.name] = a.id));
    this.log("info", `[${this.key}] connecté — comptes : ${Object.keys(this.accounts).join(", ") || "aucun"}`);
  }
  async renew() {
    try { const d = await this.get("/auth/renewaccesstoken"); if (d.accessToken) { this.token = d.accessToken; this.tokenTime = now(); return; } }
    catch (e) { this.log("warn", `[${this.key}] renouvellement du jeton échoué (${e.message}), reconnexion`); }
    await this.login();
  }
  accountId(name) {
    if (name) { if (!(name in this.accounts)) throw new Error(`[${this.key}] compte « ${name} » introuvable. Comptes disponibles : ${Object.keys(this.accounts).join(", ")}`); return this.accounts[name]; }
    const ids = Object.values(this.accounts); if (ids.length === 1) return ids[0];
    throw new Error(`[${this.key}] plusieurs comptes sur ce login, précise le compte parmi : ${Object.keys(this.accounts).join(", ")}`);
  }
  accountName(id) { return Object.keys(this.accounts).find((n) => this.accounts[n] === id) || String(id); }
  async contractName(id) { if (!this.contracts[id]) this.contracts[id] = (await this.get("/contract/item", { id })).name; return this.contracts[id]; }
  position(aid, sym) { return this.positions.get(aid + "|" + sym) || 0; }
  positionsOf(aid) { const o = {}; for (const [k, n] of this.positions) { const [a, s] = k.split("|"); if (+a === aid) o[s] = n; } return o; }
  async placeMarket(aid, sym, qty) {
    const d = await this.post("/order/placeorder", { accountSpec: this.accountName(aid), accountId: aid, action: qty > 0 ? "Buy" : "Sell", symbol: sym, orderQty: Math.abs(qty), orderType: "Market", isAutomated: true });
    if (d.failureReason || !("orderId" in d)) throw new Error(d.failureText || d.failureReason || JSON.stringify(d));
    return d.orderId;
  }
  startStream() {
    const open = () => {
      if (this.stopped) return;
      this.synced = false;
      const ws = (this.ws = new WebSocket(this.wsurl));
      ws.onmessage = (ev) => this.onMsg(String(ev.data));
      ws.onerror = () => this.log("warn", `[${this.key}] erreur flux`);
      ws.onclose = async () => {
        if (this.stopped) return;
        this.synced = false;
        this.log("warn", `[${this.key}] flux coupé — copie suspendue pour ce login, reconnexion dans 3 s`);
        await sleep(3000);
        try { await this.renew(); } catch (e) { this.log("error", e.message); }
        open();
      };
    };
    open();
    this.hb = setInterval(() => { try { if (this.ws && this.ws.readyState === 1) this.ws.send("[]"); } catch (e) { /* ignore */ } }, HEARTBEAT_MS);
  }
  stop() { this.stopped = true; clearInterval(this.hb); try { this.ws && this.ws.close(); } catch (e) { /* ignore */ } }
  send(endpoint, body = "") { this.req++; this.ws.send(`${endpoint}\n${this.req}\n\n${typeof body === "string" ? body : JSON.stringify(body)}`); return this.req; }
  onMsg(raw) {
    if (!raw) return;
    const k = raw[0];
    if (k === "o") this.authReq = this.send("authorize", this.token);
    else if (k === "c") this.ws.close();
    else if (k === "a") { let items; try { items = JSON.parse(raw.slice(1)); } catch (e) { return; } items.forEach((it) => this.handle(it).catch((e) => this.log("warn", `[${this.key}] message ignoré : ${e.message}`))); }
  }
  async handle(it) {
    if (it.i != null) {
      if (it.i === this.authReq) { if (it.s === 200) this.syncReq = this.send("user/syncrequest", { users: [this.userId] }); else { this.log("error", `[${this.key}] autorisation du flux refusée`); this.ws.close(); } }
      else if (it.i === this.syncReq && it.s === 200) await this.applySnapshot(it.d || {});
      return;
    }
    if (it.e === "props") { const d = it.d || {}; if (d.entityType === "position") { await this.applyPosition(d.entity || {}); this.notify(); } }
    else if (it.e === "shutdown") { this.log("warn", `[${this.key}] Tradovate ferme le flux, reconnexion`); this.ws.close(); }
  }
  async applySnapshot(d) {
    (d.contracts || []).forEach((c) => { if (c.id != null && c.name) this.contracts[c.id] = c.name; });
    this.positions.clear();
    for (const p of d.positions || []) await this.applyPosition(p);
    this.synced = true; this.log("info", `[${this.key}] flux synchronisé`); this.notify();
  }
  async applyPosition(p) { if (p.accountId == null || p.contractId == null) return; const sym = await this.contractName(p.contractId); this.positions.set(p.accountId + "|" + sym, +(p.netPos || 0)); }
  notify() { this.listeners.forEach((cb) => cb(this)); }
}

class Copier {
  constructor(cfg, devId, log) {
    this.cfg = cfg; this.log = log; this.dry = cfg.dry_run !== false; this.flattenOnExit = !!cfg.flatten_followers_on_exit; this.period = +(cfg.reconcile_seconds || 2);
    this.sessions = {}; for (const [k, v] of Object.entries(cfg.logins || {})) this.sessions[k] = new Session(k, v, devId, log);
    this.active = new Set(); this.pending = new Map(); this.blocked = new Map(); this.dryLast = new Map(); this.ready = false; this.stopping = false; this.busy = false;
    const L = cfg.leader || {};
    if (!this.sessions[L.login]) throw new Error(`leader : login « ${L.login} » absent des logins`);
    this.leader = this.sessions[L.login];
    this.followers = [];
    (cfg.followers || []).forEach((f, i) => {
      if (f.enabled === false) return;
      if (!this.sessions[f.login]) throw new Error(`follower ${i + 1} : login « ${f.login} » absent des logins`);
      const mult = +(f.multiplier ?? 1); if (!(mult > 0)) throw new Error(`follower ${i + 1} : le multiplicateur doit être > 0 (un sens inversé = hedging, interdit par les prop firms)`);
      const mx = parseInt(f.max_contracts ?? 1, 10); if (!(mx >= 1)) throw new Error(`follower ${i + 1} : max_contracts doit être >= 1`);
      this.followers.push({ login: f.login, account: f.account, multiplier: mult, max: mx, symbol_map: f.symbol_map || {}, session: this.sessions[f.login], aid: null, label: null });
    });
    if (!this.followers.length) throw new Error("aucun follower actif dans la config");
  }
  resolve() {
    this.leaderAid = this.leader.accountId(this.cfg.leader.account);
    this.leaderLabel = `${this.leader.key}/${this.leader.accountName(this.leaderAid)}`;
    for (const f of this.followers) {
      f.aid = f.session.accountId(f.account); f.label = `${f.login}/${f.session.accountName(f.aid)}`;
      if (f.session === this.leader && f.aid === this.leaderAid) throw new Error(`${f.label} est à la fois leader et follower`);
    }
  }
  async start(confirmAlign) {
    for (const s of Object.values(this.sessions)) await s.login();
    this.resolve();
    this.log("info", `Leader : ${this.leaderLabel}`);
    this.followers.forEach((f) => this.log("info", `Follower : ${f.label}  x${f.multiplier}  max ${f.max} contrat(s)${Object.keys(f.symbol_map).length ? " — mapping " + JSON.stringify(f.symbol_map) : ""}`));
    this.log("info", this.dry ? "MODE SIMULATION (dry_run) : aucun ordre ne sera envoyé." : "MODE RÉEL : les ordres seront envoyés sur les followers.");
    for (const s of Object.values(this.sessions)) { s.listeners.push(() => this.reconcile()); s.startStream(); }
    const t0 = Date.now();
    while (Object.values(this.sessions).some((s) => !s.synced)) { if (Date.now() - t0 > 30000) throw new Error("le flux temps réel ne répond pas"); await sleep(300); }
    const plan = await this.plan();
    if (plan.length && !this.dry) {
      const ok = await confirmAlign(plan.map((p) => `${p.f.label} ${p.sym} : ${p.cur} → ${p.target} (${p.qty > 0 ? "achat" : "vente"} ${Math.abs(p.qty)})`));
      if (!ok) throw new Error("Arrêt sans envoyer d'ordre (écarts au démarrage non validés).");
    }
    this.ready = true; this.reconcile();
    this.timer = setInterval(async () => {
      for (const s of Object.values(this.sessions)) if (now() - s.tokenTime > TOKEN_RENEW_SEC) { try { await s.renew(); } catch (e) { this.log("error", e.message); } }
      this.reconcile();
    }, this.period * 1000);
    this.log("info", "Copieur actif.");
  }
  target(f, net) {
    let t = Math.floor(Math.abs(net) * f.multiplier + 0.5);
    if (t > f.max) { if (f.lastCap !== t) { this.log("warn", `${f.label} : cible ${t} plafonnée à ${f.max} contrat(s)`); f.lastCap = t; } t = f.max; } else f.lastCap = null;
    return net >= 0 ? t : -t;
  }
  async plan() {
    if (!this.leader.synced) return [];
    const lead = this.leader.positionsOf(this.leaderAid);
    for (const [s, n] of Object.entries(lead)) if (n) this.active.add(s);
    const out = [], t = now();
    for (const f of this.followers) {
      if (!f.session.synced) continue;
      for (const sym of [...this.active].sort()) {
        const fsym = mapSymbol(sym, f.symbol_map), target = this.target(f, lead[sym] || 0), cur = f.session.position(f.aid, fsym), key = f.label + "|" + fsym;
        if (cur === target) { this.pending.delete(key); continue; }
        const p = this.pending.get(key); if (p && p[0] === target && t - p[1] < PENDING_TIMEOUT) continue;
        if (t < (this.blocked.get(key) || 0)) continue;
        out.push({ f, sym: fsym, qty: target - cur, target, cur, key });
      }
    }
    return out;
  }
  async reconcile() {
    if (!this.ready || this.stopping || this.busy) return;
    this.busy = true;
    try { for (const p of await this.plan()) await this.execute(p); } finally { this.busy = false; }
  }
  async execute({ f, sym, qty, target, cur, key }) {
    const side = qty > 0 ? "ACHAT" : "VENTE";
    if (this.dry) { if (this.dryLast.get(key) !== target) { this.log("info", `[SIMULATION] ${f.label} ${side} ${Math.abs(qty)} ${sym} (position ${cur} → ${target})`); this.dryLast.set(key, target); } return; }
    try { const oid = await f.session.placeMarket(f.aid, sym, qty); this.log("info", `${f.label} ${side} ${Math.abs(qty)} ${sym} au marché (position ${cur} → ${target}) — ordre ${oid}`); this.pending.set(key, [target, now()]); }
    catch (e) { this.log("error", `${f.label} ordre ${side} ${Math.abs(qty)} ${sym} refusé : ${e.message} — nouvel essai dans ${FAIL_BACKOFF} s`); this.blocked.set(key, now() + FAIL_BACKOFF); }
  }
  async flattenFollowers() {
    for (const f of this.followers) for (const sym of this.active) { const fsym = mapSymbol(sym, f.symbol_map), cur = f.session.position(f.aid, fsym); if (cur) await this.execute({ f, sym: fsym, qty: -cur, target: 0, cur, key: f.label + "|" + fsym }); }
  }
  snapshot() {
    if (!this.ready) return null;
    const lead = this.leader.positionsOf(this.leaderAid);
    return { leader: { label: this.leaderLabel, positions: lead, synced: this.leader.synced },
      followers: this.followers.map((f) => ({ label: f.label, multiplier: f.multiplier, max: f.max, synced: f.session.synced, positions: f.session.positionsOf(f.aid) })), dry: this.dry };
  }
  async stop() {
    if (this.ready && this.flattenOnExit) { this.log("info", "Arrêt : fermeture des positions copiées sur les followers…"); await this.flattenFollowers(); }
    else if (this.ready) this.log("warn", "Arrêt : les positions des followers restent ouvertes, sans copie.");
    this.stopping = true; clearInterval(this.timer);
    Object.values(this.sessions).forEach((s) => s.stop());
  }
}

const newDeviceId = () => crypto.randomUUID();
module.exports = { Copier, mapSymbol, newDeviceId };
