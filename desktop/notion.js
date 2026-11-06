// Notion (official API) → Review pages for the desktop app. Token = the user's own internal integration secret.
"use strict";
const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";

function client(token, fetchFn) {
  const call = async (path, method = "GET", body) => {
    const r = await fetchFn(API + path, { method, headers: { Authorization: "Bearer " + token, "Notion-Version": VERSION, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.message || "Notion " + r.status); e.status = r.status; e.code = j.code; throw e; }
    return j;
  };
  return { call };
}

const plain = (rt) => (rt || []).map((x) => x.plain_text).join("");
const rich = (rt) => (rt || []).map((x) => ({ t: x.plain_text, b: x.annotations?.bold || undefined, i: x.annotations?.italic || undefined, c: x.annotations?.code || undefined, href: x.href || undefined, color: x.annotations?.color !== "default" ? x.annotations?.color : undefined }));

function propValue(p) {
  switch (p.type) {
    case "title": return plain(p.title);
    case "rich_text": return plain(p.rich_text);
    case "number": return p.number;
    case "select": return p.select ? p.select.name : null;
    case "multi_select": return p.multi_select.map((o) => o.name);
    case "status": return p.status ? p.status.name : null;
    case "date": return p.date ? p.date.start : null;
    case "checkbox": return p.checkbox;
    case "url": return p.url;
    case "formula": { const f = p.formula; return f[f.type] ?? null; }
    case "created_time": return p.created_time;
    case "last_edited_time": return p.last_edited_time;
    default: return null;
  }
}

async function queryDatabase(token, fetchFn, dbId) {
  const { call } = client(token, fetchFn);
  const db = await call(`/databases/${dbId}`);
  const schema = {};
  for (const [name, p] of Object.entries(db.properties)) {
    const opts = (p[p.type] && p[p.type].options) || null;
    schema[name] = { type: p.type, options: opts ? opts.map((o) => ({ n: o.name, c: o.color })) : undefined };
  }
  const rows = []; let cursor;
  do {
    const r = await call(`/databases/${dbId}/query`, "POST", { page_size: 100, start_cursor: cursor });
    for (const pg of r.results) {
      const row = { _id: pg.id, _url: pg.url, _icon: pg.icon?.emoji || null };
      for (const [name, p] of Object.entries(pg.properties)) row[name] = propValue(p);
      rows.push(row);
    }
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return { title: plain(db.title), schema, rows };
}

/** Blocks of a page (recursive). Images are downloaded and returned as data URLs (Notion file links expire after 1 h). */
async function pageBlocks(token, fetchFn, pageId, depth = 0, budget = { n: 0 }) {
  const { call } = client(token, fetchFn);
  const out = []; let cursor;
  do {
    const r = await call(`/blocks/${pageId}/children?page_size=100${cursor ? "&start_cursor=" + cursor : ""}`);
    for (const b of r.results) {
      const d = b[b.type] || {};
      const blk = { id: b.id, type: b.type, rt: d.rich_text ? rich(d.rich_text) : undefined, color: d.color && d.color !== "default" ? d.color : undefined };
      if (b.type === "image") {
        const url = d.type === "file" ? d.file.url : d.external?.url;
        blk.caption = plain(d.caption);
        if (url && budget.n < 60) {
          budget.n++;
          try { const ir = await fetchFn(url); const buf = Buffer.from(await ir.arrayBuffer()); blk.src = `data:${ir.headers.get("content-type") || "image/png"};base64,${buf.toString("base64")}`; } catch (e) { blk.src = null; }
        }
      }
      if (b.type === "child_database") blk.title = d.title;
      if (b.type === "child_page") blk.title = d.title;
      if (b.type === "callout") blk.icon = d.icon?.emoji || null;
      if (b.type === "to_do") blk.checked = d.checked;
      if (b.has_children && depth < 3 && b.type !== "child_page" && b.type !== "child_database") blk.children = await pageBlocks(token, fetchFn, b.id, depth + 1, budget);
      out.push(blk);
    }
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return out;
}

async function check(token, fetchFn) { const { call } = client(token, fetchFn); const me = await call("/users/me"); return { ok: true, bot: me.name || "integration" }; }

module.exports = { queryDatabase, pageBlocks, check };
