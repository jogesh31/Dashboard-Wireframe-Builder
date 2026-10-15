// The .wfd project file: one self-contained JSON file per wireframe (layout,
// pages, comments, schema, embedded images). Also holds the 3-way merge used
// when two people save the same file through OneDrive, and the diff used to
// highlight what someone else changed.

import { normalizeComment } from "./comments.js";

export const FILE_FORMAT = "wireframe-designer-project";
export const FILE_FORMAT_VERSION = 2;
export const FILE_EXTENSION = ".wfd";

// ---------------- serialize / parse ----------------

/** The part of a document that belongs in the shared file (no per-user view state). */
export function sharedContent(doc) {
  return {
    version: doc.version,
    meta: { ...doc.meta },
    canvas: doc.canvas,
    pages: doc.pages,
    schema: doc.schema,
    members: doc.members || [],
  };
}

export function serializeProject(doc, savedBy, savedByEmail = "") {
  return JSON.stringify({
    format: FILE_FORMAT,
    formatVersion: FILE_FORMAT_VERSION,
    savedAt: Date.now(),
    savedBy: savedBy || "",
    savedByEmail,
    doc: sharedContent(doc),
  });
}

/** Parses a .wfd file (or a legacy .wfd.json export, which was a bare document). */
export function parseProject(text) {
  let data;
  try {
    data = JSON.parse(String(text).replace(/^﻿/, "")); // tolerate a UTF-8 byte-order mark added by some Windows tools
  } catch (err) {
    throw new Error("This file is damaged or isn't a wireframe project");
  }
  if (data && data.format === FILE_FORMAT) {
    if (data.formatVersion > FILE_FORMAT_VERSION) {
      throw new Error("This project was saved by a newer version of Wireframe Designer. Update the app to open it.");
    }
    if (!data.doc || !Array.isArray(data.doc.pages)) throw new Error("This project file is missing its pages");
    return { doc: upgradeComments(data.doc), savedBy: data.savedBy || "", savedAt: data.savedAt || 0 };
  }
  if (data && Array.isArray(data.pages)) {
    return { doc: upgradeComments(data), savedBy: "", savedAt: data.meta?.updatedAt || 0 };
  }
  throw new Error("This doesn't look like a wireframe project file");
}

// Files from older versions only had `resolved` on comments.
function upgradeComments(doc) {
  doc.pages.forEach((p) => (p.elements || []).forEach((e) => { e.comments = (e.comments || []).map(normalizeComment); }));
  return doc;
}

// ---------------- comparison ----------------

/** JSON with sorted keys, so two equal objects compare equal regardless of key order. */
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

function same(a, b) {
  return stableStringify(a) === stableStringify(b);
}

