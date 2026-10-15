// Power BI-style rendering for canvas visuals: the default Power BI theme
// colours and typography, real axes, gridlines, legends, data labels and
// plausible sample data. Everything is drawn as SVG at the visual's actual
// pixel size so text stays crisp. Sample data is seeded from the element id,
// so a visual looks the same every time it's redrawn.

import { escapeHtml } from "./utils/dom.js";

// ---------------- theme ----------------

export const PALETTE = ["#118DFF", "#12239E", "#E66C37", "#6B007B", "#E044A7", "#744EC2", "#D9B300", "#D64550"];
const TEXT = "#605E5C";
const TITLE = "#252423";
const GRID = "#E1DFDD";
const TRACK = "#E9E8E7";
const FONT = "'Segoe UI', 'Segoe UI Web (West European)', -apple-system, Roboto, Helvetica, Arial, sans-serif";
const LABEL = 10; // axis / legend label size (px)

// ---------------- seeded sample data ----------------

function seed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(key) {
  let a = seed(key);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORY_SETS = [
  [/month|date|time|period|day|week/i, ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]],
  [/quarter|qtr/i, ["Q1", "Q2", "Q3", "Q4"]],
  [/year|fy/i, ["2021", "2022", "2023", "2024", "2025", "2026"]],
  [/region|zone|territory/i, ["North", "South", "East", "West", "Central", "North-East"]],
  [/country|market/i, ["India", "United States", "United Kingdom", "Germany", "Japan", "Australia"]],
  [/state|city/i, ["Maharashtra", "Karnataka", "Delhi", "Tamil Nadu", "Gujarat", "Telangana"]],
  [/product|item|sku/i, ["Laptops", "Phones", "Tablets", "Monitors", "Accessories", "Audio"]],
  [/customer|client|account/i, ["Contoso", "Fabrikam", "Northwind", "Adventure Works", "Tailspin", "Litware"]],
  [/segment/i, ["Consumer", "Corporate", "Home Office", "Small Business"]],
  [/channel/i, ["Online", "Retail", "Distributor", "Partner"]],
  [/stage|status|step/i, ["Leads", "Qualified", "Proposal", "Negotiation", "Won"]],
  [/task|project/i, ["Discovery", "Design", "Build", "Test", "Deploy", "Hypercare"]],
  [/employee|rep|agent|owner/i, ["A. Sharma", "R. Verma", "P. Nair", "K. Iyer", "S. Gupta", "M. Khan"]],
];
const DEFAULT_CATEGORIES = ["Bikes", "Accessories", "Clothing", "Components", "Services", "Other"];

export function categoriesFor(label, n) {
  const set = CATEGORY_SETS.find(([re]) => re.test(label || ""))?.[1] || DEFAULT_CATEGORIES;
  return Array.from({ length: n }, (_, i) => set[i % set.length]);
}

/** How many distinct sample categories exist for a field (so tables don't repeat rows). */
function categoryCount(label) {
  return (CATEGORY_SETS.find(([re]) => re.test(label || ""))?.[1] || DEFAULT_CATEGORIES).length;
}

function seriesNamesFor(legend, count) {
  const given = String(legend || "").split(",").map((s) => s.trim()).filter(Boolean);
  const defaults = ["2025", "2026", "Target", "Forecast"];
  return Array.from({ length: count }, (_, i) => given[i] || defaults[i] || `Series ${i + 1}`);
}

// What kind of number an axis shows: currency, percent, count or plain.
function measureProfile(label) {
  const l = String(label || "");
  if (/%|margin|rate|ratio|share|percent|growth/i.test(l)) return { max: 0.6, kind: "pct" };
  if (/count|orders|qty|quantity|units|customers|tickets|headcount|frequency|rank/i.test(l)) return { max: 900, kind: "num" };
  if (/sales|revenue|profit|cost|amount|value|spend|price|budget|\$|₹/i.test(l)) return { max: 480000, kind: "money" };
  return { max: 48000, kind: "num" };
}

export function formatValue(v, kind = "num", precise = false) {
  const abs = Math.abs(v);
  if (kind === "pct") return `${(v * 100).toFixed(precise ? 1 : 0)}%`;
  const prefix = kind === "money" ? "$" : "";
  if (abs >= 1e6) return `${prefix}${(v / 1e6).toFixed(abs >= 1e7 || !precise ? 1 : 2).replace(/\.0+$/, "")}M`;
  if (abs >= 1e3) return `${prefix}${(v / 1e3).toFixed(precise && abs < 1e4 ? 1 : 0)}K`;
  return `${prefix}${Math.round(v)}`;
}

// The tightest "nice" axis (3–5 ticks of 1/2/2.5/5 × 10ⁿ) that fits the data.
function niceMax(max) {
  if (max <= 0) return { max: 1, step: 0.25, ticks: 4 };
  let best = null;
  [3, 4, 5].forEach((ticks) => {
    const raw = max / ticks;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
    if (!best || step * ticks < best.max) best = { max: step * ticks, step, ticks };
  });
  return best;
}

// ---------------- SVG helpers ----------------

const r1 = (n) => Math.round(n * 10) / 10;

function text(x, y, str, { size = LABEL, anchor = "start", color = TEXT, weight = 400, baseline = "middle", rotate = 0, maxWidth = 0 } = {}) {
  let s = String(str);
  if (maxWidth > 0) {
    const fit = Math.max(1, Math.floor(maxWidth / (size * 0.55)));
    if (s.length > fit) s = `${s.slice(0, Math.max(1, fit - 1))}…`;
  }
  const rot = rotate ? ` transform="rotate(${rotate} ${r1(x)} ${r1(y)})"` : "";
  return `<text x="${r1(x)}" y="${r1(y)}" font-size="${size}" fill="${color}" font-weight="${weight}" text-anchor="${anchor}" dominant-baseline="${baseline}"${rot}>${escapeHtml(s)}</text>`;
}

function textWidth(str, size = LABEL) {
  return String(str).length * size * 0.55;
}

