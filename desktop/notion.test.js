const test = require("node:test"), assert = require("node:assert");
const { changedSince } = require("./notion");

// faux Notion : une base dont la dernière modif date de 10:00 (arrondie à la minute comme Notion), pages = ids
const fake = (ids) => async (url) => ({ ok: true, json: async () => (url.includes("filter_properties")
  ? { results: ids.map((id) => ({ id })), has_more: false }
  : { results: [{ id: ids[0], last_edited_time: "2026-11-07T10:00:00.000Z" }] }) });

test("changedSince : modif dans la minute de la dernière synchro détectée", async () => {
  const r = await changedSince("t", fake(["a", "b"]), [{ db: "D" }], "2026-11-07T10:00:30Z");
  assert.strictEqual(r.changed, true);
});

test("changedSince : rien de nouveau -> pas de changement", async () => {
  const r = await changedSince("t", fake(["a", "b"]), [{ db: "D", ids: ["a", "b"] }], "2026-11-07T10:05:00Z");
  assert.strictEqual(r.changed, false);
});

test("changedSince : ligne supprimée dans Notion détectée via la liste des IDs", async () => {
  const r = await changedSince("t", fake(["a"]), [{ db: "D", ids: ["a", "b"] }], "2026-11-07T10:05:00Z");
  assert.strictEqual(r.changed, true); assert.strictEqual(r.list, true);
});
