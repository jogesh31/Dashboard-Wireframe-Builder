import { escapeHtml } from "./utils/dom.js";
import { buildGlyph } from "./visualIcons.js";
import { getVisualDef } from "./visualLibrary.js";
import { renderPbiChart, renderPbiCard, renderPbiTable, renderPbiMap, renderPbiSlicer } from "./pbiVisuals.js";

const RADIAL_KINDS = new Set(["pie", "donut", "sunburst", "treemap", "funnel", "sankey", "chord", "network", "wordcloud", "icongrid", "smallmultiples", "calendar"]);

function editable(field, value, cls, extra = "") {
  return `<div class="${cls}" data-field="${field}" ${extra}>${escapeHtml(value ?? "")}</div>`;
}

function legendChips(legend) {
  if (!legend) return "";
  const parts = legend.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return "";
  return `<div class="viz-legend">${parts.map((p) => `<div class="viz-legend-chip"><span class="dot"></span>${escapeHtml(p)}</div>`).join("")}</div>`;
}

function renderChart(el, def) {
  const c = el.content || {};
  const showAxis = !RADIAL_KINDS.has(def.iconKind) && (c.axisX || c.axisY);
  const footerAxis = showAxis
    ? `<div class="viz-axis"><span>${escapeHtml(c.axisY || "")}</span><span>${escapeHtml(c.axisX || "")}</span></div>`
    : RADIAL_KINDS.has(def.iconKind) && (c.category || c.value)
    ? `<div class="viz-axis"><span>${escapeHtml(c.category || "")}</span><span>${escapeHtml(c.value || "")}</span></div>`
    : "";
  return `
    <div class="viz-card">
      <div class="viz-header">
        ${editable("title", c.title, "viz-title")}
        ${c.subtitle !== undefined && c.subtitle !== "" ? editable("subtitle", c.subtitle, "viz-subtitle") : ""}
      </div>
      <div class="viz-body"><div class="viz-glyph">${buildGlyph(def.iconKind, el.id)}</div></div>
      <div class="viz-footer">${footerAxis}${legendChips(c.legend)}</div>
    </div>`;
}

function trendClass(notes) {
  if (!notes) return "";
  if (/^[+↑]/.test(notes.trim())) return "pos";
  if (/^[-↓]/.test(notes.trim())) return "neg";
  return "";
}

function renderCardStat(el, def) {
  const c = el.content || {};
  switch (def.iconKind) {
    case "kpi":
      return `<div class="stat-card">
        ${editable("title", c.title, "st-label")}
        ${editable("value", c.value ?? "0", "st-value")}
        ${c.notes !== undefined && c.notes !== "" ? `<div class="st-sub ${trendClass(c.notes)}" data-field="notes">${escapeHtml(c.notes)}</div>` : ""}
      </div>`;
    case "card":
      return `<div class="stat-card compact">
        ${editable("value", c.value ?? "0", "st-value")}
        ${editable("subtitle", c.subtitle, "st-label")}
      </div>`;
    case "multirow": {
      const rowsSrc = c.rows || "Metric A: 128\nMetric B: 76\nMetric C: 54";
      const rows = rowsSrc.split("\n").filter(Boolean).map((line) => {
        const idx = line.lastIndexOf(":");
        const label = idx > -1 ? line.slice(0, idx).trim() : line;
        const value = idx > -1 ? line.slice(idx + 1).trim() : "";
        return `<div class="multirow-row"><span class="mr-label">${escapeHtml(label)}</span><span class="mr-value">${escapeHtml(value)}</span></div>`;
      }).join("");
      return `<div class="multirow-list">${editable("title", c.title, "mr-title")}${rows}</div>`;
    }
    case "gauge":
      return `<div class="gauge-card">
        ${editable("title", c.title, "viz-title")}
        <div class="gc-body">
          <div class="viz-glyph" style="width:80%;height:80%">${buildGlyph("gauge", el.id)}</div>
          ${editable("value", c.value ?? "0%", "gc-value")}
        </div>
      </div>`;
    case "bullet": {
      const pct = Math.max(0, Math.min(100, parseInt(c.value) || 65));
      return `<div class="bullet-card">
        ${editable("title", c.title, "st-label")}
        <div class="bullet-track"><div class="bullet-fill" style="width:${pct}%"></div><div class="bullet-target" style="left:80%"></div></div>
        ${c.subtitle ? editable("subtitle", c.subtitle, "st-sub") : ""}
      </div>`;
    }
    case "influencers": {
      const items = (c.notes || "Region drives Value\nSegment increases Value\nChannel decreases Value").split("\n").filter(Boolean);
      return `<div class="infl-card">
        ${editable("title", c.title, "st-label")}
        ${items.map((t, i) => `<div class="infl-row"><div class="infl-bar" style="width:${28 - i * 8}px"></div>${escapeHtml(t)}</div>`).join("")}
      </div>`;
    }
    case "infographic":
      return `<div class="infographic-card">
        <div class="ig-icon">${buildGlyph("iconShape", el.id)}</div>
        <div>
          ${editable("value", c.value ?? "1,204", "ig-value")}
          ${editable("subtitle", c.subtitle, "ig-label")}
        </div>
      </div>`;
    default:
      return renderChart(el, def);
  }
}

