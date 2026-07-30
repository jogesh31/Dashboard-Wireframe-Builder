// Lightweight deterministic PRNG so placeholder "data" looks stable per element
// instead of jittering on every re-render.
function seedFromString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rng(seedStr) {
  return mulberry32(seedFromString(seedStr || "seed"));
}

const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';

function svgWrap(inner, viewBox = "0 0 24 24") {
  return `<svg viewBox="${viewBox}" ${STROKE} xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

function bars(rand, n, horizontal, stacked, clustered) {
  const parts = [];
  const pad = 2;
  const trackLen = 20;
  if (horizontal) {
    const bh = (trackLen - pad * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const len = 6 + rand() * 14;
      const y = 2 + i * (bh + pad);
      if (clustered) {
        const bh2 = bh / 2;
        parts.push(`<rect x="2" y="${y}" width="${len}" height="${bh2}" fill="currentColor" opacity="0.9" stroke="none"/>`);
        parts.push(`<rect x="2" y="${y + bh2 + 0.5}" width="${5 + rand() * 12}" height="${bh2}" fill="currentColor" opacity="0.45" stroke="none"/>`);
      } else if (stacked) {
        const l1 = 4 + rand() * 8;
        const l2 = 4 + rand() * 8;
        parts.push(`<rect x="2" y="${y}" width="${l1}" height="${bh}" fill="currentColor" opacity="0.9" stroke="none"/>`);
        parts.push(`<rect x="${2 + l1}" y="${y}" width="${l2}" height="${bh}" fill="currentColor" opacity="0.45" stroke="none"/>`);
      } else {
        parts.push(`<rect x="2" y="${y}" width="${len}" height="${bh}" fill="currentColor" opacity="0.85" stroke="none"/>`);
      }
    }
  } else {
    const bw = (trackLen - pad * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const len = 6 + rand() * 14;
      const x = 2 + i * (bw + pad);
      if (clustered) {
        const bw2 = bw / 2;
        parts.push(`<rect x="${x}" y="${22 - len}" width="${bw2}" height="${len}" fill="currentColor" opacity="0.9" stroke="none"/>`);
        const len2 = 6 + rand() * 14;
        parts.push(`<rect x="${x + bw2 + 0.3}" y="${22 - len2}" width="${bw2}" height="${len2}" fill="currentColor" opacity="0.45" stroke="none"/>`);
      } else if (stacked) {
        const l1 = 4 + rand() * 8;
        const l2 = 4 + rand() * 8;
        parts.push(`<rect x="${x}" y="${22 - l1 - l2}" width="${bw}" height="${l1}" fill="currentColor" opacity="0.45" stroke="none"/>`);
        parts.push(`<rect x="${x}" y="${22 - l2}" width="${bw}" height="${l2}" fill="currentColor" opacity="0.9" stroke="none"/>`);
      } else {
        parts.push(`<rect x="${x}" y="${22 - len}" width="${bw}" height="${len}" fill="currentColor" opacity="0.85" stroke="none"/>`);
      }
    }
  }
  parts.push(`<line x1="1" y1="22" x2="23" y2="22" ${STROKE} opacity="0.5"/>`);
  return parts.join("");
}

function linePath(rand, n, area, dual) {
  const pts = [];
  let y = 12 + (rand() - 0.5) * 4;
  const stepX = 20 / (n - 1);
  for (let i = 0; i < n; i++) {
    y = Math.max(3, Math.min(20, y + (rand() - 0.5) * 9));
    pts.push([2 + i * stepX, y]);
  }
  const poly = pts.map((p) => p.join(",")).join(" ");
  let out = "";
  if (area) {
    const areaPts = `2,22 ${poly} 22,22`;
    out += `<polygon points="${areaPts}" fill="currentColor" opacity="0.18" stroke="none"/>`;
  }
  out += `<polyline points="${poly}" ${STROKE}/>`;
  if (dual) {
    const pts2 = pts.map(([x, yy]) => [x, Math.max(3, Math.min(20, 22 - yy + 2))]);
    out += `<polyline points="${pts2.map((p) => p.join(",")).join(" ")}" ${STROKE} opacity="0.45" stroke-dasharray="2 2"/>`;
  }
  return out;
}

function pieSlices(rand, donut, sun) {
  const cx = 12, cy = 12, r = donut || sun ? 9 : 9.5;
  const n = 3 + Math.floor(rand() * 2);
  let acc = 0;
  const vals = Array.from({ length: n }, () => 0.15 + rand() * 0.3);
  const total = vals.reduce((a, b) => a + b, 0);
  const parts = [];
  vals.forEach((v, i) => {
    const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += v;
    const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    const large = end - start > Math.PI ? 1 : 0;
    parts.push(`<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="currentColor" opacity="${0.3 + i * 0.22}" stroke="var(--page-bg,#fff)" stroke-width="0.5"/>`);
  });
  if (donut) parts.push(`<circle cx="${cx}" cy="${cy}" r="4" fill="var(--page-bg,#fff)" stroke="none"/>`);
  return parts.join("");
}

function dots(rand, n, bubble) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const x = 3 + rand() * 18;
    const y = 3 + rand() * 18;
    const r = bubble ? 1.5 + rand() * 3 : 1.4;
    parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="currentColor" opacity="0.6" stroke="none"/>`);
  }
  return parts.join("");
}