function svg(w, h, inner) {
  return `<svg class="pbi-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" font-family="${FONT}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

function legend(names, x, y, maxW, colors = PALETTE) {
  let cx = x;
  let out = "";
  names.forEach((n, i) => {
    const wItem = 12 + textWidth(n) + 10;
    if (cx + wItem > x + maxW && cx > x) return;
    out += `<circle cx="${r1(cx + 4)}" cy="${r1(y)}" r="4" fill="${colors[i % colors.length]}"/>`;
    out += text(cx + 11, y, n);
    cx += wItem;
  });
  return out;
}

function arcPath(cx, cy, rOuter, rInner, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p = (r, a) => `${r1(cx + r * Math.cos(a))} ${r1(cy + r * Math.sin(a))}`;
  if (rInner <= 0) return `M ${cx} ${cy} L ${p(rOuter, a0)} A ${rOuter} ${rOuter} 0 ${large} 1 ${p(rOuter, a1)} Z`;
  return `M ${p(rOuter, a0)} A ${rOuter} ${rOuter} 0 ${large} 1 ${p(rOuter, a1)} L ${p(rInner, a1)} A ${rInner} ${rInner} 0 ${large} 0 ${p(rInner, a0)} Z`;
}

// ---------------- visual frame (title + subtitle + body) ----------------

function headerHeight(el, c) {
  const fs = el.style?.fontSize || 13;
  return 8 + Math.round(fs * 1.35) + (c.subtitle ? 15 : 0) + 4;
}

function innerSize(el) {
  const bw = el.style?.borderWidth > 0 ? el.style.borderWidth : 0;
  return { w: Math.max(40, Math.round(el.w - bw * 2)), h: Math.max(30, Math.round(el.h - bw * 2)) };
}

function titleWeight(el) {
  return el.style?.fontWeight && el.style.fontWeight !== "400" ? el.style.fontWeight : "600";
}

function frame(el, bodySvg, c, hh) {
  const sub = c.subtitle ? `<div class="pbi-subtitle" data-field="subtitle">${escapeHtml(c.subtitle)}</div>` : "";
  return `<div class="pbi-visual">
    <div class="pbi-header" style="height:${hh}px">
      <div class="pbi-title" data-field="title" style="font-weight:${titleWeight(el)}">${escapeHtml(c.title ?? "")}</div>${sub}
    </div>
    <div class="pbi-body">${bodySvg}</div>
  </div>`;
}

// ---------------- charts ----------------

const CARTESIAN = new Set(["bars-h", "bars-v", "stacked-h", "stacked-v", "clustered-h", "clustered-v", "line", "area", "combo", "ribbon", "waterfall", "histogram", "scatter", "bubble", "boxplot"]);

export function renderPbiChart(el, def) {
  const c = el.content || {};
  const { w, h: totalH } = innerSize(el);
  const hh = headerHeight(el, c);
  const h = Math.max(20, totalH - hh);
  const kind = def.iconKind;
  const rand = rng(`${el.id}:${kind}`);
  let body;
  if (CARTESIAN.has(kind)) body = cartesian(kind, w, h, c, rand);
  else if (RENDERERS[kind]) body = RENDERERS[kind](w, h, c, rand, el);
  else body = cartesian("bars-v", w, h, c, rand);
  return frame(el, svg(w, h, body), c, hh);
}

function seriesCount(kind, c) {
  if (["stacked-h", "stacked-v", "clustered-h", "clustered-v", "ribbon"].includes(kind)) return Math.max(2, Math.min(4, String(c.legend || "").split(",").filter((s) => s.trim()).length || 2));
  if (kind === "combo") return 2;
  if (["line", "area"].includes(kind) && c.legend) return Math.min(3, String(c.legend).split(",").filter((s) => s.trim()).length);
  return 1;
}

function cartesian(kind, w, h, c, rand) {
  const horizontal = kind.endsWith("-h");
  const isTime = ["line", "area", "combo", "ribbon"].includes(kind);
  const nSeries = seriesCount(kind, c);
  const names = seriesNamesFor(c.legend, nSeries);
  const prof = measureProfile(c.axisY);
  const pad = 8;
  const showLegend = nSeries > 1 || kind === "combo";
  const legendH = showLegend ? 16 : 0;
  const showAxisTitles = w >= 200 && h >= 120;

  // categories
  let nCat = kind === "histogram" ? 10 : isTime ? (w > 360 ? 12 : w > 240 ? 8 : 6) : horizontal ? Math.max(3, Math.min(6, Math.floor((h - legendH - 30) / 22))) : Math.max(4, Math.min(6, Math.floor(w / 48)));
  if (kind === "waterfall") nCat = Math.max(4, Math.min(7, Math.floor(w / 50)));
  const cats = kind === "histogram"
    ? Array.from({ length: nCat }, (_, i) => `${i * 10}-${i * 10 + 9}`)
    : kind === "waterfall"
    ? ["Start", ...categoriesFor(c.axisX, nCat - 2), "End"]
    : categoriesFor(isTime ? c.axisX || "Month" : c.axisX, nCat);

  // values
  const series = names.map((_, s) => cats.map((_, i) => {
    if (isTime) return prof.max * (0.42 + 0.22 * Math.sin(i / 1.7 + s * 1.3) + 0.12 * (i / cats.length) + rand() * 0.22 - s * 0.08);
    if (kind === "histogram") return prof.max * Math.exp(-Math.pow((i - nCat / 2.4) / (nCat / 4), 2)) * (0.8 + rand() * 0.3);
    return prof.max * (0.25 + rand() * 0.75) * (horizontal && kind === "bars-h" ? 1 - i * 0.1 : 1);
  }));
  if (kind === "bars-h") series[0].sort((a, b) => b - a); // Power BI sorts bar charts by value

  let maxVal;
  const stacked = kind.startsWith("stacked") || kind === "ribbon";
  if (stacked) maxVal = Math.max(...cats.map((_, i) => series.reduce((s, ser) => s + ser[i], 0)));
  else if (kind === "waterfall") {
    let run = series[0][0];
    maxVal = run;
    for (let i = 1; i < cats.length - 1; i++) {
      series[0][i] *= rand() > 0.3 ? 0.35 : -0.25;
      run += series[0][i];
      maxVal = Math.max(maxVal, run);
    }
    series[0][cats.length - 1] = run;
  } else maxVal = Math.max(...series.flat());
  const scale = niceMax(maxVal * 1.05);

  const fmt = (v) => formatValue(v, prof.kind);
  const yLabelW = horizontal ? Math.min(w * 0.32, Math.max(...cats.map((t) => textWidth(t))) + 6) : textWidth(fmt(scale.max)) + 6;
  const left = pad + (showAxisTitles ? 14 : 0) + yLabelW;
  // Horizontal charts put value labels along the bottom: leave room for half of the last one.
  const right = w - pad - (kind === "combo" ? 30 : horizontal ? textWidth(fmt(scale.max)) / 2 : 4);
  const top = pad + legendH + 4;
  const bottom = h - pad - 14 - (showAxisTitles ? 14 : 0);
  const pw = Math.max(10, right - left);
  const ph = Math.max(10, bottom - top);
  let out = "";

  if (showLegend) out += legend(kind === "combo" ? [names[0], seriesNamesFor(c.legend, 2)[1]] : names, pad, pad + 6, w - pad * 2, kind === "combo" ? [PALETTE[0], PALETTE[2]] : PALETTE);

  // value-axis gridlines + labels (along the bottom, drop every other label when crowded)
  const xLabelEvery = pw / scale.ticks < textWidth(fmt(scale.max)) + 6 ? 2 : 1;
  for (let i = 0; i <= scale.ticks; i++) {
    const v = scale.step * i;
    if (horizontal) {
      const x = left + (v / scale.max) * pw;
      out += `<line x1="${r1(x)}" y1="${top}" x2="${r1(x)}" y2="${bottom}" stroke="${GRID}" stroke-dasharray="1 2"/>`;
      if (i % xLabelEvery === 0) out += text(x, bottom + 9, fmt(v), { anchor: "middle" });
    } else {
      const y = bottom - (v / scale.max) * ph;
      out += `<line x1="${left}" y1="${r1(y)}" x2="${right}" y2="${r1(y)}" stroke="${GRID}" stroke-dasharray="1 2"/>`;
      out += text(left - 5, y, fmt(v), { anchor: "end" });
    }
  }

  // category labels
  const band = (horizontal ? ph : pw) / cats.length;
  // Shorten category labels to fit their column; only drop every other one
  // when columns are too narrow to show even a few letters (like Power BI).
  const skip = !horizontal && band < 24 ? Math.ceil(Math.max(...cats.map((t) => textWidth(t))) / Math.max(band, 1)) : 1;
  cats.forEach((cat, i) => {
    if (horizontal) out += text(left - 5, top + band * (i + 0.5), cat, { anchor: "end", maxWidth: yLabelW - 4 });
    else if (kind !== "scatter" && kind !== "bubble" && i % skip === 0) out += text(left + band * (i + 0.5), bottom + 9, cat, { anchor: "middle", maxWidth: band * skip - 2 });
  });

  // axis titles
  if (showAxisTitles) {
    const xt = horizontal ? c.axisY || "Value" : c.axisX || "Category";
    const yt = horizontal ? c.axisX || "Category" : c.axisY || "Value";
    out += text(left + pw / 2, h - pad - 4, xt, { anchor: "middle", color: TEXT, weight: 600 });
    out += text(pad + 5, top + ph / 2, yt, { anchor: "middle", rotate: -90, weight: 600 });
  }

  const pos = (v) => (horizontal ? left + (v / scale.max) * pw : bottom - (v / scale.max) * ph);
  const bandStart = (i) => (horizontal ? top : left) + band * i;
  const gap = band * 0.25;

  if (["bars-h", "bars-v", "histogram"].includes(kind)) {
    series[0].forEach((v, i) => {
      const bw = kind === "histogram" ? band - 1 : band - gap * 2;
      const s0 = bandStart(i) + (kind === "histogram" ? 0.5 : gap);
      out += horizontal
        ? `<rect x="${left}" y="${r1(s0)}" width="${r1(pos(v) - left)}" height="${r1(bw)}" fill="${PALETTE[0]}"/>`
        : `<rect x="${r1(s0)}" y="${r1(pos(v))}" width="${r1(bw)}" height="${r1(bottom - pos(v))}" fill="${PALETTE[0]}"/>`;
    });
  } else if (kind.startsWith("stacked")) {
    cats.forEach((_, i) => {
      let acc = 0;
      series.forEach((ser, s) => {
        const a = pos(acc);
        const b = pos(acc + ser[i]);
        const s0 = bandStart(i) + gap;
        out += horizontal
          ? `<rect x="${r1(a)}" y="${r1(s0)}" width="${r1(b - a)}" height="${r1(band - gap * 2)}" fill="${PALETTE[s]}"/>`
          : `<rect x="${r1(s0)}" y="${r1(b)}" width="${r1(band - gap * 2)}" height="${r1(a - b)}" fill="${PALETTE[s]}"/>`;
        acc += ser[i];
      });
    });
  } else if (kind.startsWith("clustered")) {
    const sub = (band - gap * 2) / series.length;
    series.forEach((ser, s) => ser.forEach((v, i) => {
      const s0 = bandStart(i) + gap + sub * s;
      out += horizontal
        ? `<rect x="${left}" y="${r1(s0)}" width="${r1(pos(v) - left)}" height="${r1(sub - 1)}" fill="${PALETTE[s]}"/>`
        : `<rect x="${r1(s0)}" y="${r1(pos(v))}" width="${r1(sub - 1)}" height="${r1(bottom - pos(v))}" fill="${PALETTE[s]}"/>`;
    }));
  } else if (kind === "ribbon") {
    const bw = band * 0.5;
    const tops = cats.map((_, i) => {
      let acc = 0;
      return series.map((ser) => { const r = [acc, acc + ser[i]]; acc += ser[i]; return r; });
    });
    for (let i = 0; i < cats.length - 1; i++) {
      series.forEach((_, s) => {
        const x1 = bandStart(i) + (band + bw) / 2, x2 = bandStart(i + 1) + (band - bw) / 2;
        const [a0, a1] = tops[i][s], [b0, b1] = tops[i + 1][s];
        out += `<path d="M ${r1(x1)} ${r1(pos(a1))} C ${r1((x1 + x2) / 2)} ${r1(pos(a1))} ${r1((x1 + x2) / 2)} ${r1(pos(b1))} ${r1(x2)} ${r1(pos(b1))} L ${r1(x2)} ${r1(pos(b0))} C ${r1((x1 + x2) / 2)} ${r1(pos(b0))} ${r1((x1 + x2) / 2)} ${r1(pos(a0))} ${r1(x1)} ${r1(pos(a0))} Z" fill="${PALETTE[s]}" opacity="0.35"/>`;
      });
    }
    tops.forEach((stack, i) => stack.forEach(([a, b], s) => {
      out += `<rect x="${r1(bandStart(i) + (band - bw) / 2)}" y="${r1(pos(b))}" width="${r1(bw)}" height="${r1(pos(a) - pos(b))}" fill="${PALETTE[s]}"/>`;
    }));
  } else if (["line", "area", "combo"].includes(kind)) {
    const xs = cats.map((_, i) => left + band * (i + 0.5));
    if (kind === "combo") {
      series[0].forEach((v, i) => {
        out += `<rect x="${r1(bandStart(i) + gap)}" y="${r1(pos(v))}" width="${r1(band - gap * 2)}" height="${r1(bottom - pos(v))}" fill="${PALETTE[0]}"/>`;
      });
      const pct = cats.map((_, i) => 0.2 + 0.5 * rand());
      const pts = pct.map((p, i) => `${r1(xs[i])},${r1(bottom - p * ph)}`).join(" ");
      out += `<polyline points="${pts}" fill="none" stroke="${PALETTE[2]}" stroke-width="2"/>`;
      pct.forEach((p, i) => { out += `<circle cx="${r1(xs[i])}" cy="${r1(bottom - p * ph)}" r="2.5" fill="${PALETTE[2]}"/>`; });
      [0, 0.25, 0.5, 0.75, 1].forEach((p) => { out += text(right + 5, bottom - p * ph, `${Math.round(p * 100)}%`); });
    } else {
      series.forEach((ser, s) => {
        const pts = ser.map((v, i) => `${r1(xs[i])},${r1(pos(v))}`);
        if (kind === "area") out += `<polygon points="${r1(xs[0])},${bottom} ${pts.join(" ")} ${r1(xs[xs.length - 1])},${bottom}" fill="${PALETTE[s]}" opacity="${series.length > 1 ? 0.25 : 0.3}"/>`;
        out += `<polyline points="${pts.join(" ")}" fill="none" stroke="${PALETTE[s]}" stroke-width="2" stroke-linejoin="round"/>`;
      });
    }
  } else if (kind === "waterfall") {
    let run = 0;
    series[0].forEach((v, i) => {
      const isTotal = i === 0 || i === cats.length - 1;
      const from = isTotal ? 0 : run;
      const to = isTotal ? v : run + v;
      const color = isTotal ? PALETTE[1] : v >= 0 ? "#1AAB40" : "#D64554";
      const y1 = pos(Math.max(from, to)), y2 = pos(Math.min(from, to));
      out += `<rect x="${r1(bandStart(i) + gap)}" y="${r1(y1)}" width="${r1(band - gap * 2)}" height="${r1(Math.max(1, y2 - y1))}" fill="${color}"/>`;
      if (i < cats.length - 1) out += `<line x1="${r1(bandStart(i) + band - gap)}" y1="${r1(pos(to))}" x2="${r1(bandStart(i + 1) + gap)}" y2="${r1(pos(to))}" stroke="#A19F9D" stroke-dasharray="2 2"/>`;
      run = isTotal ? v : to;
    });
  } else if (kind === "scatter" || kind === "bubble") {
    const xProf = measureProfile(c.axisX);
    const xScale = niceMax(xProf.max);
    const every = pw / xScale.ticks < textWidth(formatValue(xScale.max, xProf.kind)) + 6 ? 2 : 1;
    for (let i = 0; i <= xScale.ticks; i += every) out += text(left + (i / xScale.ticks) * pw, bottom + 9, formatValue(xScale.step * i, xProf.kind), { anchor: "middle" });
    const n = kind === "bubble" ? 12 : 26;
    for (let i = 0; i < n; i++) {
      const xv = 0.08 + rand() * 0.86;
      const yv = Math.min(0.95, Math.max(0.05, xv * 0.7 + (rand() - 0.5) * 0.45));
      const r = kind === "bubble" ? 4 + rand() * Math.min(16, pw / 14) : 3.5;
      out += `<circle cx="${r1(left + xv * pw)}" cy="${r1(bottom - yv * ph)}" r="${r1(r)}" fill="${PALETTE[kind === "bubble" ? i % 4 : 0]}" opacity="${kind === "bubble" ? 0.7 : 0.85}" stroke="#fff" stroke-width="${kind === "bubble" ? 1 : 0}"/>`;
    }
  } else if (kind === "boxplot") {
    cats.forEach((_, i) => {
      const mid = 0.3 + rand() * 0.3;
      const q1 = mid - 0.08 - rand() * 0.06, q3 = mid + 0.08 + rand() * 0.08;
      const lo = q1 - 0.1 - rand() * 0.08, hi = q3 + 0.1 + rand() * 0.1;
      const x = bandStart(i) + band / 2, bw = Math.min(28, band * 0.5);
      const Y = (p) => bottom - p * ph;
      out += `<line x1="${r1(x)}" y1="${r1(Y(lo))}" x2="${r1(x)}" y2="${r1(Y(hi))}" stroke="${TEXT}"/>`;
      out += `<line x1="${r1(x - bw / 4)}" y1="${r1(Y(lo))}" x2="${r1(x + bw / 4)}" y2="${r1(Y(lo))}" stroke="${TEXT}"/><line x1="${r1(x - bw / 4)}" y1="${r1(Y(hi))}" x2="${r1(x + bw / 4)}" y2="${r1(Y(hi))}" stroke="${TEXT}"/>`;
      out += `<rect x="${r1(x - bw / 2)}" y="${r1(Y(q3))}" width="${r1(bw)}" height="${r1(Y(q1) - Y(q3))}" fill="${PALETTE[0]}" opacity="0.85"/>`;
      out += `<line x1="${r1(x - bw / 2)}" y1="${r1(Y(mid))}" x2="${r1(x + bw / 2)}" y2="${r1(Y(mid))}" stroke="#fff" stroke-width="1.5"/>`;
    });
  }

  // baseline axis
  out += horizontal
    ? `<line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="#C8C6C4"/>`
    : `<line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="#C8C6C4"/>`;
  return out;
}

// ---------------- part-to-whole and other charts ----------------

function shares(rand, n, sorted = true) {
  const raw = Array.from({ length: n }, (_, i) => 0.35 + rand() * (1 - i * 0.08));
  if (sorted) raw.sort((a, b) => b - a);
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((v) => v / total);
}

function pieChart(w, h, c, rand, donut) {
  const field = c.category || c.axisX;
  const n = Math.max(2, Math.min(6, categoryCount(field), Math.floor(Math.min(w, h) / 40) + 2));
  const cats = categoriesFor(field, n);
  const vals = shares(rand, n);
  const legendH = 16;
  const labelRoom = w > 170 ? 14 : 4; // outside data labels need space above and below
  const cx = w / 2, cy = legendH + 4 + (h - legendH - 4) / 2;
  const r = Math.max(10, Math.min(w * 0.3, (h - legendH - 8) / 2 - labelRoom));
  let a = -Math.PI / 2;
  let out = legend(cats, 8, 14, w - 16);
  vals.forEach((v, i) => {
    const a1 = a + v * Math.PI * 2;
    out += `<path d="${arcPath(cx, cy, r, donut ? r * 0.58 : 0, a, a1 - 0.002)}" fill="${PALETTE[i % PALETTE.length]}" stroke="#fff" stroke-width="1"/>`;
    // outside data label with leader line, like Power BI's default "outside" labels
    const mid = (a + a1) / 2;
    if (v > 0.06 && w > 170) {
      const ex = cx + (r + 8) * Math.cos(mid), ey = cy + (r + 8) * Math.sin(mid);
      const lx = cx + (r + 16) * Math.cos(mid);
      const right = Math.cos(mid) >= 0;
      out += `<polyline points="${r1(cx + r * Math.cos(mid))},${r1(cy + r * Math.sin(mid))} ${r1(ex)},${r1(ey)} ${r1(lx + (right ? 6 : -6))},${r1(ey)}" fill="none" stroke="#A19F9D" stroke-width="0.8"/>`;
      out += text(lx + (right ? 9 : -9), ey, `${(v * 100).toFixed(0)}%`, { anchor: right ? "start" : "end" });
    }
    a = a1;
  });
  return out;
}

// Treemap: split the items into two groups of roughly equal total, cut the
// rectangle along its longer side in that proportion, and recurse — every
// block stays reasonably square, so each one has room for its label.
function treemap(w, h, c, rand) {
  const field = c.category || c.axisX;
  const n = Math.min(6, categoryCount(field));
  const cats = categoriesFor(field, n);
  const items = shares(rand, n).map((v, i) => ({ v, i }));
  let out = "";
  const layout = (list, x, y, ww, hh) => {
    if (!list.length) return;
    if (list.length === 1) {
      const { v, i } = list[0];
      out += `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(Math.max(0, ww - 2))}" height="${r1(Math.max(0, hh - 2))}" fill="${PALETTE[i % PALETTE.length]}"/>`;
      if (ww > 40 && hh > 26) {
        out += text(x + 5, y + 10, cats[i], { color: "#fff", maxWidth: ww - 10 });
        out += text(x + 5, y + 23, `${(v * 100).toFixed(0)}%`, { color: "#fff", size: 9 });
      } else if (ww > 26 && hh > 14) {
        out += text(x + 4, y + 9, `${(v * 100).toFixed(0)}%`, { color: "#fff", size: 9 });
      }
      return;
    }
    const total = list.reduce((s, it) => s + it.v, 0);
    let acc = 0, split = 1;
    for (let k = 0; k < list.length - 1; k++) {
      acc += list[k].v;
      split = k + 1;
      if (acc >= total / 2) break;
    }
    const a = list.slice(0, split), b = list.slice(split);
    const frac = a.reduce((s, it) => s + it.v, 0) / total;
    if (ww >= hh) {
      layout(a, x, y, ww * frac, hh);
      layout(b, x + ww * frac, y, ww * (1 - frac), hh);
    } else {
      layout(a, x, y, ww, hh * frac);
      layout(b, x, y + hh * frac, ww, hh * (1 - frac));
    }
  };
  layout(items, 2, 2, w - 2, h - 2);
  return out;
}

