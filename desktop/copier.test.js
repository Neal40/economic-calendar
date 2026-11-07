// node --test : logique de position du trade copier, sans réseau (sessions simulées)
const test = require("node:test");
const assert = require("node:assert");
const { Copier, mapSymbol } = require("./copier");

function make({ dry = true, multiplier = 1, max = 5, symbol_map = { NQ: "MNQ" }, flatten = false } = {}) {
  const cfg = {
    dry_run: dry, flatten_followers_on_exit: flatten,
    logins: { lead: { environment: "demo" }, foll: { environment: "demo" } },
    leader: { login: "lead" }, followers: [{ login: "foll", multiplier, max_contracts: max, symbol_map }],
  };
  const c = new Copier(cfg, "dev", () => {});
  const f = c.followers[0], orders = [];
  c.leaderAid = 1; f.aid = 2; f.label = "foll/2";
  c.leader.synced = true; f.session.synced = true;
  f.session.placeMarket = async (aid, sym, qty) => { orders.push({ aid, sym, qty }); return orders.length; };
  return { c, f, orders, setLead: (sym, n) => c.leader.positions.set("1|" + sym, n), setFoll: (sym, n) => f.session.positions.set("2|" + sym, n) };
}

test("mapSymbol remplace la racine et garde l'échéance", () => {
  assert.strictEqual(mapSymbol("NQZ6", { NQ: "MNQ" }), "MNQZ6");
  assert.strictEqual(mapSymbol("ESZ6", { NQ: "MNQ" }), "ESZ6");
});

test("target : multiplicateur arrondi, plafond max, même sens", () => {
  const { c, f } = make({ multiplier: 1.5, max: 2 });
  assert.strictEqual(c.target(f, 1), 2);  // 1 x 1.5 = 1.5 -> 2
  assert.strictEqual(c.target(f, -1), -2);
  assert.strictEqual(c.target(f, 3), 2);  // 4.5 -> 5, plafonné à 2
  assert.strictEqual(c.target(f, 0), 0);
});

test("plan : copie la position du leader avec le mapping", async () => {
  const { c, setLead } = make();
  setLead("NQZ6", 2);
  const p = await c.plan();
  assert.deepStrictEqual(p.map((x) => [x.sym, x.qty]), [["MNQZ6", 2]]);
});

test("plan : leader revenu à plat -> le follower est fermé", async () => {
  const { c, setLead, setFoll } = make();
  setLead("NQZ6", 2); await c.plan();       // le symbole devient actif
  setLead("NQZ6", 0); setFoll("MNQZ6", 2);
  const p = await c.plan();
  assert.deepStrictEqual(p.map((x) => [x.sym, x.qty]), [["MNQZ6", -2]]);
});

test("plan : rien tant que le leader n'est pas synchronisé", async () => {
  const { c, setLead } = make();
  setLead("NQZ6", 2); c.leader.synced = false;
  assert.deepStrictEqual(await c.plan(), []);
});

test("dry_run n'envoie aucun ordre", async () => {
  const { c, orders, setLead } = make({ dry: true });
  setLead("NQZ6", 1); c.ready = true;
  await c.reconcile();
  assert.strictEqual(orders.length, 0);
});

test("stop() attend la fermeture des followers (flatten_followers_on_exit)", async () => {
  const { c, orders, setLead, setFoll } = make({ dry: false, flatten: true });
  setLead("NQZ6", 1); await c.plan(); setFoll("MNQZ6", 1); c.ready = true;
  await c.stop();
  assert.deepStrictEqual(orders, [{ aid: 2, sym: "MNQZ6", qty: -1 }]);
});