const GLYPHS = {
  "bars-v": (r) => bars(r, 5, false, false, false),
  "bars-h": (r) => bars(r, 5, true, false, false),
  "stacked-v": (r) => bars(r, 4, false, true, false),
  "stacked-h": (r) => bars(r, 4, true, true, false),
  "clustered-v": (r) => bars(r, 4, false, false, true),
  "clustered-h": (r) => bars(r, 4, true, false, true),
  histogram: (r) => bars(r, 8, false, false, false),
  line: (r) => linePath(r, 6, false, false),
  area: (r) => linePath(r, 6, true, false),
  combo: (r) => bars(r, 4, false, false, false) + linePath(r, 5, false, true).replace(STROKE, `${STROKE} opacity="0.9"`),
  ribbon: (r) => linePath(r, 5, true, false) + linePath(r, 5, true, false).replace("opacity=\"0.18\"", "opacity=\"0.12\""),
  sparkline: (r) => linePath(r, 8, false, false),
  pie: (r) => pieSlices(r, false, false),
  donut: (r) => pieSlices(r, true, false),
  sunburst: (r) => `<circle cx="12" cy="12" r="9.5" ${STROKE} opacity="0.35"/><circle cx="12" cy="12" r="6.5" ${STROKE} opacity="0.55"/>` + pieSlices(r, true, true),
  treemap: () => `<rect x="2" y="2" width="12" height="10" fill="currentColor" opacity="0.75" stroke="var(--page-bg,#fff)"/><rect x="15" y="2" width="7" height="6" fill="currentColor" opacity="0.5" stroke="var(--page-bg,#fff)"/><rect x="15" y="9" width="7" height="3" fill="currentColor" opacity="0.35" stroke="var(--page-bg,#fff)"/><rect x="2" y="13" width="8" height="9" fill="currentColor" opacity="0.4" stroke="var(--page-bg,#fff)"/><rect x="11" y="13" width="11" height="9" fill="currentColor" opacity="0.6" stroke="var(--page-bg,#fff)"/>`,
  waterfall: (r) => {
    let y = 10; const parts = []; const xs = [2, 6.5, 11, 15.5, 20];
    xs.forEach((x, i) => {
      const d = (r() - 0.45) * 8;
      const top = Math.max(2, Math.min(20, y - Math.max(d, 1)));
      const bot = Math.max(2, Math.min(21, y));
      parts.push(`<rect x="${x}" y="${Math.min(top, bot)}" width="3.6" height="${Math.abs(bot - top) || 2}" fill="currentColor" opacity="${d >= 0 ? 0.85 : 0.4}" stroke="none"/>`);
      y = top;
    });
    parts.push(`<line x1="1" y1="21" x2="23" y2="21" ${STROKE} opacity="0.5"/>`);
    return parts.join("");
  },
  funnel: () => `<path d="M2,3 H22 L16,10 H8 Z" fill="currentColor" opacity="0.8" stroke="none"/><path d="M8,10 H16 L13,15 H11 Z" fill="currentColor" opacity="0.55" stroke="none"/><path d="M11,15 H13 L12.4,19 H11.6 Z" fill="currentColor" opacity="0.35" stroke="none"/>`,
  scatter: (r) => dots(r, 10, false),
  bubble: (r) => dots(r, 7, true),
  boxplot: () => `<line x1="12" y1="2" x2="12" y2="7" ${STROKE}/><rect x="7" y="7" width="10" height="9" ${STROKE}/><line x1="12" y1="16" x2="12" y2="21" ${STROKE}/><line x1="8.5" y1="11.5" x2="15.5" y2="11.5" ${STROKE} opacity="0.6"/>`,
  heatmap: (r) => {
    const parts = []; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      parts.push(`<rect x="${2 + i * 5}" y="${2 + j * 5}" width="4.3" height="4.3" fill="currentColor" opacity="${0.15 + r() * 0.7}" stroke="none"/>`);
    } return parts.join("");
  },
  calendar: (r) => {
    const parts = [`<rect x="2" y="3" width="20" height="18" rx="1.5" ${STROKE} opacity="0.5"/>`];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 6; j++) {
      parts.push(`<rect x="${3.5 + j * 3.1}" y="${5 + i * 3.1}" width="2.4" height="2.4" fill="currentColor" opacity="${0.1 + r() * 0.75}" stroke="none"/>`);
    } return parts.join("");
  },
  radar: () => `<polygon points="12,2 21,9 17.5,20 6.5,20 3,9" ${STROKE} opacity="0.4"/><polygon points="12,6 17,10 15,17 9,17 7,10" fill="currentColor" opacity="0.4" stroke="currentColor"/>`,
  sankey: () => `<path d="M2,5 C10,5 10,7 22,7" ${STROKE} stroke-width="3" opacity="0.6"/><path d="M2,12 C10,12 10,9.5 22,9.5" ${STROKE} stroke-width="2" opacity="0.4"/><path d="M2,19 C10,19 10,15 22,15" ${STROKE} stroke-width="4" opacity="0.75"/>`,
  chord: () => `<circle cx="12" cy="12" r="9.5" ${STROKE} opacity="0.35"/>` + [0, 1, 2, 3].map((i) => {
    const a1 = (i / 4) * Math.PI * 2, a2 = ((i + 2.3) / 4) * Math.PI * 2 + 1;
    const x1 = 12 + 9.5 * Math.cos(a1), y1 = 12 + 9.5 * Math.sin(a1);
    const x2 = 12 + 9.5 * Math.cos(a2), y2 = 12 + 9.5 * Math.sin(a2);
    return `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} Q12,12 ${x2.toFixed(1)},${y2.toFixed(1)}" ${STROKE} opacity="0.55"/>`;
  }).join(""),
  gauge: () => `<path d="M3,19 A9,9 0 0 1 21,19" ${STROKE} opacity="0.35"/><path d="M3,19 A9,9 0 0 1 15,4.5" ${STROKE}/><line x1="12" y1="19" x2="17" y2="10" ${STROKE}/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/>`,
  dectree: () => `<circle cx="4" cy="12" r="2" fill="currentColor" stroke="none"/><line x1="6" y1="12" x2="11" y2="6" ${STROKE} opacity="0.6"/><line x1="6" y1="12" x2="11" y2="12" ${STROKE} opacity="0.6"/><line x1="6" y1="12" x2="11" y2="18" ${STROKE} opacity="0.6"/><circle cx="13" cy="6" r="1.7" fill="currentColor" opacity="0.7" stroke="none"/><circle cx="13" cy="12" r="1.7" fill="currentColor" opacity="0.7" stroke="none"/><circle cx="13" cy="18" r="1.7" fill="currentColor" opacity="0.7" stroke="none"/><line x1="15" y1="6" x2="19" y2="3" ${STROKE} opacity="0.4"/><line x1="15" y1="6" x2="19" y2="8" ${STROKE} opacity="0.4"/><circle cx="21" cy="3" r="1.3" fill="currentColor" opacity="0.5" stroke="none"/><circle cx="21" cy="8" r="1.3" fill="currentColor" opacity="0.5" stroke="none"/>`,
  network: (r) => {
    const pts = [[4, 6], [18, 4], [11, 12], [3, 18], [19, 18], [12, 20]];
    const edges = [[0, 2], [1, 2], [2, 3], [2, 4], [3, 5], [4, 5]];
    let out = edges.map(([a, b]) => `<line x1="${pts[a][0]}" y1="${pts[a][1]}" x2="${pts[b][0]}" y2="${pts[b][1]}" ${STROKE} opacity="0.4"/>`).join("");
    out += pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="1.8" fill="currentColor" stroke="none"/>`).join("");
    return out;
  },
  wordcloud: () => `<text x="2" y="9" font-size="7" fill="currentColor" opacity="0.85" stroke="none" font-family="sans-serif">Aa</text><text x="12" y="7" font-size="4" fill="currentColor" opacity="0.5" stroke="none" font-family="sans-serif">bb</text><text x="3" y="18" font-size="5" fill="currentColor" opacity="0.6" stroke="none" font-family="sans-serif">Cc</text><text x="13" y="19" font-size="6" fill="currentColor" opacity="0.7" stroke="none" font-family="sans-serif">Dd</text>`,
  icongrid: () => {
    const parts = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      parts.push(`<rect x="${2 + i * 7.3}" y="${3 + j * 10}" width="5.5" height="7.5" rx="1" ${STROKE} opacity="0.6"/>`);
    } return parts.join("");
  },
  timeline: (r) => {
    const parts = [`<line x1="2" y1="12" x2="22" y2="12" ${STROKE} opacity="0.5"/>`];
    [3, 8, 13, 18, 21.5].forEach((x, i) => {
      parts.push(`<circle cx="${x}" cy="12" r="1.6" fill="currentColor" stroke="none"/>`);
      parts.push(`<line x1="${x}" y1="12" x2="${x}" y2="${i % 2 === 0 ? 5 : 19}" ${STROKE} opacity="0.4"/>`);
    });
    return parts.join("");
  },
  gantt: (r) => {
    const parts = [];
    [2, 6, 10, 14, 18].forEach((y, i) => {
      const x = 2 + r() * 8;
      const w = 5 + r() * 8;
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="3" rx="1" fill="currentColor" opacity="${0.4 + i * 0.1}" stroke="none"/>`);
    });
    return parts.join("");
  },
  bullet: (r) => `<rect x="2" y="9" width="20" height="6" fill="currentColor" opacity="0.15" stroke="none"/><rect x="2" y="9" width="13" height="6" fill="currentColor" opacity="0.55" stroke="none"/><line x1="16" y1="6" x2="16" y2="18" stroke="currentColor" stroke-width="2"/>`,
  smallmultiples: (r) => {
    const cells = [[1, 1], [13, 1], [1, 13], [13, 13]];
    return cells.map(([x, y]) => `<g transform="translate(${x},${y}) scale(0.42)">${bars(r, 4, false, false, false)}</g><rect x="${x}" y="${y}" width="10" height="10" ${STROKE} opacity="0.25"/>`).join("");
  },
  map: () => `<path d="M12,2 C7,2 4,5.5 4,9.5 C4,15 12,22 12,22 C12,22 20,15 20,9.5 C20,5.5 17,2 12,2 Z" ${STROKE}/><circle cx="12" cy="9.5" r="2.6" fill="currentColor" opacity="0.7" stroke="none"/>`,
  list: (r) => {
    const parts = [];
    [3, 9.5, 16].forEach((y, i) => {
      parts.push(`<rect x="2" y="${y}" width="4" height="4" rx="1" ${STROKE} opacity="${i === 0 ? 1 : 0.4}"/>`);
      if (i === 0) parts.push(`<path d="M3,${y + 2} l1,1 l2,-2" ${STROKE}/>`);
      parts.push(`<line x1="9" y1="${y + 2}" x2="21" y2="${y + 2}" ${STROKE} opacity="0.5"/>`);
    });
    return parts.join("");
  },
  dropdown: () => `<rect x="2" y="8" width="20" height="8" rx="2" ${STROKE}/><path d="M16,11 l2,2 l2,-2" ${STROKE}/><line x1="5" y1="12" x2="12" y2="12" ${STROKE} opacity="0.5"/>`,
  date: () => `<rect x="2" y="4" width="20" height="17" rx="1.5" ${STROKE}/><line x1="2" y1="9" x2="22" y2="9" ${STROKE}/><line x1="7" y1="2" x2="7" y2="6" ${STROKE}/><line x1="17" y1="2" x2="17" y2="6" ${STROKE}/><rect x="9" y="12" width="3" height="3" fill="currentColor" stroke="none" opacity="0.7"/>`,
  hierarchy: () => `<path d="M4,4 l2,2 l2,-2" ${STROKE}/><line x1="10" y1="5" x2="20" y2="5" ${STROKE} opacity="0.6"/><line x1="7" y1="9" x2="7" y2="20" ${STROKE} opacity="0.3"/><path d="M9,11 l2,2 l2,-2" ${STROKE}/><line x1="15" y1="12" x2="20" y2="12" ${STROKE} opacity="0.5"/><line x1="9" y1="18" x2="20" y2="18" ${STROKE} opacity="0.4"/>`,
  slider: () => `<line x1="2" y1="12" x2="22" y2="12" ${STROKE} opacity="0.5"/><circle cx="9" cy="12" r="2.6" fill="currentColor" stroke="none"/><circle cx="17" cy="12" r="2.6" fill="currentColor" stroke="none"/>`,
  matrix: () => `<line x1="2" y1="8" x2="22" y2="8" ${STROKE} opacity="0.7"/><line x1="9" y1="2" x2="9" y2="22" ${STROKE} opacity="0.5"/><line x1="2" y1="14" x2="22" y2="14" ${STROKE} opacity="0.35"/><rect x="2" y="2" width="7" height="6" fill="currentColor" opacity="0.25" stroke="none"/><line x1="12" y1="11" x2="19" y2="11" ${STROKE} opacity="0.3"/><line x1="12" y1="17" x2="19" y2="17" ${STROKE} opacity="0.3"/>`,
  table: () => `<rect x="2" y="3" width="20" height="18" ${STROKE} opacity="0.5"/><line x1="2" y1="8" x2="22" y2="8" ${STROKE}/><line x1="2" y1="13" x2="22" y2="13" ${STROKE} opacity="0.3"/><line x1="2" y1="18" x2="22" y2="18" ${STROKE} opacity="0.3"/><line x1="9" y1="3" x2="9" y2="21" ${STROKE} opacity="0.3"/><line x1="16" y1="3" x2="16" y2="21" ${STROKE} opacity="0.3"/>`,
  pivot: () => `<rect x="2" y="2" width="7" height="6" fill="currentColor" opacity="0.3" stroke="none"/><line x1="2" y1="8" x2="22" y2="8" ${STROKE}/><line x1="9" y1="2" x2="9" y2="22" ${STROKE}/><line x1="2" y1="14" x2="22" y2="14" ${STROKE} opacity="0.3"/><line x1="15" y1="2" x2="15" y2="22" ${STROKE} opacity="0.3"/>`,
  influencers: () => `<path d="M4,14 l3,-4 l3,3 l4,-6 l4,4" ${STROKE}/><circle cx="18" cy="7" r="1.6" fill="currentColor" stroke="none"/><line x1="2" y1="20" x2="22" y2="20" ${STROKE} opacity="0.4"/>`,
  kpi: () => `<text x="4" y="16" font-size="11" font-weight="700" fill="currentColor" stroke="none" font-family="sans-serif">42</text><path d="M17,9 l3,-3 l3,3" ${STROKE} opacity="0.7"/>`,
  card: () => `<rect x="2" y="4" width="20" height="16" rx="2" ${STROKE} opacity="0.5"/><text x="6" y="15" font-size="8" font-weight="700" fill="currentColor" stroke="none" font-family="sans-serif">9</text>`,
  multirow: () => `<line x1="2" y1="4" x2="14" y2="4" ${STROKE} opacity="0.6"/><line x1="2" y1="9" x2="9" y2="9" ${STROKE}/><line x1="2" y1="13" x2="14" y2="13" ${STROKE} opacity="0.6"/><line x1="2" y1="18" x2="9" y2="18" ${STROKE}/>`,
  infographic: () => `<rect x="2" y="2" width="20" height="20" rx="3" ${STROKE} opacity="0.5"/><circle cx="8" cy="9" r="3" fill="currentColor" opacity="0.5" stroke="none"/><line x1="13" y1="7" x2="19" y2="7" ${STROKE} opacity="0.6"/><line x1="13" y1="11" x2="19" y2="11" ${STROKE} opacity="0.35"/><line x1="4" y1="17" x2="20" y2="17" ${STROKE} opacity="0.3"/>`,
  textbox: () => `<line x1="2" y1="5" x2="22" y2="5" ${STROKE} opacity="0.7"/><line x1="2" y1="10" x2="22" y2="10" ${STROKE} opacity="0.45"/><line x1="2" y1="15" x2="16" y2="15" ${STROKE} opacity="0.45"/>`,
  image: () => `<rect x="2" y="3" width="20" height="18" rx="1.5" ${STROKE}/><circle cx="8" cy="9" r="2.1" ${STROKE}/><path d="M3,18 l6,-6 l4,4 l4,-5 l6,7" ${STROKE}/>`,
  logo: () => `<path d="M12,2 L21,7 V17 L12,22 L3,17 V7 Z" ${STROKE}/><circle cx="12" cy="12" r="3.2" fill="currentColor" opacity="0.5" stroke="none"/>`,
  button: () => `<rect x="3" y="8" width="18" height="8" rx="4" ${STROKE}/><line x1="8" y1="12" x2="16" y2="12" ${STROKE} opacity="0.6"/>`,
  rect: () => `<rect x="3" y="5" width="18" height="14" rx="1" ${STROKE}/>`,
  circle: () => `<circle cx="12" cy="12" r="9" ${STROKE}/>`,
  lineShape: () => `<line x1="3" y1="19" x2="21" y2="5" ${STROKE}/>`,
  divider: () => `<line x1="2" y1="12" x2="22" y2="12" ${STROKE}/>`,
  iconShape: () => `<path d="M12,2 L14.7,9 L22,9.5 L16.3,14.2 L18.2,21.5 L12,17.3 L5.8,21.5 L7.7,14.2 L2,9.5 L9.3,9 Z" ${STROKE}/>`,
  sectionHeader: () => `<line x1="2" y1="8" x2="15" y2="8" stroke-width="3" ${STROKE}/><line x1="2" y1="15" x2="22" y2="15" ${STROKE} opacity="0.3"/>`,
  groupContainer: () => `<rect x="2.5" y="2.5" width="19" height="19" rx="2" ${STROKE} stroke-dasharray="3 2" opacity="0.7"/>`,
};

export function buildGlyph(kind, seedStr) {
  const r = rng(seedStr || kind);
  const fn = GLYPHS[kind] || GLYPHS.rect;
  return svgWrap(fn(r));
}

export function glyphKinds() {
  return Object.keys(GLYPHS);
}