function tableColumns(el) {
  if (el.content?.linkedColumns && el.content.linkedColumns.length) return el.content.linkedColumns;
  return ["Column A", "Column B", "Column C", "Column D"];
}

function renderTable(el, def) {
  const cols = tableColumns(el);
  const rowCount = def.iconKind === "matrix" ? 4 : 5;
  const headCells = cols.map((c) => `<div class="tm-cell">${escapeHtml(c)}</div>`).join("");
  const rows = Array.from({ length: rowCount }).map(() =>
    `<div class="tm-row">${cols.map(() => `<div class="tm-cell"><div class="tm-bar" style="width:${40 + Math.round(Math.random() * 45)}%"></div></div>`).join("")}</div>`
  ).join("");
  return `<div class="viz-card" style="padding:8px 8px 6px">
    <div class="viz-header">${editable("title", el.content?.title, "viz-title")}</div>
    <div class="table-mock" style="flex:1;margin-top:4px">
      <div class="tm-head">${headCells}</div>
      ${rows}
    </div>
  </div>`;
}

function renderMap(el, def) {
  const c = el.content || {};
  return `<div class="viz-card">
    <div class="viz-header">${editable("title", c.title, "viz-title")}${c.subtitle ? editable("subtitle", c.subtitle, "viz-subtitle") : ""}</div>
    <div class="mc-body map-card-body" style="flex:1;background:#eef0f4;border-radius:3px;display:flex;align-items:center;justify-content:center;margin-top:4px">
      <div class="viz-glyph" style="width:44px;height:44px;flex:none;color:#8a8fe0">${buildGlyph("map", el.id)}</div>
    </div>
  </div>`;
}

function renderFilter(el, def) {
  const c = el.content || {};
  const labelHtml = `<div class="fc-label">${buildGlyph(def.iconKind === "list" ? "list" : def.iconKind, el.id).replace("<svg", '<svg style="width:12px;height:12px"')}<span data-field="category" style="outline:none">${escapeHtml(c.category || "Field Name")}</span></div>`;
  let body = "";
  switch (def.iconKind) {
    case "list": {
      const opts = ["Option One", "Option Two", "Option Three"];
      body = opts.map((o, i) => `<div class="filter-list-row ${i === 0 ? "checked" : ""}"><span class="chk"></span>${o}</div>`).join("");
      break;
    }
    case "dropdown":
      body = `<div class="filter-dropdown-box"><span>All</span><span>▾</span></div>`;
      break;
    case "date": {
      let cells = "";
      for (let i = 0; i < 28; i++) cells += `<div class="d-cell ${i === 14 ? "hi" : ""}"></div>`;
      body = `<div class="filter-date-grid">${cells}</div>`;
      break;
    }
    case "hierarchy":
      body = `<div class="filter-hierarchy-row">▾ Region</div><div class="filter-hierarchy-row" style="padding-left:14px">▾ Country</div><div class="filter-hierarchy-row" style="padding-left:28px">City</div>`;
      break;
    case "slider":
      body = `<div class="filter-slider-track"><div class="fs-range" style="left:20%;right:30%"></div><div class="fs-handle" style="left:20%"></div><div class="fs-handle" style="left:70%"></div></div>`;
      break;
    default:
      body = buildGlyph(def.iconKind, el.id);
  }
  return `<div class="filter-card">${labelHtml}${body}</div>`;
}

