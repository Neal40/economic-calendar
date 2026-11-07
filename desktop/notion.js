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


/* ---------- writing (create / update / archive) ---------- */
function toNotionProps(schema, props) {
  const out = {};
  for (const [name, v] of Object.entries(props || {})) {
    const p = schema[name]; if (!p) continue;
    const empty = v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length);
    switch (p.type) {
      case "title": out[name] = { title: [{ text: { content: String(v || "") } }] }; break;
      case "rich_text": out[name] = { rich_text: empty ? [] : [{ text: { content: String(v).slice(0, 2000) } }] }; break;
      case "number": out[name] = { number: empty ? null : Number(v) }; break;
      case "select": out[name] = { select: empty ? null : { name: String(v) } }; break;
      case "multi_select": out[name] = { multi_select: empty ? [] : v.map((x) => ({ name: String(x) })) }; break;
      case "date": out[name] = { date: empty ? null : { start: String(v) } }; break;
      case "checkbox": out[name] = { checkbox: !!v }; break;
      case "url": out[name] = { url: empty ? null : String(v) }; break;
    }
  }
  return out;
}
const CREATABLE = ["paragraph", "heading_1", "heading_2", "heading_3", "quote", "callout", "toggle", "bulleted_list_item", "numbered_list_item", "to_do", "divider", "image"];
/** Raw blocks of a template page, cleaned so they can be re-created (uploaded images become a placeholder line). */
async function templateBlocks(call, id, depth = 0) {
  const out = []; let cursor;
  do {
    const r = await call(`/blocks/${id}/children?page_size=100${cursor ? "&start_cursor=" + cursor : ""}`);
    for (const b of r.results) {
      if (!CREATABLE.includes(b.type)) continue;
      const d = JSON.parse(JSON.stringify(b[b.type] || {}));
      let blk;
      if (b.type === "image") { if (d.type === "external") blk = { type: "image", image: { type: "external", external: d.external } }; else continue; }
      else if (b.type === "divider") blk = { type: "divider", divider: {} };
      else {
        const clean = { rich_text: (d.rich_text || []).map((x) => ({ type: "text", text: { content: x.plain_text, link: x.href ? { url: x.href } : null }, annotations: x.annotations })) };
        if (d.color) clean.color = d.color; if (b.type === "to_do") clean.checked = false; if (b.type === "callout" && d.icon && d.icon.type === "emoji") clean.icon = d.icon;
        blk = { type: b.type, [b.type]: clean };
      }
      if (b.has_children && depth < 1 && ["toggle", "bulleted_list_item", "numbered_list_item", "callout", "quote", "to_do", "paragraph"].includes(b.type)) blk[b.type].children = await templateBlocks(call, b.id, depth + 1);
      out.push(blk);
    }
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return out;
}
async function schemaOf(call, dbId) { const db = await call(`/databases/${dbId}`); const sc = {}; for (const [n, p] of Object.entries(db.properties)) sc[n] = { type: p.type }; return sc; }
async function createPage(token, fetchFn, dbId, props, templateId) {
  const { call } = client(token, fetchFn);
  const schema = await schemaOf(call, dbId);
  const body = { parent: { database_id: dbId }, properties: toNotionProps(schema, props) };
  if (templateId) { try { const ch = await templateBlocks(call, templateId); if (ch.length) body.children = ch.slice(0, 100); } catch (e) {} }
  const pg = await call("/pages", "POST", body);
  return { id: pg.id, url: pg.url };
}
async function updatePage(token, fetchFn, dbId, pageId, props) {
  const { call } = client(token, fetchFn);
  const schema = await schemaOf(call, dbId);
  await call(`/pages/${pageId}`, "PATCH", { properties: toNotionProps(schema, props) });
  return { id: pageId };
}
async function archivePage(token, fetchFn, pageId) { const { call } = client(token, fetchFn); await call(`/pages/${pageId}`, "PATCH", { archived: true }); return { id: pageId }; }


/* ---------- page content: add text / pasted images, delete blocks ---------- */
async function uploadImage(token, fetchFn, dataUrl, name) {
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(String(dataUrl || "")); if (!m) throw new Error("image invalide");
  const type = m[1], buf = Buffer.from(m[2], "base64");
  const ext = (type.split("/")[1] || "png").replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "");
  const filename = (name && /\.[a-z0-9]+$/i.test(name) ? name : "capture-" + Date.now() + "." + ext).replace(/["\r\n]/g, "");
  const { call } = client(token, fetchFn);
  const fu = await call("/file_uploads", "POST", { mode: "single_part", filename, content_type: type });
  const B = "----econcal" + Date.now().toString(16);
  const body = Buffer.concat([Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`), buf, Buffer.from(`\r\n--${B}--\r\n`)]);
  const r = await fetchFn(`${API}/file_uploads/${fu.id}/send`, { method: "POST", headers: { Authorization: "Bearer " + token, "Notion-Version": VERSION, "Content-Type": `multipart/form-data; boundary=${B}` }, body });
  if (!r.ok) { const j = await r.json().catch(() => ({})); const e = new Error(j.message || "upload " + r.status); e.status = r.status; throw e; }
  return fu.id;
}
/** items: [{type:"text", text}] or [{type:"image", data: dataURL, name}] → appended as children of parentId (a page or a toggle). */
async function appendBlocks(token, fetchFn, parentId, items) {
  const { call } = client(token, fetchFn);
  const children = [];
  for (const it of items || []) {
    if (it.type === "image") { const id = await uploadImage(token, fetchFn, it.data, it.name); children.push({ object: "block", type: "image", image: { type: "file_upload", file_upload: { id }, caption: it.caption ? [{ type: "text", text: { content: String(it.caption).slice(0, 2000) } }] : [] } }); }
    else for (const line of String(it.text || "").split(/\n/)) children.push({ object: "block", type: "paragraph", paragraph: { rich_text: line ? [{ type: "text", text: { content: line.slice(0, 2000) } }] : [] } });
  }
  if (!children.length) return { ids: [] };
  const r = await call(`/blocks/${parentId}/children`, "PATCH", { children });
  return { ids: (r.results || []).slice(-children.length).map((b) => b.id) };
}
/** rename an image (its Notion caption) */
async function setCaption(token, fetchFn, id, caption) { const { call } = client(token, fetchFn);
  await call(`/blocks/${id}`, "PATCH", { image: { caption: caption ? [{ type: "text", text: { content: String(caption).slice(0, 2000) } }] : [] } }); return { id, caption }; }
async function deleteBlock(token, fetchFn, id) { const { call } = client(token, fetchFn); await call(`/blocks/${id}`, "DELETE"); return { id }; }

async function check(token, fetchFn) { const { call } = client(token, fetchFn); const me = await call("/users/me"); return { ok: true, bot: me.name || "integration" }; }


// Cheap change detection for the auto-sync: has anything been edited in these databases/pages since `since` (ISO)?
async function changedSince(token, fetchFn, items, since) {
  const { call } = client(token, fetchFn);
  // last_edited_time de Notion est arrondi à la minute : une modif faite dans la minute de la dernière synchro
  // a un last_edited_time <= since ; on la considère donc changée tant que since < last_edited_time + 60 s
  const t = since ? new Date(since).getTime() - 60000 : 0;
  for (const it of items || []) {
    if (it.db) {
      const r = await call(`/databases/${it.db}/query`, "POST", { page_size: 1, sorts: [{ timestamp: "last_edited_time", direction: "descending" }] });
      const pg = r.results && r.results[0];
      if (pg && new Date(pg.last_edited_time).getTime() > t) return { changed: true, what: it.db };
    } else if (it.page) {
      const pg = await call(`/pages/${it.page}`);
      if (pg && new Date(pg.last_edited_time).getTime() > t) return { changed: true, what: it.page };
    }
  }
  return { changed: false };
}

module.exports = { changedSince, queryDatabase, pageBlocks, check, createPage, updatePage, archivePage, appendBlocks, deleteBlock, setCaption };