function funnel(w, h, c, rand) {
  const cats = categoriesFor(c.category || "stage", 5);
  const prof = measureProfile(c.value || "Count");
  let v = prof.max * (0.8 + rand() * 0.2);
  const rows = cats.map(() => { const cur = v; v *= 0.55 + rand() * 0.3; return cur; });
  const labelW = Math.min(w * 0.3, 80);
  const rowH = (h - 12) / rows.length;
  const maxW = w - labelW - 16;
  let out = text(labelW + 8 + maxW / 2, 6, "100%", { anchor: "middle", size: 9 });
  rows.forEach((val, i) => {
    const bw = (val / rows[0]) * maxW;
    const y = 12 + i * rowH;
    out += text(labelW, y + rowH / 2, cats[i], { anchor: "end", maxWidth: labelW - 4 });
    out += `<rect x="${r1(labelW + 8 + (maxW - bw) / 2)}" y="${r1(y + 2)}" width="${r1(bw)}" height="${r1(rowH - 4)}" fill="${PALETTE[0]}"/>`;
    if (bw > 30) out += text(labelW + 8 + maxW / 2, y + rowH / 2, formatValue(val, prof.kind), { anchor: "middle", color: "#fff" });
  });
  out += text(labelW + 8 + maxW / 2, h - 2, `${((rows.at(-1) / rows[0]) * 100).toFixed(1)}%`, { anchor: "middle", size: 9, baseline: "auto" });
  return out;
}

