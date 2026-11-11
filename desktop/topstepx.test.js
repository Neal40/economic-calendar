const test = require("node:test"), assert = require("node:assert");
const { mergeDb, buildAccount } = require("./topstepx");

test("mergeDb : une synchro ne supprime jamais un compte ni un trade déjà enregistré", () => {
  const old = { comptes: [{ "ID TopstepX": "1", Nom: "A", Statut: "Actif" }, { "ID TopstepX": "2", Nom: "Passé", Statut: "Passé" }],
    trades: [{ ID: "10", "ID TopstepX": "1", "Net P&L": 5 }, { ID: "20", "ID TopstepX": "2", "Net P&L": 7 }], syncedAt: "2026-11-01T00:00:00Z" };
  const fresh = { comptes: [{ "ID TopstepX": "1", Nom: "A", Statut: "Actif", "Solde TopstepX": 1 }, { "ID TopstepX": "3", Nom: "Nouveau", Statut: "Actif" }],
    trades: [{ ID: "10", "ID TopstepX": "1", "Net P&L": 6 }, { ID: "30", "ID TopstepX": "3", "Net P&L": 1 }], syncedAt: "2026-11-07T00:00:00Z" };
  const m = mergeDb(old, fresh);
  assert.deepStrictEqual(m.comptes.map((c) => c["ID TopstepX"]).sort(), ["1", "2", "3"]);
  assert.strictEqual(m.comptes.find((c) => c["ID TopstepX"] === "2").Statut, "Passé");
  assert.strictEqual(m.comptes.find((c) => c["ID TopstepX"] === "1")["Solde TopstepX"], 1); // données fraîches prioritaires
  assert.deepStrictEqual(m.trades.map((t) => t.ID).sort(), ["10", "20", "30"]);
  assert.strictEqual(m.trades.find((t) => t.ID === "10")["Net P&L"], 6);
  assert.strictEqual(m.syncedAt, fresh.syncedAt);
});

test("mergeDb : un compte actif disparu de TopstepX est archivé", () => {
  const m = mergeDb({ comptes: [{ "ID TopstepX": "9", Statut: "Actif" }], trades: [] }, { comptes: [], trades: [], syncedAt: "x" });
  assert.strictEqual(m.comptes[0].Statut, "Archivé"); assert.strictEqual(m.comptes[0].Archivé, true);
});

test("buildAccount : statut et PDLL d'après TopstepX (verrouillé pour la journée = actif, ineligible = cramé)", () => {
  const xfa = { accountId: 1, accountName: "EXPRESS-V2-DLL-123", startingBalance: 0, balance: -512.92, highestBalance: 0, maximumLoss: -2000, dailyLoss: 1000, personalDailyLossLimit: 500, status: 1, ineligible: false };
  const st = (a) => { const c = buildAccount(a, [], "x"); return [c.Type, c.Statut, c["Verrouillé"], c.PDLL]; };
  assert.deepStrictEqual(st(xfa), ["Funded", "Actif", true, 500]);                                   // PDLL touchée : verrouillé, pas cramé
  assert.deepStrictEqual(st({ ...xfa, status: 0 }), ["Funded", "Actif", false, 500]);
  assert.deepStrictEqual(st({ ...xfa, status: 6, ineligible: true, balance: -2100 }), ["Funded", "Cramé", false, 500]);
  assert.deepStrictEqual(st({ ...xfa, status: 3, ineligible: undefined }), ["Funded", "Actif", false, 500]);   // status inconnu : funded au-dessus du plancher MLL
  assert.deepStrictEqual(st({ ...xfa, status: 3, ineligible: undefined, balance: -2000 }), ["Funded", "Cramé", false, 500]);
  const tc = { accountId: 2, accountName: "50KTC-SKU-V2-1", startingBalance: 50000, balance: 48078.16, maximumLoss: 48000, status: 6, ineligible: true };
  assert.deepStrictEqual(st(tc), ["Challenge", "Cramé", false, null]);
  assert.deepStrictEqual(st({ ...tc, status: 1, ineligible: false, balance: 49500 }), ["Challenge", "Actif", true, null]); // challenge verrouillé pour la journée
});
