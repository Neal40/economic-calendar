const test = require("node:test"), assert = require("node:assert");
const { mergeDb } = require("./topstepx");

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