function gauge(w, h, c, rand) {
  const pct = Math.min(0.95, Math.max(0.2, (parseFloat(c.value) || 72) / 100));
  const cx = w / 2, cy = h * 0.78;
  const r = Math.max(10, Math.min(w * 0.42, h * 0.72));
  let out = `<path d="${arcPath(cx, cy, r, r * 0.62, Math.PI, Math.PI * 2)}" fill="${TRACK}"/>`;
  out += `<path d="${arcPath(cx, cy, r, r * 0.62, Math.PI, Math.PI + pct * Math.PI)}" fill="${PALETTE[0]}"/>`;
  const ta = Math.PI + 0.85 * Math.PI;
  out += `<line x1="${r1(cx + r * 0.58 * Math.cos(ta))}" y1="${r1(cy + r * 0.58 * Math.sin(ta))}" x2="${r1(cx + r * 1.04 * Math.cos(ta))}" y2="${r1(cy + r * 1.04 * Math.sin(ta))}" stroke="${TITLE}" stroke-width="2"/>`;
  out += text(cx - r * 0.81, cy + 10, "0%", { anchor: "middle" });
  out += text(cx + r * 0.81, cy + 10, "100%", { anchor: "middle" });
  return out;
}

function radar(w, h, c, rand) {
  const n = 6;
  const cats = categoriesFor(c.axisX || "Metric", n).map((t, i) => ["Quality", "Speed", "Cost", "Service", "Reach", "Growth"][i] || t);
  const names = seriesNamesFor(c.legend, 2);
  const cx = w / 2, cy = 18 + (h - 18) / 2, r = Math.max(10, Math.min(w, h - 30) / 2 - 18);
  let out = legend(names, 8, 10, w - 16);
  [0.25, 0.5, 0.75, 1].forEach((f) => {
    out += `<polygon points="${cats.map((_, i) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return `${r1(cx + r * f * Math.cos(a))},${r1(cy + r * f * Math.sin(a))}`; }).join(" ")}" fill="none" stroke="${GRID}"/>`;
  });
  cats.forEach((t, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    out += `<line x1="${cx}" y1="${cy}" x2="${r1(cx + r * Math.cos(a))}" y2="${r1(cy + r * Math.sin(a))}" stroke="${GRID}"/>`;
    out += text(cx + (r + 10) * Math.cos(a), cy + (r + 8) * Math.sin(a), t, { anchor: Math.abs(Math.cos(a)) < 0.2 ? "middle" : Math.cos(a) > 0 ? "start" : "end", size: 9 });
  });
  names.forEach((_, s) => {
    const pts = cats.map((_, i) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; const f = 0.35 + rand() * 0.6; return `${r1(cx + r * f * Math.cos(a))},${r1(cy + r * f * Math.sin(a))}`; }).join(" ");
    out += `<polygon points="${pts}" fill="${PALETTE[s]}" fill-opacity="0.2" stroke="${PALETTE[s]}" stroke-width="1.5"/>`;
  });
  return out;
}