function renderText(el) {
  const c = el.content || {};
  return `<div class="text-content" data-field="text" contenteditable="false">${escapeHtml(c.text ?? "")}</div>`;
}

// Pasted images are always embedded data: URLs. Anything else in a project
// file (a web link, javascript:, a broken value) is ignored rather than
// loaded — files come from other people, so they're treated as untrusted.
const SAFE_IMAGE_SRC = /^data:image\/(png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i;

function renderImage(el, def) {
  const c = el.content || {};
  if (c.imageSrc && SAFE_IMAGE_SRC.test(c.imageSrc)) {
    return `<img class="pasted-image" src="${escapeHtml(c.imageSrc)}" alt="${escapeHtml(c.imageLabel || "Pasted image")}" draggable="false" />`;
  }
  const label = def.type === "logo" ? "Logo" : c.imageLabel || "Image placeholder";
  return `<div class="image-placeholder">${buildGlyph(def.type === "logo" ? "logo" : "image", el.id)}<div class="ip-label">${escapeHtml(label)}</div></div>`;
}

function renderButton(el) {
  const c = el.content || {};
  return `<div class="button-mock" data-field="text" contenteditable="false">${escapeHtml(c.text ?? "Button")}</div>`;
}

function renderShape(el, def) {
  const shapeType = el.content?.shapeType || def.iconKind;
  if (shapeType === "iconShape" || def.iconKind === "iconShape") {
    return `<div class="shape-icon-fill">${buildGlyph("iconShape", el.id)}</div>`;
  }
  return `<div class="shape-fill"></div>`;
}

function renderIcon(el) {
  return `<div class="icon-only">${buildGlyph("iconShape", el.id)}</div>`;
}

function renderSectionHeader(el) {
  const c = el.content || {};
  return `<div class="section-header-mock"><div class="sh-text" data-field="text" contenteditable="false">${escapeHtml(c.text ?? "Section Header")}</div></div>`;
}

function renderGroupContainer(el) {
  const c = el.content || {};
  return `<div class="group-container-mock"><div class="gc-tab" data-field="text" contenteditable="false">${escapeHtml(c.text ?? "Group")}</div></div>`;
}

export function renderElementBody(el) {
  const def = getVisualDef(el.type) || { family: el.family, iconKind: el.family };
  switch (def.family || el.family) {
    case "chart":
      return renderPbiChart(el, def);
    case "cardstat":
      return renderPbiCard(el, def);
    case "table":
      return renderPbiTable(el, def);
    case "map":
      return renderPbiMap(el, def);
    case "filter":
      return renderPbiSlicer(el, def);
    case "text":
      return renderText(el);
    case "image":
      return renderImage(el, def);
    case "button":
      return renderButton(el);
    case "shape":
      return renderShape(el, def);
    case "icon":
      return renderIcon(el);
    case "sectionHeader":
      return renderSectionHeader(el);
    case "groupContainer":
      return renderGroupContainer(el);
    default:
      return renderPbiChart(el, def);
  }
}

export function elementEditableFieldSelector(el) {
  const def = getVisualDef(el.type) || { family: el.family };
  const map = {
    text: ["text"],
    button: ["text"],
    sectionHeader: ["text"],
    groupContainer: ["text"],
    chart: ["title", "subtitle"],
    cardstat: ["title", "value", "subtitle", "notes"],
    table: ["title"],
    map: ["title", "subtitle"],
    filter: ["category"],
  };
  return map[def.family] || [];
}
