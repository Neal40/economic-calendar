// TopstepX → local journal database (comptes + trades), used by the Electron main process.
// Reads the user's own TopstepX session (userapi.topstepx.com) and rebuilds the stats per account.
"use strict";

const API = "https://userapi.topstepx.com";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const r2 = (v) => Math.round(v * 100) / 100;
const r6 = (v) => Math.round(v * 1e6) / 1e6;

function durTxt(s) { s = Math.round(s || 0); return `${Math.floor(s / 60)} min ${s % 60} sec`; }
function parisStamp(iso) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.month}/${p.day}/${p.year} ${p.hour === "24" ? "00" : p.hour}:${p.minute}:${p.second}`;
}
function acctName(a) {
  const k = Math.round((a.startingBalance || 0) / 1000);
  const last4 = String(a.accountName || a.accountId).slice(-4);
  return `Topstep ${k}K …${last4}` + (a.nickname ? ` « ${a.nickname} »` : "");
}

/** Account type from the TopstepX account name (PRAC = practice, EXPRESS/XFA = funded, otherwise Trading Combine). */
function acctType(a) { const n = String(a.accountName || ""); if (/PRAC/i.test(n)) return "Paper"; if (/EXPRESS|XFA|FUNDED|LIVE|\bEFA/i.test(n)) return "Funded"; return "Challenge"; }

/** API trade → journal row (one per entry). positionSize is the closing side: negative = long position. */
function toRow(t) {
  const entry = new Date(t.createdAt), exit = new Date(t.exitedAt);
  const net = r2((t.pnL || 0) - (t.fees || 0) - (t.commissions || 0));
  return {
    ID: String(t.id), "ID TopstepX": String(t.accountId), Day: String(t.tradeDay || t.createdAt).slice(0, 10),
    Contract: t.contractDisplayName || String(t.contractId || "").split(".").pop(),
    Symbol: String(t.symbolId || "").split(".").pop(),
    Direction: (t.positionSize || 0) < 0 ? "Long" : "Short", Size: Math.abs(t.positionSize || 0),
    Entry: entry.toISOString().replace(/\.\d+Z$/, "Z"), Exit: exit.toISOString().replace(/\.\d+Z$/, "Z"),
    "Duration (s)": Math.max(0, Math.round((exit - entry) / 1000)),
    "Entry Price": t.entryPrice, "Exit Price": t.exitPrice, "P&L": t.pnL, Fees: t.fees, Commissions: t.commissions, "Net P&L": net,
  };
}

/** Account + its rows → stats row (same fields as the Stats TopstepX dashboard). Also sets end-of-day balance on rows. */
function buildAccount(a, rows, syncedAt) {
  rows.sort((x, y) => x.Entry.localeCompare(y.Entry));
  let bal = a.startingBalance || 0;
  rows.forEach((t, i) => { bal = r2(bal + t["Net P&L"]); if (!rows[i + 1] || rows[i + 1].Day !== t.Day) t["Solde fin de journée"] = bal; });
  const n = rows.length, wins = rows.filter((t) => t["Net P&L"] > 0), losses = rows.filter((t) => t["Net P&L"] <= 0);
  const sum = (arr, k) => arr.reduce((s, t) => s + (typeof k === "function" ? k(t) : t[k]), 0);
  const gains = sum(wins, "Net P&L"), lossSum = sum(losses, "Net P&L"), total = r2(sum(rows, "Net P&L"));
  const byDay = new Map(); rows.forEach((t) => byDay.set(t.Day, (byDay.get(t.Day) || 0) + t["Net P&L"]));
  const lastDay = [...byDay.keys()].sort().pop(), lastRows = rows.filter((t) => t.Day === lastDay);
  const wd = new Map(); // weekday → {days:Set, n, pnl}
  rows.forEach((t) => { const d = DAYS[new Date(t.Day + "T12:00:00Z").getUTCDay()]; const o = wd.get(d) || { days: new Set(), n: 0, pnl: 0 }; o.days.add(t.Day); o.n++; o.pnl += t["Net P&L"]; wd.set(d, o); });
  const wds = [...wd.entries()];
  const active = wds.sort((x, y) => y[1].n - x[1].n)[0], best = [...wds].sort((x, y) => y[1].pnl - x[1].pnl)[0], worst = [...wds].sort((x, y) => x[1].pnl - y[1].pnl)[0];
  const bestT = [...rows].sort((x, y) => y["Net P&L"] - x["Net P&L"])[0], worstT = [...rows].sort((x, y) => x["Net P&L"] - y["Net P&L"])[0];
  const det = (t) => t ? `${t.Direction} ${t.Size} /${t.Symbol || t.Contract} @ ${t["Entry Price"]} · Exited @ ${t["Exit Price"]} · ${parisStamp(t.Entry)}` : "";
  const avgDur = (arr) => (arr.length ? sum(arr, "Duration (s)") / arr.length : 0);
  const bestDay = byDay.size ? Math.max(...byDay.values()) : 0;
  return {
    Nom: acctName(a), "ID TopstepX": String(a.accountId), "Nom TopstepX": String(a.accountName || ""), Type: acctType(a), Statut: a.status === 0 ? "Actif" : "Cramé",
    "Solde de départ": a.startingBalance, "Solde TopstepX": r2(a.balance), "Plus haut solde": r2(a.highestBalance ?? a.balance),
    "Plancher MLL": r2(a.maximumLoss ?? 0), DLL: a.dailyLoss ?? null, "Dernière synchro": syncedAt,
    "Total P&L": total, "Trade Win %": n ? r6(wins.length / n) : 0,
    "Day Win %": lastRows.length ? r6(lastRows.filter((t) => t["Net P&L"] > 0).length / lastRows.length) : 0,
    "Avg Winning Trade": wins.length ? r2(gains / wins.length) : 0, "Avg Losing Trade": losses.length ? r2(lossSum / losses.length) : 0,
    "Avg Win / Avg Loss": wins.length && losses.length && lossSum ? r2((gains / wins.length) / Math.abs(lossSum / losses.length)) : 0,
    "Profit Factor": lossSum ? r2(gains / Math.abs(lossSum)) : 0,
    "Best Day % of Total Profit": total ? r6(bestDay / total) : 0,
    "Most Active Day": active ? `${active[0]} · ${active[1].days.size} jour(s) actif(s) · ${active[1].n} trades` : "",
    "Most Profitable Day": best ? `${best[0]} · ${r2(best[1].pnl)} $` : "", "Least Profitable Day": worst ? `${worst[0]} · ${r2(worst[1].pnl)} $` : "",
    "Total Trades": n, "Total Lots": sum(rows, "Size"),
    "Avg Trade Duration": durTxt(avgDur(rows)), "Avg Win Duration": durTxt(avgDur(rows.filter((t) => t["P&L"] > 0))), "Avg Loss Duration": durTxt(avgDur(rows.filter((t) => t["P&L"] < 0))),
    "Trade Direction % (Long)": n ? r6(rows.filter((t) => t.Direction === "Long").length / n) : 0,
    "Best Trade": bestT ? bestT["Net P&L"] : 0, "Best Trade · détail": det(bestT), "Worst Trade": worstT ? worstT["Net P&L"] : 0, "Worst Trade · détail": det(worstT),
    "Total Commissions": r2(sum(rows, "Commissions")), "Total Fees": r2(sum(rows, "Fees")),
  };
}

const TARGET = { 50000: 3000, 100000: 6000, 150000: 9000 };
const targetOf = (start) => start + (TARGET[start] || Math.round(start * 0.06));
const startGuess = (c) => Number(c["Solde de départ"]) || (/(\d+)K/i.exec(String(c.Nom || c["Nom TopstepX"] || "")) ? Number(/(\d+)K/i.exec(String(c.Nom || c["Nom TopstepX"]))[1]) * 1000 : 50000);

/** Full sync with a TopstepX token. fetchFn = (url, opts) => Promise<Response>.
 *  known = accounts already in the local database (+ ids added by hand): an account that TopstepX no longer lists
 *  (challenge passed, funded account closed, blown…) is NEVER dropped — its trades are fetched by id and it is archived. */
async function sync(token, fetchFn, known = []) {
  const H = { Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: "application/json" };
  const ra = await fetchFn(API + "/TradingAccount", { headers: H });
  if (ra.status === 401 || ra.status === 403) { const e = new Error("auth"); e.code = "AUTH"; throw e; }
  if (!ra.ok) throw new Error("TradingAccount " + ra.status);
  const accounts = await ra.json();
  const syncedAt = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const end = new Date(Date.now() + 2 * 864e5).toISOString();
  const comptes = [], trades = [], keepIds = [];
  const range = async (id, start) => { const rt = await fetchFn(API + "/Trade/range", { method: "POST", headers: H, body: JSON.stringify({ tradingAccountId: id, start, end }) });
    if (!rt.ok) { const e = new Error("Trade/range " + rt.status); e.status = rt.status; throw e; } return ((await rt.json()) || []).filter((t) => !t.voided && t.exitedAt).map(toRow); };
  const seen = new Set();
  for (const a of accounts) {
    seen.add(String(a.accountId));
    const start = new Date(new Date(a.startDate || Date.now() - 365 * 864e5).getTime() - 864e5).toISOString();
    const rows = await range(a.accountId, start);
    const acc = buildAccount(a, rows, syncedAt);
    comptes.push(acc); trades.push(...rows);
  }
  for (const k of known) {
    const id = String(k.id || (k.compte && k.compte["ID TopstepX"]) || "").trim(); if (!id || seen.has(id) || id === "ALL") continue; seen.add(id);
    const c = k.compte || {};
    let rows = null;
    try { rows = await range(Number(id), new Date(Date.now() - 400 * 864e5).toISOString()); } catch (e) { rows = null; }
    if (!rows || (!rows.length && c.Nom)) { if (c.Nom) { comptes.push({ ...c, Statut: c.Statut === "Actif" ? "Archivé" : c.Statut, Archivé: true }); keepIds.push(id); } continue; }
    if (!rows.length) continue; // unknown id with no trade: ignore
    const st = startGuess(c); let bal = st, peak = st; rows.sort((x, y) => x.Entry.localeCompare(y.Entry)).forEach((t) => { bal += t["Net P&L"]; peak = Math.max(peak, bal); });
    let nm = c["Nom TopstepX"] || "";
    if (!nm) { try { const rn = await fetchFn(API + "/Statistics/getAccountName?tradingAccountId=" + encodeURIComponent(id), { headers: H }); if (rn.ok) { const v = await rn.json(); if (typeof v === "string" && !/unknown/i.test(v)) nm = v; } } catch (e) {} }
    const a = { accountId: id, accountName: nm, startingBalance: st, balance: bal, highestBalance: peak, maximumLoss: c["Plancher MLL"] ?? null, dailyLoss: c.DLL ?? null, status: -1 };
    const acc = buildAccount(a, rows, syncedAt);
    if (c.Nom) acc.Nom = c.Nom; if (c.Type) acc.Type = c.Type;
    acc.Archivé = true;
    acc.Statut = c.Statut === "Cramé" ? "Cramé" : acc.Type !== "Funded" && acc.Type !== "Paper" && peak >= targetOf(st) ? "Passé" : "Archivé";
    acc["Archivé le"] = c["Archivé le"] || syncedAt;
    comptes.push(acc); trades.push(...rows);
  }
  return { comptes, trades, syncedAt, keepIds };
}

module.exports = { sync, toRow, buildAccount, targetOf };