function heatmap(w, h, c, rand) {
  const cols = categoriesFor(c.axisX || "Month", Math.max(3, Math.min(8, Math.floor((w - 70) / 30))));
  const rows = categoriesFor(c.axisY === "Category" ? "Region" : c.axisY || "Region", Math.max(3, Math.min(6, Math.floor((h - 20) / 22))));
  const lw = Math.min(70, Math.max(...rows.map((r) => textWidth(r))) + 8);
  const cw = (w - lw - 6) / cols.length, rh = (h - 18) / rows.length;
  let out = "";
  cols.forEach((t, j) => { out += text(lw + cw * (j + 0.5), 7, t, { anchor: "middle", size: 9, maxWidth: cw }); });
  rows.forEach((t, i) => {
    out += text(lw - 4, 16 + rh * (i + 0.5), t, { anchor: "end", maxWidth: lw - 6 });
    cols.forEach((_, j) => {
      const v = rand();
      out += `<rect x="${r1(lw + cw * j + 1)}" y="${r1(16 + rh * i + 1)}" width="${r1(cw - 2)}" height="${r1(rh - 2)}" fill="${PALETTE[0]}" fill-opacity="${r1(0.12 + v * 0.85)}"/>`;
      if (cw > 30 && rh > 16) out += text(lw + cw * (j + 0.5), 16 + rh * (i + 0.5), `${Math.round(v * 100)}`, { anchor: "middle", size: 9, color: v > 0.55 ? "#fff" : TITLE });
    });
  });
  return out;
}

function calendarHeat(w, h, c, rand) {
  const weeks = Math.max(8, Math.min(26, Math.floor((w - 24) / 11)));
  const cell = Math.min(10, (w - 24) / weeks - 1, (h - 16) / 7 - 1);
  let out = "";
  ["M", "W", "F"].forEach((d, i) => { out += text(4, 14 + (i * 2 + 0.5) * (cell + 1), d, { size: 8 }); });
  for (let wk = 0; wk < weeks; wk++) {
    if (wk % 4 === 0) out += text(20 + wk * (cell + 1), 5, categoriesFor("Month", 12)[Math.floor(wk / 4.35) % 12], { size: 8 });
    for (let d = 0; d < 7; d++) {
      const v = rand();
      out += `<rect x="${r1(20 + wk * (cell + 1))}" y="${r1(12 + d * (cell + 1))}" width="${r1(cell)}" height="${r1(cell)}" rx="1.5" fill="${v < 0.15 ? "#EDEBE9" : PALETTE[0]}" fill-opacity="${v < 0.15 ? 1 : r1(0.2 + v * 0.8)}"/>`;
    }
  }
  return out;
}

function sunburst(w, h, c, rand) {
  const cx = w / 2, cy = h / 2, r = Math.max(10, Math.min(w, h) / 2 - 6);
  const inner = shares(rand, 4);
  let out = "";
  let a = -Math.PI / 2;
  inner.forEach((v, i) => {
    const a1 = a + v * Math.PI * 2;
    out += `<path d="${arcPath(cx, cy, r * 0.62, r * 0.25, a, a1)}" fill="${PALETTE[i]}" stroke="#fff"/>`;
    let b = a;
    shares(rand, 3).forEach((s, k) => {
      const b1 = b + s * (a1 - a);
      out += `<path d="${arcPath(cx, cy, r, r * 0.64, b, b1)}" fill="${PALETTE[i]}" fill-opacity="${1 - (k + 1) * 0.22}" stroke="#fff"/>`;
      b = b1;
    });
    a = a1;
  });
  return out + text(cx, cy, "Total", { anchor: "middle", weight: 600, color: TITLE });
}

function sankey(w, h, c, rand) {
  const left = categoriesFor("Channel", 3), right = categoriesFor("Segment", 3);
  const nw = 8, lx = Math.min(70, w * 0.25), rx = w - Math.min(80, w * 0.28);
  const lv = shares(rand, 3, false), rv = shares(rand, 3, false);
  let out = "";
  const pos = (vals) => { let y = 4; const usable = h - 8 - (vals.length - 1) * 8; return vals.map((v) => { const r = [y, y + v * usable]; y += v * usable + 8; return r; }); };
  const L = pos(lv), R = pos(rv);
  const lOff = L.map((r) => r[0]), rOff = R.map((r) => r[0]);
  L.forEach(([y0, y1], i) => {
    const flows = shares(rand, 3, false);
    flows.forEach((f, j) => {
      const th = (y1 - y0) * f;
      const a0 = lOff[i], b0 = rOff[j] + 0;
      const th2 = Math.min(th, R[j][1] - rOff[j]);
      out += `<path d="M ${lx + nw} ${r1(a0)} C ${r1((lx + rx) / 2)} ${r1(a0)} ${r1((lx + rx) / 2)} ${r1(b0)} ${rx} ${r1(b0)} L ${rx} ${r1(b0 + th2)} C ${r1((lx + rx) / 2)} ${r1(b0 + th2)} ${r1((lx + rx) / 2)} ${r1(a0 + th)} ${lx + nw} ${r1(a0 + th)} Z" fill="${PALETTE[i]}" opacity="0.3"/>`;
      lOff[i] += th;
      rOff[j] += th2;
    });
    out += `<rect x="${lx}" y="${r1(y0)}" width="${nw}" height="${r1(y1 - y0)}" fill="${PALETTE[i]}"/>`;
    out += text(lx - 4, (y0 + y1) / 2, left[i], { anchor: "end", maxWidth: lx - 6 });
  });
  R.forEach(([y0, y1], j) => {
    out += `<rect x="${rx}" y="${r1(y0)}" width="${nw}" height="${r1(y1 - y0)}" fill="${PALETTE[3 + j]}"/>`;
    out += text(rx + nw + 4, (y0 + y1) / 2, right[j], { maxWidth: w - rx - nw - 6 });
  });
  return out;
}

function chord(w, h, c, rand) {
  const cx = w / 2, cy = h / 2, r = Math.max(10, Math.min(w, h) / 2 - 10);
  const parts = shares(rand, 5, false);
  const arcs = [];
  let a = 0, out = "";
  parts.forEach((v, i) => {
    const a1 = a + v * Math.PI * 2 - 0.05;
    arcs.push([a, a1]);
    out += `<path d="${arcPath(cx, cy, r, r * 0.9, a, a1)}" fill="${PALETTE[i]}"/>`;
    a = a1 + 0.05;
  });
  for (let i = 0; i < arcs.length; i++) {
    const j = (i + 2) % arcs.length;
    const p = (ang) => `${r1(cx + r * 0.88 * Math.cos(ang))} ${r1(cy + r * 0.88 * Math.sin(ang))}`;
    const [a0, a1] = arcs[i], [b0, b1] = arcs[j];
    const m1 = a0 + (a1 - a0) * 0.2, m2 = a0 + (a1 - a0) * 0.6, n1 = b0 + (b1 - b0) * 0.3, n2 = b0 + (b1 - b0) * 0.7;
    out += `<path d="M ${p(m1)} Q ${cx} ${cy} ${p(n1)} L ${p(n2)} Q ${cx} ${cy} ${p(m2)} Z" fill="${PALETTE[i]}" opacity="0.4"/>`;
  }
  return out;
}

// Decomposition tree: Total → regions → products of the first (expanded) region.
function decompTree(w, h, c, rand) {
  const prof = measureProfile(c.axisY || "Sales");
  const levels = [["Total"], categoriesFor("Region", 3), categoriesFor("Product", 3)];
  const colW = (w - 8) / levels.length;
  const barMax = colW * 0.72;
  const slot = Math.min(36, (h - 8) / 3);
  const nodes = levels.map((names, li) => {
    const startY = (h - names.length * slot) / 2;
    const fracs = li === 0 ? [1] : shares(rand, names.length).map((f) => f / shares(rand, 1)[0]);
    const top = Math.max(...fracs);
    return names.map((n, i) => ({ name: n, x: 4 + li * colW, y: startY + i * slot, frac: fracs[i] / top, value: prof.max * 2.6 * (li === 0 ? 1 : fracs[i] / fracs.reduce((a, b) => a + b, 0)) }));
  });
  let out = "";
  // connectors: from the end of the parent's bar to each child
  [[0, 1, 0], [1, 2, 0]].forEach(([pl, cl, pi]) => {
    const p = nodes[pl][pi];
    const px = p.x + barMax * p.frac, py = p.y + 15;
    nodes[cl].forEach((ch) => {
      const cy = ch.y + 15;
      out += `<path d="M ${r1(px)} ${r1(py)} C ${r1(px + 14)} ${r1(py)} ${r1(ch.x - 14)} ${r1(cy)} ${r1(ch.x)} ${r1(cy)}" fill="none" stroke="#A19F9D" stroke-width="0.9"/>`;
    });
  });
  nodes.forEach((level, li) => level.forEach((n, i) => {
    const expanded = li === 0 || (li === 1 && i === 0);
    out += text(n.x, n.y + 5, n.name, { size: 9, maxWidth: colW - 8, weight: expanded ? 600 : 400, color: TITLE });
    out += `<rect x="${r1(n.x)}" y="${r1(n.y + 11)}" width="${r1(barMax)}" height="8" fill="#EDEBE9"/>`;
    out += `<rect x="${r1(n.x)}" y="${r1(n.y + 11)}" width="${r1(barMax * n.frac)}" height="8" fill="${li === 0 ? PALETTE[1] : PALETTE[0]}"/>`;
    out += text(n.x, n.y + 26, formatValue(n.value, prof.kind), { size: 8 });
  }));
  return out;
}

