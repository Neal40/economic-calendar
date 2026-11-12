/* Synchronisation des prop firms (Topstep, Apex, My Funded Futures) depuis l'app.
   Une fenêtre Electron (session « persist:propfirms », gardée entre les lancements) ouvre le dashboard de la prop firm ;
   si tu n'es pas connecté, elle s'affiche pour que tu te connectes (2FA compris), puis la récupération tourne en arrière-plan
   avec les mêmes appels que le dashboard (lecture seule : aucun clic d'achat, de reset ou de payout, aucune route qui modifie).
   Résultat fusionné dans Bureau\Inner Circle Trader\comptes\comptes.json (rien n'est supprimé : comptes, achats et preuves gardés). */
const { BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const PART = "persist:propfirms";
const FIRMS = {
  topstep: { name: "Topstep", url: "https://dashboard.topstep.com/dashboard/accounts", billing: "https://dashboard.topstep.com/dashboard/profile/billing",
    logged: `(async () => { try { const r = await fetch("https://api.topstep.com/me/accounts/basic", { credentials: "include" }); return r.status === 200; } catch (e) { return false; } })()` },
  apex: { name: "Apex", url: "https://dashboard.apextraderfunding.com/accounts/accountsHistory",
    logged: `(async () => { try { if (!/apextraderfunding\\.com$/.test(location.hostname)) return false; const t = await (await fetch("/accounts/accountsHistory", { credentials: "include" })).text(); return /Accounts History/i.test(t) && /<table/i.test(t) && !/type="password"/i.test(t); } catch (e) { return false; } })()` },
  mffu: { name: "My Funded Futures", url: "https://myfundedfutures.com/accounts", certs: "https://myfundedfutures.com/certificates",
    logged: `(async () => { try { const r = await fetch("https://api.myfundedfutures.com/api/user-prop-accounts/?page=1&page_size=1", { credentials: "include", headers: { "Accept": "application/json", "X-Tenant": "mffu" } }); return r.status === 200; } catch (e) { return false; } })()` },
};

/* ---------- scripts exécutés dans la page (ils écrivent leur avancement dans window.__ps) ---------- */
const TOPSTEP_ACCOUNTS = String.raw`(async () => { const P = window.__ps = { step: "Liste des comptes Topstep…", done: false };
  try { const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let cap = null;
    const oo = XMLHttpRequest.prototype.open, sh = XMLHttpRequest.prototype.setRequestHeader, sd = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; this.__h = {}; return oo.apply(this, arguments); };
    XMLHttpRequest.prototype.setRequestHeader = function (k, v) { this.__h[k] = v; return sh.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function (b) { if (/graphql/.test(this.__u) && /TraderAccounts/.test(String(b))) cap = { b, h: this.__h }; return sd.apply(this, arguments); };
    for (let k = 0; k < 40 && !cap; k++) { const btn = [...document.querySelectorAll("button")].find((x) => /Closed Accounts/i.test(x.textContent)); if (btn && k % 5 === 0) btn.click(); await sleep(500); }
    if (!cap) throw new Error("liste des comptes introuvable");
    const body = JSON.parse(cap.b); body.variables.first = 200;
    const nodes = (await (await fetch("https://crystal.topstep.com/graphql", { method: "POST", headers: cap.h, body: JSON.stringify(body) })).json()).data.accounts.nodes;
    const out = []; let i = 0;
    const one = async (n) => { const a = (await (await fetch("https://api.topstep.com/me/accounts/" + n.rowId + "?page=1&limit=1000", { credentials: "include" })).json()).account; out.push({ node: n, account: a }); P.step = "Comptes Topstep : " + (++i) + " / " + nodes.length; };
    for (let k = 0; k < nodes.length; k += 4) await Promise.all(nodes.slice(k, k + 4).map(one));
    let payouts = []; try { const j = await (await fetch("https://api.topstep.com/me/payouts?page=1&limit=200", { credentials: "include" })).json(); payouts = j.payoutRequests || []; } catch (e) {}
    P.result = { accounts: out, payouts }; } catch (e) { P.error = String(e.message || e); } P.done = true; })(); "ok"`;

const TOPSTEP_BILLING = String.raw`(async () => { const P = window.__ps = { step: "Achats Topstep…", done: false };
  try { const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const tableBy = (re, not) => [...document.querySelectorAll("main table")].find((t) => re.test(t.innerText) && !(not && not.test(t.innerText)));
    for (let k = 0; k < 40 && !tableBy(/REFERENCE/i, /MONTHLY/i); k++) await sleep(500);
    const read = async (re, not) => { const all = new Map(); const rows = () => { const t = tableBy(re, not); return t ? [...t.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.trim().replace(/\s+/g, " "))) : []; };
      const nav = () => { const t = tableBy(re, not); let n = t; for (let k = 0; k < 8 && n; k++) { n = n.parentElement; if (n && n.querySelector('button[aria-label="Go to next page"]') && n.querySelectorAll("table").length === 1) return n; } return null; };
      rows().forEach((r) => all.set(r.join("|"), r));
      for (const dir of ["Go to next page", "Go to previous page"]) for (let k = 0; k < 30; k++) { const b = nav() && [...nav().querySelectorAll('button[aria-label="' + dir + '"]')].pop(); if (!b || b.disabled) break; b.dispatchEvent(new MouseEvent("click", { bubbles: true })); await sleep(900); rows().forEach((r) => all.set(r.join("|"), r)); }
      return [...all.values()]; };
    const purchases = await read(/REFERENCE/i, /MONTHLY/i); P.step = "Abonnements Topstep…"; const subs = await read(/MONTHLY PRICE/i);
    P.result = { purchases, subs }; } catch (e) { P.error = String(e.message || e); } P.done = true; })(); "ok"`;

const APEX = (known) => String.raw`(async () => { const P = window.__ps = { step: "Liste des comptes Apex…", done: false }; const KNOWN = new Set(${JSON.stringify(known)});
  try { const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const hd = { credentials: "include", headers: { "X-Requested-With": "XMLHttpRequest" } };
    const getJ = async (u) => { for (let k = 0; k < 5; k++) { const r = await fetch(u, hd); if (r.status === 429) { P.step = "Apex limite les requêtes, pause…"; await sleep(15000 * (k + 1)); continue; } return await r.json(); } throw new Error("429"); };
    const page = async (u) => new DOMParser().parseFromString(await (await fetch(u, { credentials: "include" })).text(), "text/html");
    const rows = (d) => [...d.querySelectorAll("table tbody tr")].map((tr) => ({ c: [...tr.querySelectorAll("td")].map((td) => td.textContent.trim().replace(/\s+/g, " ")), a: [...tr.querySelectorAll("a[href]")].map((a) => new URL(a.getAttribute("href"), location.origin).href) }));
    const allPages = async (p) => { const seen = new Set([p]), q = [p], docs = []; while (q.length) { const u = q.shift(); const d = await page(u); docs.push(d); [...d.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /_p[=_]|[?&]page=/.test(h)).forEach((h) => { const x = new URL(h, location.origin + p); const k = x.pathname + x.search; if (!seen.has(k) && x.pathname === new URL(p, location.origin).pathname) { seen.add(k); q.push(k); } }); await sleep(1200); } return docs; };
    const H = new Map(); (await allPages("/accounts/accountsHistory")).forEach((d) => rows(d).forEach((r) => r.c[0] && H.set(r.c[0], r.c)));
    const out = []; let i = 0; const todo = [...H].filter(([a, r]) => !KNOWN.has(a) || !/expired/i.test(r[1]));
    for (const [a, r] of todo) { P.step = "Comptes Apex : " + (++i) + " / " + todo.length + (H.size > todo.length ? " (" + (H.size - todo.length) + " expirés déjà à jour)" : "");
      const d = await getJ("/member/account-details/get-account-data?account=" + encodeURIComponent(a)); await sleep(2500);
      let t = null; try { t = await getJ("/member/account-details/get-trading-details?account_number=" + encodeURIComponent(a)); } catch (e) {} await sleep(2500);
      let el = null; if (/^PA-/.test(a)) { try { el = await getJ("/member/account-details/get-payout-eligibility?account_number=" + encodeURIComponent(a)); } catch (e) {} await sleep(2500); }
      delete d.notifications; if (el) { delete el.root_url; if (el.account) { delete el.account.username; delete el.account.user_name; } }
      out.push({ id: a, histStatus: r[1], product: r[2], data: d, trading: t, payout: el }); }
    P.step = "Payouts et achats Apex…";
    const payouts = (await allPages("/PARequestPayout")).flatMap(rows).filter((r) => r.c.length > 5);
    const pay = (await allPages("/PaymentHistory")).flatMap(rows).filter((r) => r.c.length > 4).map((r) => r.c);
    const rec = (await allPages("/PurchaseReceipts")).flatMap(rows).filter((r) => r.c.length > 4).map((r) => r.c);
    P.result = { list: [...H.values()], accounts: out, payouts, pay, rec }; } catch (e) { P.error = String(e.message || e); } P.done = true; })(); "ok"`;

const MFFU = (skip) => String.raw`(async () => { const P = window.__ps = { step: "Liste des comptes My Funded Futures…", done: false }; const SKIP = new Set(${JSON.stringify(skip)});
  try { const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const H = { "Accept": "application/json", "Content-Type": "application/json", "X-Tenant": "mffu" }; const API = "https://api.myfundedfutures.com/api/";
    const req = async (p, b, get) => { for (let k = 0; k < 4; k++) { const r = await fetch(API + p + "/" + (get ? "?" + new URLSearchParams(b) : ""), { method: get ? "GET" : "POST", credentials: "include", headers: H, body: get ? undefined : JSON.stringify(b) }); if (r.status === 429) { await sleep(10000 * (k + 1)); continue; } if (!r.ok) return null; return (await r.json()).ok; } return null; };
    const list = []; for (let p = 1; p <= 20; p++) { const j = await req("user-prop-accounts", { page: p, page_size: 100 }, true); if (!j) break; list.push(...j.accounts); if (list.length >= j.total) break; }
    const full = []; let i = 0; const todo = list.filter((a) => !SKIP.has(a.id) || !a.ended_at);
    for (const a of todo) { P.step = "Comptes My Funded Futures : " + (++i) + " / " + todo.length + (list.length > todo.length ? " (" + (list.length - todo.length) + " terminés déjà à jour)" : ""); const id = a.id;
      const chart = await req("getChartData", { accountId: id, startDate: String(a.created_at).slice(0, 10), endDate: (a.ended_at || new Date().toISOString()).slice(0, 10) }); await sleep(400);
      const stats = await req("getStatsData", { accountId: id }); await sleep(400);
      const trades = []; for (let p = 1; p <= 50; p++) { const t = await req("getTradesPage", { accountId: id, page: p, page_size: 200, dataSource: "Elastic" }); await sleep(400); if (!t || !t.data) break;
        t.data.forEach((x) => trades.push({ open: x.entry_datetimes && x.entry_datetimes[0], close: x.close_datetimes && x.close_datetimes[x.close_datetimes.length - 1], side: x.short_long, asset: x.asset, qty: x.total_contracts, entry: x.avg_market_entry, exit: x.avg_market_close, gross: x.gross_profit, fees: x.commission_and_fees, net: x.net_profit, wl: x.winner_loser, day: x.close_date || x.open_date })); if (!t.next_page) break; }
      let wd = null; if (a.funded) { wd = await req("getWithdrawalChecklist", { accountId: id }, true); await sleep(400); if (wd) delete wd.account; }
      full.push({ id, chart, stats, trades, withdrawal: wd }); }
    P.step = "Payouts et achats My Funded Futures…";
    const pp = await req("getPastPayouts", { page: 1, page_size: 200 }, true); const receipts = await req("getReceipts", { page: 1, page_size: 1000 }); const subs = await req("getSubscriptions", { page: 1, page_size: 1000 });
    const certs = await req("getCertificates", { page: 1, page_size: 200, certificate_type: "Payout" });
    P.result = { list, full, payouts: (pp && pp.data && pp.data.past_payouts) || [], receipts: receipts || [], subs: (subs && subs.subscriptions) || [], certs: (certs && certs.certificates) || [] }; } catch (e) { P.error = String(e.message || e); } P.done = true; })(); "ok"`;

/* ---------- transformations (même format que les pages Comptes de l'app) ---------- */
const r2 = (x) => (x == null || isNaN(x) ? null : Math.round(+x * 100) / 100);
const money = (s) => +String(s).replace(/[^0-9.-]/g, "") || 0;
const usDate = (s) => { const m = /^(\d\d)\/(\d\d)\/(\d{4})(?: (\d\d):(\d\d) (AM|PM))?$/.exec(String(s || "").trim()); if (!m) return String(s || ""); if (!m[4]) return m[3] + "-" + m[1] + "-" + m[2]; const h = (+m[4] % 12) + (m[6] === "PM" ? 12 : 0); return m[3] + "-" + m[1] + "-" + m[2] + "T" + String(h).padStart(2, "0") + ":" + m[5]; };
const txtDate = (s) => { const d = new Date(String(s) + " 12:00 UTC"); return isNaN(d) ? String(s || "") : d.toISOString().slice(0, 10); };

function buildTopstep(A, B) {
  const KIND = { evaluation: "Challenge", "express-funded": "Funded", "live-funded": "Funded", practice: "Practice" }, STG = { evaluation: "Trading Combine", "express-funded": "Express Funded", "live-funded": "Live Funded", practice: "Practice" };
  const accounts = A.accounts.map(({ node: n, account: a }) => { const d = a.accountDetails || {}, st = (a.stats && a.stats.stats) || [];
    const status = d.status === "Passed" || n.status === "Passed" ? "Passed" : n.status === "Active" ? "Active" : n.status === "Ineligible" || d.closeReason === "ineligible" ? "Blown" : d.closeReason === "canceled-sub" ? "Closed (abonnement annulé)" : "Closed";
    return { id: String(n.rowId), name: n.accountName, subId: n.nmiSubscriptionId || n.subscriptionId || null, kind: KIND[n.stage] || n.stage, stage: STG[n.stage] || n.stage,
      type: (n.skuAccountDetails && n.skuAccountDetails.buyingPower) || (n.accountTemplateRelation && n.accountTemplateRelation.accountName) || "", accountType: (n.skuAccountDetails && n.skuAccountDetails.accountType) || "", status, closeReason: d.closeReason || null,
      start: n.startDate, startBalance: n.stage === "express-funded" ? 0 : +(d.startingBalance ?? 50000), balance: d.currentBalance != null ? +d.currentBalance : null, profitTarget: d.profitTarget ?? null, dll: d.dailyDrawdown ?? null, mll: d.maxDrawdown ?? null,
      minDays: d.minDays ?? null, consistency: d.consistencyRule ? d.consistencyTargetPercent : null, maxPos: d.maxPositionSize ?? null, platform: a.platform ? a.platform.name : null, products: a.products || [],
      days: st.map((x) => ({ d: String(x.tradeDate).slice(0, 10), pnl: r2(x.netPnL), gross: r2(x.totalPnL), n: x.totalTrades, c: x.totalContracts, fees: r2((x.totalFees || 0) + (x.totalCommissions || 0)), win: Math.round(x.winningTradePercentage || 0), hi: r2(x.pnlHigh), lo: r2(x.pnlLow), avgW: r2(x.avgWinningTrade), avgL: r2(x.avgLosingTrade), cw: x.maxConsecutiveWins, cl: x.maxConsecutiveLosses, durW: x.avgWinningDuration, durL: x.avgLosingDuration })),
      trades: (a.trades || []).map((t) => ({ t: t.timeStamp, day: String(t.tradeDay).slice(0, 10), id: t.id, side: t.action, size: t.lots, prod: t.contractName, price: t.price, fees: r2((t.fees || 0) + (t.commissions || 0)), pl: r2(t.pl) })), purchases: [] }; });
  const purchases = (B.purchases || []).filter((r) => r.length >= 4).map((r) => ({ date: usDate(r[0]), amount: money(r[1]), type: r[2], ref: r[3] }));
  const T = (s) => new Date(String(s).slice(0, 16) + "Z").getTime();
  purchases.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach((p) => { const pt = T(p.date), m = /Renewal ID:\s*(\d+)/.exec(p.type); let c = null;
    if (m) { const L = accounts.filter((a) => String(a.subId) === m[1] && a.kind === "Challenge" && T(a.start) <= pt); c = L.sort((x, y) => String(y.start).localeCompare(String(x.start)))[0]; }
    else { const want = /Activation/i.test(p.type) ? "Funded" : "Challenge"; let L = accounts.filter((a) => a.kind === want && Math.abs(T(a.start) - pt) <= 180000); const free = L.filter((a) => !a.purchases.some((q) => !/Renewal/.test(q.type))); L = free.length ? free : L; c = L.sort((x, y) => Math.abs(T(x.start) - pt) - Math.abs(T(y.start) - pt))[0]; }
    if (c) { c.purchases.push(p); p.account = c.name; } });
  accounts.forEach((a) => (a.paid = r2(a.purchases.reduce((s, p) => s + p.amount, 0)) || 0));
  const payouts = (A.payouts || []).map((p) => ({ account: p.accountName || p.platformAccount || String(p.accountId || ""), requested: String(p.createdAt || p.requestedAt || "").slice(0, 10), amount: p.amount ?? p.requestedAmount ?? null, paid: /paid|complete|approved/i.test(p.status || "") ? (p.payoutAmount ?? p.amount ?? null) : null, finalized: String(p.processedAt || p.updatedAt || "").slice(0, 10) || null, tradingDays: p.tradingDays ?? null, accountStatus: p.accountStatus || "—", requestStatus: p.status || null, proof: null }));
  const subscriptions = (B.subs || []).filter((r) => r.length >= 4).map((r) => ({ id: r[0], status: r[1], price: money(r[2]), start: r[3], next: r[4] || null }));
  return { accounts, payouts, purchases, subscriptions };
}

function buildApex(R, old) {
  const oldAcc = new Map(((old && old.accounts) || []).map((a) => [a.id, a]));
  const pay = new Map(); (R.pay || []).forEach((c) => pay.set(c[0], { ref: c[0], amount: money(c[1]), date: txtDate(c[2]), kind: c[4] }));
  const rec = new Map(); (R.rec || []).forEach((c) => rec.set(c[0], { status: c[2], terms: c[4] }));
  const purchases = [...pay.values()].map((p) => { const x = rec.get(p.ref) || {}, t = String(x.terms || ""), m = /-\s*(.*?)(Account:\s*(\S+))?$/.exec(t); return { date: p.date, amount: /refund/i.test(p.kind) ? -Math.abs(p.amount) : p.amount, type: (m && m[1] ? m[1].trim() : t) || p.kind, account: (m && m[3]) || null, ref: p.ref, billing: x.status || null }; });
  const accounts = (R.accounts || []).map((it) => { const a = it.id, d = it.data || {}, ac = d.account || {}, pr = d.product || {}, t = it.trading || {}, po = it.payout, isPA = /^PA-/.test(a);
    const sess = (t.trading_sessions || []).map((s) => ({ d: s.TradeDate, bal: r2(s.AcctBal), pnl: r2(s.ClosedPnl), fills: s.Fills })).sort((x, y) => String(x.d).localeCompare(String(y.d)));
    const init = ac.initial_balance || pr.balance; let status = ac.status || it.histStatus; if (!isPA && ac.current_balance != null && init && pr.profit_target && ac.current_balance >= init + pr.profit_target) status = "Passed";
    const acc = { id: a, name: a, kind: isPA ? "Funded" : "Challenge", stage: isPA ? "PA (Performance Account)" : "Evaluation", type: it.product, status, histStatus: it.histStatus, start: sess[0] ? sess[0].d : "", startBalance: init, balance: ac.current_balance, profitTarget: pr.profit_target,
      summary: { initial: init, current: ac.current_balance, totalProfit: r2(ac.total_profit), daysTraded: ac.days_traded, minPayout: pr.payout_balance, liquidation: ac.drawdown_threshold, peak: ac.peak_balance, lastActivity: sess.length ? sess[sess.length - 1].d : null, dormancy: ac.dormant_pa },
      requirements: { profitTarget: pr.profit_target, passedThreshold: pr.passed_threshold, minDays: pr.min_trading_days, minDailyProfit: pr.min_daily_profit, consistency: pr.max_daily_profit_percent, blownThreshold: pr.blown_threshold },
      sessions: sess, days: sess.map((s) => ({ d: s.d, pnl: s.pnl, n: s.fills })), violations: (t.violations || []).length };
    if (po) { const el = po.eligibility || {}, pa = po.account || {}, ck = po.payout_check || {}, wf = po.windfall, per = d.payout_periods || [], prog = per.length ? per[per.length - 1].progression || [] : [];
      acc.payout = { eligible: !!el.is_eligible, rules: (el.summary || []).map((r) => ({ rule: r.rule, passed: !!r.passed, detail: String(r.detail || "").replace(/<br>/g, " · ") })), info: { status: pa.status, current: pa.current_balance, lifetime: r2(pa.total_profit), approved: (po.payout_history || []).length, minPayout: pa.min_payout },
        check: { lastPayout: ck.last_payout, lastViolation: ck.last_violation, lastIgnored: ck.last_ignored_session }, windfall: wf ? { percent: wf.consistency_percent, total: r2(wf.total_profit), highest: r2(wf.highest_day_profit), minNeeded: r2(wf.minimum_profit_needed) } : null,
        history: (po.payout_history || []).map((h) => ({ date: h.requested_at || h.created_at || h.date, amount: h.amount || h.requested_amount, status: h.status })),
        progression: prog.filter((g) => (g.type || "historical") === "historical").map((g) => ({ day: g.day, date: g.date, eod: r2(g.eod_balance), pnl: r2(g.daily_profit), progress: g.profit_target ? g.total_profit / g.profit_target * 100 : null, minBal: !!g.meets_min_balance,
          profitDays: ((g.min_profit_days_rule_cell || {}).count ?? "—") + "/" + ((g.min_profit_days_rule_cell || {}).required ?? "—"), tradingDays: ((g.min_trading_days_cell || {}).count ?? "—") + "/" + ((g.min_trading_days_cell || {}).required ?? "—"), consistency: !!g.consistency_rule_met, dayPct: (g.total_profit || 0) > 0 ? g.day_pnl_percent : null, violation: !!g.is_violation })) }; }
    return acc; });
  const seen = new Set(accounts.map((a) => a.id)); (R.list || []).forEach((r) => { if (!seen.has(r[0]) && oldAcc.has(r[0])) accounts.push(oldAcc.get(r[0])); });
  accounts.forEach((a) => { a.purchases = purchases.filter((p) => p.account === a.id); a.paid = r2(a.purchases.reduce((s, p) => s + p.amount, 0)) || 0; });
  const payouts = (R.payouts || []).map((r) => ({ account: r.c[0], num: +r.c[1], requested: txtDate(r.c[2]), amount: money(r.c[3]), paid: /paid/i.test(r.c[5]) ? money(r.c[3]) : null, tradingDays: +r.c[4], requestStatus: r.c[5], finalized: txtDate(r.c[6]), accountStatus: r.c[7], proof: r.a[0] || null }));
  const subscriptions = [...rec.entries()].filter(([, x]) => /active/i.test(x.status || "") && !/cancel/i.test(x.status || "")).map(([id, x]) => ({ id, status: x.status, price: money((/\$[\d.,]+/.exec(x.terms || "") || ["0"])[0]), start: (pay.get(id) || {}).date || "", next: null }));
  return { accounts, payouts, purchases, subscriptions };
}

function buildMffu(R, old, proofs) {
  const FULL = new Map((R.full || []).map((x) => [x.id, x])), oldAcc = new Map(((old && old.accounts) || []).map((a) => [a.id, a]));
  const purchases = (R.receipts || []).filter((r) => r.processed || r.status === "Processed").map((r) => ({ date: String(r.created_at || "").slice(0, 16), amount: r2(r.price_paid) || 0, type: (r.plan || "") + (r.newAccountName ? " (reset)" : ""), ref: r.order_number, account: r.newAccountName || r.accountName, status: r.status }));
  const accounts = (R.list || []).map((a) => { const f = FULL.get(a.id); if (!f && oldAcc.has(a.id)) return { ...oldAcc.get(a.id), status: a.status, balance: a.balance, ended: a.ended_at };
    const ch = (f && f.chart) || {}, st = (f && f.stats) || null, tr = (f && f.trades) || [], wd = f && f.withdrawal, days = {};
    tr.forEach((t) => { const d = t.day || (t.open ? new Date(t.open).toISOString().slice(0, 10) : null); if (!d) return; const x = days[d] || (days[d] = { d, pnl: 0, n: 0, c: 0, fees: 0, w: 0, hi: null, lo: null }); const net = +t.net || 0;
      x.pnl += net; x.n++; x.c += +t.qty || 0; x.fees += +t.fees || 0; if (net > 0) x.w++; x.hi = x.hi == null ? net : Math.max(x.hi, net); x.lo = x.lo == null ? net : Math.min(x.lo, net); });
    const prod = a.product || {}, pu = purchases.filter((p) => p.account === a.account_name);
    return { id: a.id, name: a.account_name, number: a.account_id, kind: a.funded || a.stage !== "Evaluation" ? "Funded" : "Challenge", stage: a.stage, type: prod.category || prod.description, plan: prod.description || prod.category, status: a.status,
      start: a.created_at, ended: a.ended_at, startBalance: a.starting_balance, balance: a.balance, profitTarget: a.profit_target, mll: a.max_drawdown_amount, minBalance: a.minimum_balance, dll: a.daily_loss_limit || null, broker: a.broker, platform: a.platform, drawdownMode: a.drawdown_mode,
      maxPos: a.max_position_size, maxPosMicros: a.max_position_size_micros, consistency: a.consistency_rule ? a.consistency_percentage : null, minDays: a.minimum_trading_days, minWithdrawal: a.minimum_withdrawal_amount,
      chart: { dates: ch.dates || [], series: Object.fromEntries((ch.data || []).map((s) => [s.label, s.data])), max: ch.max_balance, min: ch.min_balance },
      stats: st ? Object.fromEntries(["trade_count", "highest_dollar_profit", "highest_dollar_loss", "max_consecutive_wins", "max_consecutive_losses", "avg_trades_per_day", "total_gross_profit", "total_commissions", "total_net_profit", "max_drawdown_pnl", "sharpe_ratio", "sortino_ratio"].map((k) => [k, st[k]])) : null,
      checklist: wd && wd.summary ? { eligible: wd.summary.eligible, total: wd.summary.total_requirements, passed: wd.summary.passed_requirements, groups: wd.checklist || {} } : null,
      days: Object.values(days).sort((x, y) => x.d.localeCompare(y.d)).map((x) => ({ d: x.d, pnl: r2(x.pnl), n: x.n, c: x.c, fees: r2(x.fees), win: x.n ? Math.round(x.w / x.n * 100) : 0, hi: r2(x.hi), lo: r2(x.lo) })),
      trades: tr, paid: r2(pu.reduce((s, p) => s + p.amount, 0)) || 0, purchases: pu }; });
  const byName = new Map(accounts.map((a) => [a.name, a.status])), cnt = {}, cert = new Map((R.certs || []).map((c) => [c.account_name + "|" + String(c.date).slice(0, 10), c]));
  const payouts = (R.payouts || []).slice().sort((x, y) => String(x.created_at).localeCompare(String(y.created_at))).map((p) => { const nm = p.accountName; cnt[nm] = (cnt[nm] || 0) + 1;
    const c = cert.get(nm + "|" + String(p.created_at || p.date).slice(0, 10)) || (R.certs || []).find((x) => x.account_name === nm);
    return { account: nm, num: cnt[nm], requested: String(p.date || p.created_at || "").slice(0, 10), amount: p.amount, paid: p.client_payout, share: p.payout_rule, finalized: String(p.funds_sent_at || "").slice(0, 10) || null, tradingDays: null, accountStatus: byName.get(nm) || "—", requestStatus: p.status, certificate: c ? c.unique_id : null, proof: (c && proofs[c.unique_id]) || null }; });
  const subscriptions = (R.subs || []).map((s) => ({ id: s.id, status: s.active ? "Active" : s.auto_renew ? "Inactive" : "Cancelled", price: s.renewal_price, start: String(s.started || s.created_at || "").slice(0, 10), next: String(s.next_payment || "").slice(0, 10) || null, plan: s.plan }));
  return { accounts, payouts, purchases, subscriptions };
}

/* fusion : on ne perd jamais un compte, un achat ni une preuve */
function merge(oldF, newF) {
  if (!oldF) return newF; const byId = new Map((oldF.accounts || []).map((a) => [String(a.id), a])); (newF.accounts || []).forEach((a) => byId.set(String(a.id), a));
  const pk = (p) => p.ref || p.date + "|" + p.amount + "|" + p.type, pur = new Map((oldF.purchases || []).map((p) => [pk(p), p])); (newF.purchases || []).forEach((p) => pur.set(pk(p), p));
  const yk = (p) => p.account + "|" + p.requested + "|" + p.amount, pay = new Map((oldF.payouts || []).map((p) => [yk(p), p])); (newF.payouts || []).forEach((p) => { const o = pay.get(yk(p)); pay.set(yk(p), o && o.proof && !p.proof ? { ...p, proof: o.proof, certificate: p.certificate || o.certificate } : p); });
  return { accounts: [...byId.values()], payouts: [...pay.values()], purchases: [...pur.values()], subscriptions: (newF.subscriptions || []).length ? newF.subscriptions : oldF.subscriptions || [] };
}

/* ---------- fenêtre et déroulé ---------- */
let busy = null;
function makeWin(parent) { return new BrowserWindow({ width: 1400, height: 900, show: false, title: "Connexion prop firm", autoHideMenuBar: true, parent: parent || undefined, paintWhenInitiallyHidden: true, webPreferences: { partition: PART, contextIsolation: true, sandbox: true, backgroundThrottling: false } }); }
const load = (w, url) => new Promise((ok) => { w.webContents.once("did-stop-loading", ok); w.loadURL(url).catch(() => ok()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function runScript(w, code, progress) { await w.webContents.executeJavaScript(code, true); for (;;) { await sleep(1500); if (w.isDestroyed()) throw new Error("fenêtre fermée"); const p = await w.webContents.executeJavaScript("window.__ps ? { step: window.__ps.step, done: window.__ps.done, error: window.__ps.error } : null", true); if (p && p.step) progress(p.step); if (p && p.done) { if (p.error) throw new Error(p.error); return w.webContents.executeJavaScript("window.__ps.result", true); } } }

async function ensureLogin(w, F, progress) {
  await load(w, F.url); await sleep(3000);
  const ok = async () => { try { return await w.webContents.executeJavaScript(F.logged, true); } catch (e) { return false; } };
  if (await ok()) return true;
  progress("Connecte-toi à " + F.name + " dans la fenêtre qui vient de s'ouvrir (code 2FA compris)…"); w.setTitle("Connexion " + F.name + " — Inner Circle Trader"); w.show(); w.focus();
  const until = Date.now() + 10 * 60 * 1000;
  while (Date.now() < until && !w.isDestroyed()) { await sleep(2500); if (await ok()) { w.hide(); await load(w, F.url); await sleep(2500); return true; } }
  return false;
}

async function captureCerts(w, F, certs, progress) { // preuves de payout MFFU : capture de chaque certificat affiché sur la page Certificates
  const proofs = {}; if (!certs.length) return proofs;
  try { progress("Preuves de payout My Funded Futures…"); w.setSize(1920, 1080); await load(w, F.certs); await sleep(4000);
    await w.webContents.executeJavaScript(`(async () => { const t = [...document.querySelectorAll("button,[role=tab]")].find((e) => /^PAYOUT$/i.test(e.textContent.trim())); t && t.click(); await new Promise((r) => setTimeout(r, 2500)); return true; })()`, true);
    const n = await w.webContents.executeJavaScript(`(() => { const m = document.querySelector("main") || document.body; const L = [...m.querySelectorAll("*")].filter((e) => e.children.length === 0 && /^Certificate #$/i.test(e.textContent.trim())); window.__cards = L.map((l) => { let n = l; while (n && n.parentElement && !(n.getBoundingClientRect().width > 450 && /FOR THE AMOUNT OF/i.test(n.textContent))) n = n.parentElement; return n; }); return window.__cards.length; })()`, true);
    for (let i = 0; i < n; i++) { const r = await w.webContents.executeJavaScript(`(async () => { const c = window.__cards[${i}]; c.scrollIntoView({ block: "center" }); await new Promise((r) => setTimeout(r, 600)); const b = c.getBoundingClientRect(); const id = (c.textContent.match(/Certificate #\\s*([A-Za-z0-9]+?)(?:Account|$)/) || [])[1]; return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), id }; })()`, true);
      if (!r || !r.id) continue; const img = await w.webContents.capturePage({ x: r.x, y: r.y, width: r.w, height: r.h }); if (!img.isEmpty()) proofs[r.id] = "data:image/jpeg;base64," + img.toJPEG(82).toString("base64"); }
  } catch (e) { /* les preuves déjà enregistrées sont gardées */ }
  return proofs;
}

async function run(firm, opts) {
  const F = FIRMS[firm]; if (!F) return { ok: false, reason: "prop firm inconnue" }; if (busy) return { ok: false, reason: "une synchronisation est déjà en cours (" + busy + ")" };
  busy = F.name; const progress = (t) => { try { opts.onProgress && opts.onProgress({ firm, text: t }); } catch (e) {} };
  const file = path.join(opts.dir, "comptes.json"); let all = {}; try { all = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) {}
  const w = makeWin(opts.parent);
  try {
    progress("Ouverture de " + F.name + "…"); if (!(await ensureLogin(w, F, progress))) return { ok: false, reason: "connexion à " + F.name + " non faite (fenêtre fermée ou délai dépassé)" };
    let data;
    if (firm === "topstep") { const A = await runScript(w, TOPSTEP_ACCOUNTS, progress); await load(w, F.billing); await sleep(3000); const B = await runScript(w, TOPSTEP_BILLING, progress); data = buildTopstep(A, B); }
    else if (firm === "apex") { const known = ((all.apex && all.apex.accounts) || []).filter((a) => /expired/i.test(a.histStatus || "")).map((a) => a.id); data = buildApex(await runScript(w, APEX(known), progress), all.apex); }
    else { const skip = ((all.mffu && all.mffu.accounts) || []).filter((a) => a.ended).map((a) => a.id); const R = await runScript(w, MFFU(skip), progress); const have = new Set(((all.mffu && all.mffu.payouts) || []).filter((p) => p.proof).map((p) => p.certificate));
      const proofs = await captureCerts(w, F, (R.certs || []).filter((c) => !have.has(c.unique_id)), progress); data = buildMffu(R, all.mffu, proofs); }
    progress("Enregistrement…"); all[firm] = merge(all[firm], data); all.updated = new Date().toISOString();
    fs.mkdirSync(opts.dir, { recursive: true }); if (fs.existsSync(file)) fs.copyFileSync(file, path.join(opts.dir, "comptes.backup.json"));
    fs.writeFileSync(file + ".tmp", JSON.stringify(all)); fs.renameSync(file + ".tmp", file);
    const f = all[firm]; return { ok: true, data: all, counts: { accounts: f.accounts.length, payouts: f.payouts.length, purchases: f.purchases.length } };
  } catch (e) { return { ok: false, reason: String(e.message || e) }; }
  finally { busy = null; try { if (!w.isDestroyed()) w.destroy(); } catch (e) {} }
}

module.exports = { run, buildTopstep, buildApex, buildMffu, merge, scripts: { TOPSTEP_ACCOUNTS, TOPSTEP_BILLING, APEX, MFFU } };
