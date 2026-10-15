// Lays out the visuals created by "Generate visuals": each section (headers,
// filters, KPIs, visuals) is placed in rows that span the page width with
// equal gutters, every item in a row gets the same height so tops and
// bottoms line up, and the user decides how many go in each row. The modal's
// live preview and the store use this same function, so what you see is
// exactly what gets created.

import { getVisualDef } from "./visualLibrary.js";

export const LAYOUT = { margin: 40, gutter: 20, sectionGap: 30 };
export const AUTO_MAX_PER_ROW = 4;

// Narrowest a visual can be and still read properly.
const MIN_WIDTH = { chart: 260, table: 300, map: 260, cardstat: 140, filter: 150, text: 100, sectionHeader: 160, groupContainer: 200, button: 80, image: 80, shape: 40, icon: 30 };

export function minWidthFor(def) {
  return MIN_WIDTH[def?.family] || 120;
}

/**
 * Parses a row pattern like "3,2,1". Returns null if it isn't one.
 */
export function parsePattern(text) {
  const parts = String(text || "").split(/[,\s]+/).filter(Boolean);
  if (!parts.length) return null;
  const nums = parts.map((p) => parseInt(p, 10));
  if (nums.some((n) => !Number.isFinite(n) || n < 1 || n > 12)) return null;
  return nums;
}

/**
 * How many items go in each row. `layout` = { perRow: "auto" | "all" | "1".."6", pattern: "3,2,1" }.
 * A pattern wins over perRow; if it's shorter than the item count its last
 * number repeats, if longer it's cut off.
 */
export function rowSizes(count, layout = {}) {
  if (count <= 0) return [];
  const pattern = parsePattern(layout.pattern);
  const sizes = [];
  let left = count;
  if (pattern) {
    let i = 0;
    while (left > 0) {
      const n = Math.min(left, pattern[Math.min(i, pattern.length - 1)]);
      sizes.push(n);
      left -= n;
      i++;
    }
    return sizes;
  }
  const per = layout.perRow === "all" ? count : layout.perRow && layout.perRow !== "auto" ? Math.max(1, parseInt(layout.perRow, 10)) : AUTO_MAX_PER_ROW;
  while (left > 0) {
    const n = Math.min(left, per);
    sizes.push(n);
    left -= n;
  }
  return sizes;
}

/**
 * Plans every box. `sections` = [{ key, items: [{ type, label }], layout }].
 * Returns { boxes: [{ sectionKey, type, label, def, x, y, w, h }], bottom,
 * neededHeight, warnings: [{ sectionKey, width, minWidth, perRow }] }.
 */
export function planGenerateLayout(sections, { canvasWidth, canvasHeight, startY }) {
  const { margin, gutter, sectionGap } = LAYOUT;
  const availableW = Math.max(1, canvasWidth - margin * 2);
  let y = startY;
  const boxes = [];
  const warnings = [];

  sections.forEach((section) => {
    const items = section.items.map((it) => ({ ...it, def: getVisualDef(it.type) })).filter((it) => it.def);
    if (!items.length) return;
    let index = 0;
    rowSizes(items.length, section.layout).forEach((n) => {
      const row = items.slice(index, index + n);
      index += n;
      const w = (availableW - gutter * (n - 1)) / n;
      const h = Math.max(...row.map((it) => it.def.defaultH));
      // Round the left edges, then derive each width from the next edge, so
      // every gap is exactly `gutter` and the row ends exactly at the margin.
      const lefts = row.map((_, i) => Math.round(margin + i * (w + gutter)));
      const rightEdge = margin + availableW;
      row.forEach((it, i) => {
        const x = lefts[i];
        const bw = (i < n - 1 ? lefts[i + 1] - gutter : rightEdge) - x;
        boxes.push({ sectionKey: section.key, type: it.type, label: it.label, def: it.def, x, y: Math.round(y), w: Math.round(bw), h });
        const min = minWidthFor(it.def);
        if (w < min && !warnings.some((wn) => wn.sectionKey === section.key)) warnings.push({ sectionKey: section.key, width: Math.round(w), minWidth: min, perRow: n, label: it.def.label });
      });
      y += h + gutter;
    });
    y += sectionGap - gutter;
  });

  const bottom = boxes.length ? Math.max(...boxes.map((b) => b.y + b.h)) : startY;
  const neededHeight = Math.max(canvasHeight, Math.ceil((bottom + margin) / 10) * 10);
  return { boxes, bottom, neededHeight, warnings };
}

/** Where generated content starts: below everything already on the page. */
export function generateStartY(page) {
  const visible = page.elements.filter((e) => !e.hidden);
  return visible.length ? Math.max(...visible.map((e) => e.y + e.h)) + LAYOUT.sectionGap : LAYOUT.margin;
}