function network(w, h, c, rand) {
  const nodes = Array.from({ length: 10 }, (_, i) => ({ x: 16 + rand() * (w - 32), y: 12 + rand() * (h - 24), r: 4 + rand() * 6, g: i % 3 }));
  let out = "";
  nodes.forEach((n, i) => {
    const m = nodes[(i * 3 + 1) % nodes.length], k = nodes[(i + 4) % nodes.length];
    out += `<line x1="${r1(n.x)}" y1="${r1(n.y)}" x2="${r1(m.x)}" y2="${r1(m.y)}" stroke="#C8C6C4"/><line x1="${r1(n.x)}" y1="${r1(n.y)}" x2="${r1(k.x)}" y2="${r1(k.y)}" stroke="#C8C6C4"/>`;
  });
  nodes.forEach((n) => { out += `<circle cx="${r1(n.x)}" cy="${r1(n.y)}" r="${r1(n.r)}" fill="${PALETTE[n.g]}" stroke="#fff"/>`; });
  return out;
}

function gantt(w, h, c, rand) {
  const tasks = categoriesFor("task", Math.max(3, Math.min(6, Math.floor((h - 18) / 20))));
  const months = categoriesFor("Month", Math.max(3, Math.min(6, Math.floor(w / 60))));
  const lw = Math.min(80, w * 0.28);
  const tw = w - lw - 8, rowH = (h - 18) / tasks.length;
  let out = "";
  months.forEach((m, i) => {
    const x = lw + (tw / months.length) * i;
    out += text(x + 4, 7, m, { size: 9 }) + `<line x1="${r1(x)}" y1="0" x2="${r1(x)}" y2="${h}" stroke="${GRID}"/>`;
  });
  let start = 0;
  tasks.forEach((t, i) => {
    const len = 0.15 + rand() * 0.3;
    const y = 16 + i * rowH;
    out += text(lw - 6, y + rowH / 2, t, { anchor: "end", maxWidth: lw - 8 });
    out += `<rect x="${r1(lw + start * tw)}" y="${r1(y + rowH * 0.22)}" width="${r1(Math.min(len, 1 - start) * tw)}" height="${r1(rowH * 0.56)}" rx="2" fill="${PALETTE[i % 3]}"/>`;
    start = Math.min(0.85, start + len * (0.5 + rand() * 0.5));
  });
  return out;
}

function timeline(w, h, c, rand) {
  const y = h * 0.55;
  const n = Math.max(3, Math.min(6, Math.floor(w / 70)));
  const labels = categoriesFor("task", n);
  let out = `<line x1="8" y1="${r1(y)}" x2="${w - 8}" y2="${r1(y)}" stroke="#C8C6C4" stroke-width="2"/>`;
  labels.forEach((t, i) => {
    const x = 16 + ((w - 32) / (n - 1)) * i;
    out += `<circle cx="${r1(x)}" cy="${r1(y)}" r="5" fill="${PALETTE[i % 3]}" stroke="#fff" stroke-width="1.5"/>`;
    out += text(x, i % 2 ? y + 16 : y - 16, t, { anchor: "middle", size: 9, maxWidth: (w - 32) / (n - 1) + 10 });
    out += text(x, i % 2 ? y + 27 : y - 27, `${categoriesFor("Month", 12)[(i * 2) % 12]} 2026`, { anchor: "middle", size: 8, color: "#A19F9D" });
  });
  return out;
}

function smallMultiples(w, h, c, rand) {
  const groups = categoriesFor("Region", 4);
  const cols = w > h * 1.4 ? 4 : 2, rows = Math.ceil(groups.length / cols);
  const cw = w / cols, ch = h / rows;
  let out = "";
  groups.forEach((g, i) => {
    const x0 = (i % cols) * cw, y0 = Math.floor(i / cols) * ch;
    out += text(x0 + 6, y0 + 8, g, { size: 9, weight: 600, color: TITLE });
    const bars = 5, bw = (cw - 16) / bars;
    for (let b = 0; b < bars; b++) {
      const bh = (ch - 24) * (0.2 + rand() * 0.8);
      out += `<rect x="${r1(x0 + 8 + b * bw + 1)}" y="${r1(y0 + ch - 6 - bh)}" width="${r1(bw - 3)}" height="${r1(bh)}" fill="${PALETTE[0]}"/>`;
    }
    out += `<line x1="${r1(x0 + 6)}" y1="${r1(y0 + ch - 6)}" x2="${r1(x0 + cw - 6)}" y2="${r1(y0 + ch - 6)}" stroke="#C8C6C4"/>`;
  });
  return out;
}

function wordCloud(w, h, c, rand) {
  const words = ["revenue", "growth", "customer", "market", "pipeline", "margin", "retention", "forecast", "region", "channel", "product", "quality", "service", "brand", "launch", "renewal", "support", "pricing"];
  let x = 6, y = 18, lineH = 0, out = "";
  words.forEach((wd, i) => {
    const size = Math.round(10 + rand() * (i < 3 ? 14 : 8));
    const ww = textWidth(wd, size) + 8;
    if (x + ww > w - 4) { x = 6; y += lineH + 4; lineH = 0; }
    if (y + size / 2 > h) return;
    out += text(x, y, wd, { size, color: PALETTE[i % PALETTE.length], weight: size > 16 ? 600 : 400 });
    x += ww;
    lineH = Math.max(lineH, size);
  });
  return out;
}

function iconGrid(w, h, c, rand) {
  const cols = 10, rows = Math.max(3, Math.min(6, Math.floor(h / 26)));
  const filled = Math.round(cols * rows * (0.35 + rand() * 0.4));
  const cw = (w - 10) / cols, ch = (h - 6) / rows;
  const s = Math.min(cw, ch) * 0.7;
  let out = "";
  for (let i = 0; i < cols * rows; i++) {
    const x = 5 + (i % cols) * cw + cw / 2, y = 3 + Math.floor(i / cols) * ch + ch / 2;
    const color = i < filled ? PALETTE[0] : "#E1DFDD";
    out += `<circle cx="${r1(x)}" cy="${r1(y - s * 0.28)}" r="${r1(s * 0.18)}" fill="${color}"/><path d="M ${r1(x - s * 0.3)} ${r1(y + s * 0.4)} Q ${r1(x - s * 0.3)} ${r1(y - s * 0.02)} ${r1(x)} ${r1(y - s * 0.02)} Q ${r1(x + s * 0.3)} ${r1(y - s * 0.02)} ${r1(x + s * 0.3)} ${r1(y + s * 0.4)} Z" fill="${color}"/>`;
  }
  return out;
}

function sparkline(w, h, c, rand) {
  const n = 16;
  const pts = Array.from({ length: n }, (_, i) => `${r1(4 + (i / (n - 1)) * (w - 8))},${r1(4 + (h - 8) * (0.2 + rand() * 0.6))}`);
  const last = pts.at(-1).split(",");
  return `<polyline points="${pts.join(" ")}" fill="none" stroke="${PALETTE[0]}" stroke-width="1.6"/><circle cx="${last[0]}" cy="${last[1]}" r="2.5" fill="${PALETTE[0]}"/>`;
}

const RENDERERS = {
  pie: (w, h, c, rand) => pieChart(w, h, c, rand, false),
  donut: (w, h, c, rand) => pieChart(w, h, c, rand, true),
  treemap, funnel, gauge, radar, heatmap, sunburst, sankey, chord,
  calendar: calendarHeat,
  dectree: decompTree,
  network, gantt, timeline,
  smallmultiples: smallMultiples,
  wordcloud: wordCloud,
  icongrid: iconGrid,
  sparkline,
};

// ---------------- cards & KPIs ----------------

function cardValueStyle(el, fallback) {
  return `font-size:${el.style?.fontSize || fallback}px;font-weight:${el.style?.fontWeight || "600"}`;
}