/** Comparison key for "did the shared content change?" — ignores the save timestamp. */
export function contentKey(doc) {
  const c = sharedContent(doc);
  return stableStringify({ ...c, meta: { ...c.meta, updatedAt: 0 } });
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

// ---------------- 3-way merge ----------------
// base   = the file as this user last synced it
// mine   = this user's current document
// theirs = what is in the file now (someone else saved)
// Anything only one side changed is taken from that side. When both changed
// the same field differently, this user's value wins and a conflict is recorded.

export function mergeDocs(base, mine, theirs) {
  const conflicts = [];
  const ctx = { conflicts, label: "" };

  const merged = clone(sharedContent(mine));
  merged.meta = mergeObject(base?.meta, mine.meta, theirs.meta, { ...ctx, label: "Project details" }, ["updatedAt"]);
  merged.meta.updatedAt = Math.max(mine.meta?.updatedAt || 0, theirs.meta?.updatedAt || 0);
  merged.canvas = mergeObject(base?.canvas, mine.canvas, theirs.canvas, { ...ctx, label: "Page size" });
  merged.schema = pick(base?.schema, mine.schema, theirs.schema, { ...ctx, label: "Data schema" });
  merged.members = mergeById(base?.members || [], mine.members || [], theirs.members || [], (b, m, t) => mergeObject(b, m, t, { ...ctx, label: "Project members" }), ctx, (m) => `Member ${m.email}`);
  merged.pages = mergeById(base?.pages || [], mine.pages, theirs.pages, (b, m, t) => mergePage(b, m, t, ctx), ctx, (p) => `Page "${p.name}"`);
  if (!merged.pages.length) merged.pages = clone(mine.pages);

  return { doc: merged, conflicts };
}

function pick(b, m, t, ctx) {
  if (same(m, t)) return clone(m);
  if (same(b, m)) return clone(t);
  if (same(b, t)) return clone(m);
  ctx.conflicts.push(ctx.label);
  return clone(m);
}

function mergeObject(b, m, t, ctx, ignoreKeys = []) {
  if (!isPlainObject(m) || !isPlainObject(t)) return pick(b, m, t, ctx);
  const out = {};
  const keys = new Set([...Object.keys(m), ...Object.keys(t)]);
  keys.forEach((k) => {
    if (ignoreKeys.includes(k)) { out[k] = clone(m[k]); return; }
    const bv = isPlainObject(b) ? b[k] : undefined;
    const mv = m[k];
    const tv = t[k];
    const v = isPlainObject(mv) && isPlainObject(tv) ? mergeObject(bv, mv, tv, ctx) : pick(bv, mv, tv, ctx);
    if (v !== undefined) out[k] = v;
  });
  return out;
}

/**
 * Merges two id-keyed lists against their common base. Keeps this user's
 * order (or theirs, if only they reordered), handles adds and deletes on
 * either side, and merges items both sides kept with `mergeItem`.
 */
function mergeById(baseList, mineList, theirsList, mergeItem, ctx, describe) {
  const bMap = new Map(baseList.map((x) => [x.id, x]));
  const mMap = new Map(mineList.map((x) => [x.id, x]));
  const tMap = new Map(theirsList.map((x) => [x.id, x]));

  const mineOrder = mineList.map((x) => x.id);
  const theirsOrder = theirsList.map((x) => x.id);
  const baseOrder = baseList.map((x) => x.id);
  const primary = same(baseOrder, mineOrder) && !same(baseOrder, theirsOrder) ? theirsOrder : mineOrder;
  const secondary = primary === mineOrder ? theirsOrder : mineOrder;
  const order = [...primary];
  secondary.forEach((id, i) => {
    if (order.includes(id)) return;
    const prev = secondary[i - 1];
    const at = prev ? order.indexOf(prev) + 1 : 0;
    order.splice(at, 0, id);
  });

  const out = [];
  order.forEach((id) => {
    const b = bMap.get(id);
    const m = mMap.get(id);
    const t = tMap.get(id);
    if (m && t) {
      out.push(mergeItem(b, m, t));
    } else if (m && !t) {
      if (!b) out.push(clone(m)); // I added it
      else if (!same(b, m)) { ctx.conflicts.push(`${describe(m)} (they deleted it, you edited it)`); out.push(clone(m)); }
      // else: they deleted it and I didn't touch it
    } else if (!m && t) {
      if (!b) out.push(clone(t)); // they added it
      else if (!same(b, t)) { ctx.conflicts.push(`${describe(t)} (you deleted it, they edited it)`); out.push(clone(t)); }
      // else: I deleted it and they didn't touch it
    }
  });
  return out;
}

function mergePage(b, m, t, ctx) {
  const page = mergeObject(b, m, t, { ...ctx, label: `Page "${m.name}"` }, ["elements"]);
  page.elements = mergeById(b?.elements || [], m.elements, t.elements, (be, me, te) => mergeElement(be, me, te, ctx), ctx, (e) => `"${e.name || e.type}"`);
  return page;
}

function mergeElement(b, m, t, ctx) {
  const label = `"${m.name || m.type}"`;
  const el = mergeObject(b, m, t, { ...ctx, label }, ["comments"]);
  el.comments = mergeById(b?.comments || [], m.comments || [], t.comments || [], (bc, mc, tc) => mergeComment(bc, mc, tc, ctx, label), ctx, () => `Comment on ${label}`);
  return el;
}

// Status, type and assignee merge field by field; replies merge by id, so two
// people replying to the same comment at the same time both keep their reply.
function mergeComment(b, m, t, ctx, label) {
  const cctx = { ...ctx, label: `Comment on ${label}` };
  const c = mergeObject(b, m, t, cctx, ["replies", "updatedAt"]);
  c.updatedAt = Math.max(m.updatedAt || 0, t.updatedAt || 0);
  c.replies = mergeById(b?.replies || [], m.replies || [], t.replies || [], (br, mr, tr) => mergeObject(br, mr, tr, cctx), ctx, () => `Reply on ${label}`);
  return c;
}

// ---------------- diff (for highlighting someone else's changes) ----------------

/**
 * What changed from `before` to `after`: element ids added / modified, elements
 * with new comments, and per-page counts — used to highlight changes on the
 * canvas and summarize them in the banner.
 */
export function diffDocs(before, after) {
  const result = { added: new Set(), modified: new Set(), commented: new Set(), newComments: 0, updatedComments: 0, removed: 0, newPages: 0, pages: new Map(), total: 0 };
  if (!before || !after) return result;

  const beforeEls = new Map();
  before.pages.forEach((p) => p.elements.forEach((e) => beforeEls.set(e.id, e)));
  const afterIds = new Set();

  after.pages.forEach((p) => {
    let pageCount = 0;
    p.elements.forEach((e) => {
      afterIds.add(e.id);
      const old = beforeEls.get(e.id);
      if (!old) {
        result.added.add(e.id);
        pageCount++;
      } else {
        const { comments: oldC, ...oldRest } = old;
        const { comments: newC, ...newRest } = e;
        if (!same(oldRest, newRest)) { result.modified.add(e.id); pageCount++; }
        const oldById = new Map((oldC || []).map((c) => [c.id, c]));
        let fresh = 0;
        (newC || []).forEach((c) => {
          const prev = oldById.get(c.id);
          if (!prev) { fresh++; return; }
          const oldReplies = new Set((prev.replies || []).map((r) => r.id));
          fresh += (c.replies || []).filter((r) => !oldReplies.has(r.id)).length;
          if (!same({ ...prev, replies: 0, updatedAt: 0 }, { ...c, replies: 0, updatedAt: 0 })) { result.updatedComments++; result.commented.add(e.id); pageCount++; } // status / assignee / text changed
        });
        if (fresh) { result.commented.add(e.id); result.newComments += fresh; pageCount++; }
      }
      if (!old && e.comments?.length) { result.commented.add(e.id); result.newComments += e.comments.length; }
    });
    if (pageCount) result.pages.set(p.id, { name: p.name, count: pageCount });
  });
  beforeEls.forEach((_, id) => { if (!afterIds.has(id)) result.removed++; });

  const beforePages = new Map(before.pages.map((p) => [p.id, p]));
  after.pages.forEach((p) => {
    const old = beforePages.get(p.id);
    if (!old) {
      result.newPages++;
      result.pages.set(p.id, { name: p.name, count: result.pages.get(p.id)?.count || 0 });
    } else if ((old.name !== p.name || old.background !== p.background) && !result.pages.has(p.id)) {
      result.pages.set(p.id, { name: p.name, count: 0 });
    }
  });
  const afterPageIds = new Set(after.pages.map((p) => p.id));
  const removedPages = before.pages.filter((p) => !afterPageIds.has(p.id)).length;

  result.total = result.added.size + result.modified.size + result.removed + result.newComments + result.updatedComments + result.newPages + removedPages;
  if (!result.total && result.pages.size) result.total = result.pages.size; // only page renames / backgrounds
  return result;
}
