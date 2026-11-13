const test = require("node:test");
const assert = require("node:assert");
const m = require("./marche");

test("slugOf / cleanInstrument", () => {
  assert.strictEqual(m.slugOf("EUR/USD"), "eurusd");
  assert.strictEqual(m.cleanInstrument(" Gold/USD "), "Gold/USD");
  assert.throws(() => m.cleanInstrument("<script>"));
});

test("parseBars : tri chronologique, doublons retirés", () => {
  const j = { data: [{ timestamp: 300, open: 1, high: 2, low: 0.5, close: 1.5 }, { timestamp: 100, open: 1, high: 1, low: 1, close: 1 }, { timestamp: 100, open: 1, high: 1, low: 1, close: 1 }, { timestamp: "x" }] };
  assert.deepStrictEqual(m.parseBars(j).map((b) => b.time), [100, 300]);
  assert.deepStrictEqual(m.parseBars(null), []);
});

test("bars : pagination par 200 avec to", async () => {
  const calls = [];
  const fake = async (url) => { calls.push(url); const to = +(new URL(url).searchParams.get("to") || 1000); const per = +new URL(url).searchParams.get("per_page");
    const data = []; for (let k = 0; k < per; k++) data.push({ timestamp: to - k, open: 1, high: 1, low: 1, close: 1 });
    return { ok: true, json: async () => ({ data }) }; };
  const b = await m.bars(fake, "EUR/USD", "M5", 450);
  assert.strictEqual(b.length, 450); assert.strictEqual(calls.length, 3);
  assert.ok(b.every((x, i) => i === 0 || x.time > b[i - 1].time));
  await assert.rejects(m.bars(fake, "EUR/USD", "X9", 10));
});

test("EXTRACT compile", () => { assert.doesNotThrow(() => new Function("return " + m.EXTRACT)); });