export function renderPbiCard(el, def) {
  const c = el.content || {};
  const { w, h } = innerSize(el);
  const rand = rng(`${el.id}:${def.iconKind}`);
  const label = (field, cls, value, extra = "") => `<div class="${cls}" data-field="${field}" ${extra}>${escapeHtml(value ?? "")}</div>`;

  switch (def.iconKind) {
    case "card": {
      // The label under the value is the card's title once someone has named it
      // (e.g. from Generate), otherwise the default category text.
      const named = c.title && c.title !== def.label;
      return `<div class="pbi-card">${label("value", "pbi-callout", c.value ?? "42", `style="${cardValueStyle(el, 28)}"`)}${named ? label("title", "pbi-category", c.title) : label("subtitle", "pbi-category", c.subtitle || "Total")}</div>`;
    }

    case "kpi": {
      // Power BI KPI: value, goal and status, with the trend as a faint area behind.
      const trendH = Math.max(20, h * 0.42);
      const n = 12;
      const pts = Array.from({ length: n }, (_, i) => `${r1((i / (n - 1)) * w)},${r1(trendH - (0.15 + 0.6 * (i / n) + rand() * 0.25) * trendH * 0.9)}`);
      const notes = c.notes ?? "+8.2% YoY";
      const neg = /^\s*[-↓]/.test(notes);
      const trend = svg(w, Math.round(trendH), `<polygon points="0,${r1(trendH)} ${pts.join(" ")} ${w},${r1(trendH)}" fill="${neg ? "#D64554" : "#1AAB40"}" opacity="0.12"/><polyline points="${pts.join(" ")}" fill="none" stroke="${neg ? "#D64554" : "#1AAB40"}" stroke-opacity="0.5" stroke-width="1.5"/>`);
      return `<div class="pbi-kpi">
        <div class="pbi-kpi-trend">${trend}</div>
        ${label("title", "pbi-kpi-title", c.title)}
        ${label("value", "pbi-callout", c.value ?? "1.24M", `style="${cardValueStyle(el, 28)}"`)}
        <div class="pbi-kpi-goal ${neg ? "neg" : "pos"}"><span class="pbi-kpi-icon">${neg ? "!" : "✓"}</span><span data-field="notes">${escapeHtml(notes)}</span></div>
        ${c.subtitle ? label("subtitle", "pbi-kpi-sub", c.subtitle) : ""}
      </div>`;
    }

    case "multirow": {
      const rowsSrc = c.rows || "1.24M: Total Sales\n18.6%: Gross Margin\n8,420: Orders";
      const rows = rowsSrc.split("\n").filter(Boolean).map((line) => {
        const idx = line.indexOf(":");
        return { a: idx > -1 ? line.slice(0, idx).trim() : line, b: idx > -1 ? line.slice(idx + 1).trim() : "" };
      });
      return `<div class="pbi-multirow">${label("title", "pbi-mr-title", c.title)}${rows.map((r) => `<div class="pbi-mr-row"><div class="pbi-mr-value">${escapeHtml(r.a)}</div><div class="pbi-mr-label">${escapeHtml(r.b)}</div></div>`).join("")}</div>`;
    }

    case "gauge": {
      // The element's font size styles the gauge value; the title stays a normal title size.
      const hh = headerHeight({ style: { fontSize: 13 } }, { subtitle: c.subtitle });
      const bodyH = Math.max(20, h - hh);
      return `<div class="pbi-visual">
        <div class="pbi-header" style="height:${hh}px"><div class="pbi-title" data-field="title" style="font-weight:600;font-size:13px">${escapeHtml(c.title ?? "")}</div>${c.subtitle ? `<div class="pbi-subtitle" data-field="subtitle">${escapeHtml(c.subtitle)}</div>` : ""}</div>
        <div class="pbi-body pbi-gauge-body">${svg(w, bodyH, gauge(w, bodyH, c, rand))}${label("value", "pbi-gauge-value", c.value ?? "72%", `style="${cardValueStyle(el, 20)}"`)}</div>
      </div>`;
    }

    case "bullet": {
      const pct = Math.max(5, Math.min(100, parseInt(c.value) || 68));
      return `<div class="pbi-bullet">
        ${label("title", "pbi-kpi-title", c.title)}
        <div class="pbi-bullet-track"><div class="pbi-bullet-band b3"></div><div class="pbi-bullet-band b2"></div><div class="pbi-bullet-band b1"></div><div class="pbi-bullet-fill" style="width:${pct}%"></div><div class="pbi-bullet-target" style="left:82%"></div></div>
        <div class="pbi-bullet-scale"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
        ${c.subtitle ? label("subtitle", "pbi-kpi-sub", c.subtitle) : ""}
      </div>`;
    }

    case "influencers": {
      const items = (c.notes || "Region is West\nSegment is Corporate\nChannel is Online").split("\n").filter(Boolean);
      return `<div class="pbi-influencers">
        ${label("title", "pbi-kpi-title", c.title)}
        <div class="pbi-infl-tabs"><span class="active">Key influencers</span><span>Top segments</span></div>
        ${items.map((t, i) => `<div class="pbi-infl-row"><span class="pbi-infl-bubble">${(2.4 - i * 0.5).toFixed(1)}x</span><span class="pbi-infl-text">When <b>${escapeHtml(t)}</b></span></div>`).join("")}
      </div>`;
    }

    case "infographic":
      return `<div class="pbi-infographic">
        <div class="pbi-ig-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg></div>
        <div>${label("value", "pbi-callout", c.value ?? "1,204", `style="${cardValueStyle(el, 22)}"`)}${label("subtitle", "pbi-category", c.subtitle || "Active customers")}</div>
      </div>`;

    default:
      return renderPbiChart(el, def);
  }
}

// ---------------- tables ----------------

export function renderPbiTable(el, def) {
  const c = el.content || {};
  const { h } = innerSize(el);
  const rand = rng(`${el.id}:${def.iconKind}`);
  const hh = headerHeight(el, c);
  const rowH = 22;
  const linked = Array.isArray(c.linkedColumns) && c.linkedColumns.length ? c.linkedColumns : null;
  const firstCol = linked?.[0] || "Region";
  const nRows = Math.max(2, Math.min(categoryCount(firstCol), Math.floor((h - hh - rowH * 2 - 6) / rowH)));
  let cols, rows;

  if (def.iconKind === "table") {
    cols = linked || ["Region", "Sales", "Profit", "Margin %", "Orders"];
    const cats = categoriesFor(cols[0], nRows);
    rows = cats.map((cat) => cols.map((col, j) => (j === 0 ? cat : sampleCell(col, rand))));
  } else {
    // matrix / pivot: row groups with expand icons, a column per year, totals
    cols = linked || ["Region", "2024", "2025", "2026", "Total"];
    const cats = categoriesFor(cols[0], nRows);
    rows = cats.map((cat, i) => cols.map((col, j) => (j === 0 ? cat : sampleCell(cols[1] && /^\d{4}$/.test(cols[1]) ? "Sales" : col, rand))));
    // A "Total" column adds up the row, as it would in Power BI.
    const last = cols.length - 1;
    if (/^total$/i.test(cols[last]) && last > 1) rows.forEach((r) => { r[last] = sumCells(r.slice(1, last)); });
  }
  const numeric = cols.map((col, j) => j > 0 && rows.every((r) => /^[\d$₹.,%KM-]+$/.test(r[j])));
  const totals = cols.map((col, j) => (j === 0 ? "Total" : numeric[j] ? sumCells(rows.map((r) => r[j])) : ""));
  const isMatrix = def.iconKind !== "table";

  const head = `<tr>${cols.map((col, j) => `<th class="${numeric[j] ? "num" : ""}">${escapeHtml(col)}</th>`).join("")}</tr>`;
  const body = rows.map((r) => `<tr>${r.map((v, j) => `<td class="${numeric[j] ? "num" : ""}">${j === 0 && isMatrix ? '<span class="pbi-expand">+</span>' : ""}${escapeHtml(v)}</td>`).join("")}</tr>`).join("");
  const foot = `<tr class="pbi-total">${totals.map((v, j) => `<td class="${numeric[j] ? "num" : ""}">${escapeHtml(v)}</td>`).join("")}</tr>`;
  return `<div class="pbi-visual">
    <div class="pbi-header" style="height:${hh}px"><div class="pbi-title" data-field="title" style="font-weight:${titleWeight(el)}">${escapeHtml(c.title ?? "")}</div>${c.subtitle ? `<div class="pbi-subtitle" data-field="subtitle">${escapeHtml(c.subtitle)}</div>` : ""}</div>
    <div class="pbi-body pbi-table-wrap"><table class="pbi-table${isMatrix ? " matrix" : ""}"><thead>${head}</thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table></div>
  </div>`;
}

