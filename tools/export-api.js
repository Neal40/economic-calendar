/* Builds api/calendar.json from the app itself (same data it shows: news, NYSE holidays / early closes, earnings)
   so assistants and scheduled tasks can read the calendar. Run: node tools/export-api.js  (needs playwright + d3 from desktop/node_modules). */
const fs = require("fs"), path = require("path");
const { chromium } = require(process.env.PW || "playwright");
const root = path.join(__dirname, "..");
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.addInitScript(() => localStorage.clear());
  await p.route("**/d3.min.js", (r) => r.fulfill({ body: "window.d3={}", contentType: "text/javascript" }));
  await p.route(/^https?:/, (r) => r.abort());
  await p.goto("file://" + path.join(root, "index.html") + "#calendrier"); await p.waitForTimeout(500);
  const out = await p.evaluate(() => {
    const IMP = { high: "high", med: "medium", low: "low" }, KIND = { ev: "news", after: "earnings_after_close", pre: "earnings_pre_market", tbd: "earnings_time_tbd" };
    const days = {}, start = new Date(2026, 9, 1, 12), end = new Date(2027, 11, 31, 12);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const info = dayInfo(d), k = info.k, ev = (S.events[k] || []);
      const status = info.st === "closed" ? "nyse_closed" : info.st === "early" ? "early_close_1pm_et" : info.st === "bank" ? "bank_holiday_nyse_open" : null;
      if (!ev.length && !status) continue;
      days[k] = { ...(status ? { market: status, holiday: info.h ? info.h.name : null, note: info.note } : {}),
        events: ev.map((e) => ({ time_ny: e.t || null, name: e.n, impact: e.k && e.k !== "ev" ? null : IMP[e.i || "med"], kind: KIND[e.k || "ev"] || e.k })) };
    }
    return days;
  });
  await b.close();
  const json = { app: "Economic Calendar · @Neal_ICT", url: "https://neal40.github.io/economic-calendar/", timezone: "America/New_York", sources: ["Forex Factory", "NYSE", "Nasdaq"],
    generated_at: new Date().toISOString(), legend: { high: "rouge", medium: "orange", low: "jaune" }, days: out };
  fs.mkdirSync(path.join(root, "api"), { recursive: true });
  fs.writeFileSync(path.join(root, "api", "calendar.json"), JSON.stringify(json));
  console.log("api/calendar.json :", Object.keys(out).length, "jours");
})();