function sampleCell(col, rand) {
  const prof = measureProfile(col);
  if (/date|month/i.test(col)) return `${1 + Math.floor(rand() * 28)}/${1 + Math.floor(rand() * 12)}/2026`;
  if (/name|customer|product|category|region|city|country|segment|status|owner/i.test(col)) return categoriesFor(col, 6)[Math.floor(rand() * 6)];
  const v = prof.max * (0.1 + rand() * 0.9) * (prof.kind === "num" ? 0.05 : 1);
  if (prof.kind === "pct") return `${(v * 100).toFixed(1)}%`;
  if (prof.kind === "money") return `$${Math.round(v).toLocaleString("en-US")}`;
  return Math.round(v).toLocaleString("en-US");
}

function sumCells(values) {
  const nums = values.map((v) => parseFloat(String(v).replace(/[^\d.-]/g, "")) || 0);
  if (values.some((v) => String(v).includes("%"))) return `${(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1)}%`;
  const total = nums.reduce((a, b) => a + b, 0);
  return `${values.some((v) => String(v).startsWith("$")) ? "$" : ""}${Math.round(total).toLocaleString("en-US")}`;
}

// ---------------- maps ----------------

// Very simplified continents (lon, lat) — enough to read as a world map.
const LAND = [
  [[-168, 65], [-140, 70], [-95, 72], [-80, 62], [-60, 55], [-55, 48], [-70, 43], [-75, 35], [-81, 25], [-90, 29], [-97, 26], [-105, 20], [-115, 30], [-125, 40], [-130, 55], [-150, 60]],
  [[-50, 60], [-30, 70], [-22, 80], [-60, 82], [-72, 76], [-56, 67]],
  [[-80, 10], [-60, 11], [-50, 0], [-35, -7], [-40, -22], [-55, -35], [-68, -55], [-75, -45], [-71, -20], [-81, -5]],
  [[-10, 36], [0, 43], [-5, 48], [5, 53], [10, 58], [5, 62], [20, 70], [40, 68], [45, 55], [35, 45], [26, 40], [15, 38]],
  [[-17, 15], [-10, 30], [10, 37], [32, 31], [44, 12], [51, 11], [40, -5], [40, -25], [20, -35], [12, -17], [9, 4], [-8, 5]],
  [[45, 55], [40, 68], [70, 73], [110, 77], [140, 72], [170, 65], [160, 55], [140, 50], [130, 35], [121, 23], [108, 15], [100, 2], [95, 15], [88, 22], [80, 8], [72, 20], [60, 25], [50, 30], [35, 45]],
  [[114, -22], [122, -18], [135, -12], [142, -11], [150, -24], [153, -28], [147, -38], [138, -35], [130, -31], [115, -34]],
  [[-6, 50], [1, 51], [-2, 55], [-5, 58], [-6, 55]],
  [[130, 31], [140, 35], [142, 41], [140, 45], [136, 36]],
  [[95, 5], [105, -6], [120, -9], [130, -4], [118, 2]],
];
const CITIES = [[-74, 40.7], [-118, 34], [-0.1, 51.5], [2.3, 48.8], [13.4, 52.5], [72.8, 19], [77.2, 28.6], [77.6, 12.9], [139.7, 35.7], [151.2, -33.8], [-46.6, -23.5], [121.5, 31.2], [55.3, 25.2], [-79.4, 43.7], [103.8, 1.3]];

export function renderPbiMap(el, def) {
  const c = el.content || {};
  const { w, h: totalH } = innerSize(el);
  const hh = headerHeight(el, c);
  const h = Math.max(20, totalH - hh);
  const rand = rng(`${el.id}:map`);
  const lonMin = -170, lonMax = 180, latMax = 80, latMin = -58;
  const sx = w / (lonMax - lonMin), sy = h / (latMax - latMin);
  const s = Math.min(sx, sy);
  const ox = (w - (lonMax - lonMin) * s) / 2, oy = (h - (latMax - latMin) * s) / 2;
  const P = ([lon, lat]) => [ox + (lon - lonMin) * s, oy + (latMax - lat) * s];
  const filled = /filled|shape/.test(el.type);
  let out = `<rect width="${w}" height="${h}" fill="#DDECF7"/>`;
  LAND.forEach((poly, i) => {
    const pts = poly.map((p) => P(p).map(r1).join(",")).join(" ");
    const fill = filled ? PALETTE[0] : "#F4F2EE";
    const op = filled ? r1(0.2 + ((i * 37) % 70) / 100) : 1;
    out += `<polygon points="${pts}" fill="${fill}" fill-opacity="${op}" stroke="#D2D0CE" stroke-width="0.6" stroke-linejoin="round"/>`;
  });
  if (el.type === "arc-map") {
    const [hx, hy] = P(CITIES[5]);
    CITIES.slice(0, 8).forEach((cty, i) => {
      if (i === 5) return;
      const [x, y] = P(cty);
      out += `<path d="M ${r1(hx)} ${r1(hy)} Q ${r1((hx + x) / 2)} ${r1(Math.min(hy, y) - 30 * s)} ${r1(x)} ${r1(y)}" fill="none" stroke="${PALETTE[0]}" stroke-width="1.2" opacity="0.8"/>`;
    });
  }
  if (!filled) {
    CITIES.forEach((cty) => {
      const [x, y] = P(cty);
      const r = Math.max(2.5, (3 + rand() * 9) * Math.min(1.2, s * 1.2));
      out += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" fill="${PALETTE[0]}" fill-opacity="0.75" stroke="#fff" stroke-width="0.8"/>`;
    });
  }
  out += text(w - 4, h - 6, el.type === "azure-map" ? "© Microsoft Azure Maps" : "© Microsoft Bing", { anchor: "end", size: 7, color: "#8A8886" });
  return frame(el, svg(w, h, out), c, hh);
}

// ---------------- slicers ----------------

export function renderPbiSlicer(el, def) {
  const c = el.content || {};
  const field = c.category || "Field Name";
  const { h } = innerSize(el);
  const header = `<div class="pbi-slicer-header"><span data-field="category">${escapeHtml(field)}</span><span class="pbi-slicer-eraser" title="Clear selections">⌫</span></div>`;
  let body = "";
  switch (def.iconKind) {
    case "list": {
      const n = Math.max(2, Math.min(8, Math.floor((h - 34) / 22)));
      const opts = categoriesFor(field, Math.max(1, n - 1));
      body = `<div class="pbi-slicer-item"><span class="pbi-check"></span>Select all</div>${opts.map((o, i) => `<div class="pbi-slicer-item"><span class="pbi-check ${i === 0 ? "on" : ""}"></span>${escapeHtml(o)}</div>`).join("")}`;
      break;
    }
    case "dropdown":
      body = `<div class="pbi-slicer-dropdown"><span>All</span><svg viewBox="0 0 12 12" width="10" height="10"><path d="M2 4l4 4 4-4" fill="none" stroke="${TEXT}" stroke-width="1.4"/></svg></div>`;
      break;
    case "date":
      body = `<div class="pbi-range-boxes"><div class="pbi-range-box">1/1/2026 <span class="pbi-cal">▦</span></div><div class="pbi-range-box">12/31/2026 <span class="pbi-cal">▦</span></div></div>${rangeSlider(18, 82)}`;
      break;
    case "slider":
      body = `<div class="pbi-range-boxes"><div class="pbi-range-box">0</div><div class="pbi-range-box">1,000</div></div>${rangeSlider(12, 70)}`;
      break;
    case "hierarchy": {
      const parents = categoriesFor("Region", 3);
      const kids = categoriesFor("State", 2);
      body = parents.map((p, i) => `<div class="pbi-slicer-item"><span class="pbi-chev">${i === 0 ? "⌄" : "›"}</span><span class="pbi-check ${i === 0 ? "partial" : ""}"></span>${escapeHtml(p)}</div>${i === 0 ? kids.map((k, j) => `<div class="pbi-slicer-item child"><span class="pbi-check ${j === 0 ? "on" : ""}"></span>${escapeHtml(k)}</div>`).join("") : ""}`).join("");
      break;
    }
    default:
      body = "";
  }
  return `<div class="pbi-slicer">${header}<div class="pbi-slicer-body">${body}</div></div>`;
}

function rangeSlider(a, b) {
  return `<div class="pbi-slider"><div class="pbi-slider-track"></div><div class="pbi-slider-range" style="left:${a}%;right:${100 - b}%"></div><div class="pbi-slider-handle" style="left:${a}%"></div><div class="pbi-slider-handle" style="left:${b}%"></div></div>`;
}
