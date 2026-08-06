import { store } from "../store.js";
import { UI } from "../uiIcons.js";
import { buildGlyph } from "../visualIcons.js";
import { getVisualDef } from "../visualLibrary.js";
import { h, escapeHtml, clamp } from "../utils/dom.js";

let panelEl;

// Matches Power BI Desktop's built-in "Page view" > "Page size" presets, so a
// stakeholder who's used Power BI recognizes the same names/dimensions.
const PAGE_SIZE_PRESETS = [
  { name: "16:9", w: 1280, h: 720 },
  { name: "4:3", w: 960, h: 720 },
  { name: "Cortana", w: 400, h: 600 },
  { name: "Letter", w: 816, h: 1056 },
  { name: "Tooltip", w: 320, h: 240 },
  { name: "Custom", w: null, h: null },
];

function matchPagePreset(w, h) {
  const preset = PAGE_SIZE_PRESETS.find((p) => p.w === w && p.h === h);
  return preset ? preset.name : "Custom";
}

const FONT_OPTIONS = ["Segoe UI", "Arial", "Georgia", "Verdana", "Courier New", "Tahoma", "Trebuchet MS"];
const FIELD_LABELS = {
  title: "Title", subtitle: "Subtitle", value: "Value", category: "Category / Field",
  legend: "Legend (comma separated)", notes: "Notes", axisX: "X Axis label", axisY: "Y Axis label",
  text: "Text", rows: "Rows (label: value per line)",
};

const FIELD_DATALIST_ID = "properties-field-suggestions";
// content keys that represent a bound data-field name, not a free-form label
const SCHEMA_SUGGEST_FIELDS = new Set(["category", "axisX", "axisY", "value", "legend"]);

// Same idea as the Generate modal's field suggestions: a plain text input
// with schema column names as autocomplete suggestions (grouped by table via
// the `label` attribute), never forcing the value — you can still type
// anything. Used for fields like a filter's "Category / Field" name.
function buildFieldDatalist() {
  const datalist = h("datalist", { id: FIELD_DATALIST_ID });
  store.doc.schema.tables.forEach((table) => {
    table.columns.forEach((col) => {
      datalist.appendChild(h("option", { value: col.name, label: table.name }));
    });
  });
  return datalist;
}

export function initPropertiesPanel() {
  panelEl = document.getElementById("properties-panel");
  store.on("selection:change", render);
  store.on("elements:change", render);
  store.on("page:switch", render);
  store.on("schema:change", render);
  render();
}

function render() {
  panelEl.innerHTML = "";
  panelEl.appendChild(buildFieldDatalist());
  const selected = store.getSelectedElements();

  if (!selected.length) {
    panelEl.appendChild(renderPageSettings());
    return;
  }

  panelEl.appendChild(renderHeader(selected));
  panelEl.appendChild(renderAlignmentSection(selected.length));
  panelEl.appendChild(renderPositionSize(selected));
  panelEl.appendChild(renderAppearance(selected));

  if (selected.length === 1) {
    panelEl.appendChild(renderVisualProperties(selected[0]));
  }
}

function section(title, children) {
  const sec = h("div", { class: "section" });
  sec.appendChild(h("div", { class: "section-title" }, title));
  const stack = h("div", { class: "stack" });
  children.forEach((c) => c && stack.appendChild(c));
  sec.appendChild(stack);
  return sec;
}

function renderHeader(selected) {
  const single = selected.length === 1;
  const el = selected[0];
  const def = single ? getVisualDef(el.type) : null;
  const header = h("div", { class: "prop-header" });
  header.innerHTML = single
    ? `<div class="el-type-label"><span class="icon" style="width:16px;height:16px">${def ? buildGlyph(def.iconKind, el.id) : ""}</span>${escapeHtml(el.name || el.type)}</div><div class="el-id">${escapeHtml(el.type)}</div>`
    : `<div class="el-type-label">${selected.length} objects selected</div><div class="el-id">Mixed selection</div>`;
  return header;
}

function renderPageSettings() {
  const page = store.getCurrentPage();
  const { width, height } = store.doc.canvas;
  const currentPreset = matchPagePreset(width, height);
  return section("Page Settings", [
    field("Page Name", input({
      type: "text", value: page.name,
      onChange: (v) => store.renamePage(page.id, v),
    })),
    field("Page Size", selectInput(
      PAGE_SIZE_PRESETS.map((p) => ({ v: p.name, l: p.w ? `${p.name} (${p.w}×${p.h})` : p.name })),
      currentPreset,
      (name) => {
        const preset = PAGE_SIZE_PRESETS.find((p) => p.name === name);
        if (preset && preset.w) store.setCanvasSize(preset.w, preset.h);
        // "Custom" needs no action here — the Width/Height fields below stay
        // at their current values and become the editable source of truth.
      }
    )),
    row([
      field("Canvas Width", numberInput(store.doc.canvas.width, (v) => store.setCanvasSize(v, store.doc.canvas.height))),
      field("Canvas Height", numberInput(store.doc.canvas.height, (v) => store.setCanvasSize(store.doc.canvas.width, v))),
    ]),
    field("Page Background", colorInput(page.background || "#ffffff", (v) => store.setPageBackground(page.id, v))),
    h("div", { class: "empty-state", style: "padding:10px 0 0;text-align:left" }, "Select an object on the canvas to edit its properties, or drag a visual from the library to add one."),
  ]);
}

// ---------------- alignment ----------------
function renderAlignmentSection(selectedCount) {
  const enabled = selectedCount >= 2;
  const enabledDistribute = selectedCount >= 3;
  const ids = () => store.selection;
  const alignBtn = (icon, tip, mode, requireCount = 2) => {
    const b = h("button", { class: "icon-btn", "data-tip": tip, html: icon });
    b.disabled = selectedCount < requireCount;
    b.addEventListener("click", () => store.alignElements(ids(), mode));
    return b;
  };
  const row1 = h("div", { class: "align-btn-row" }, [
    alignBtn(UI.alignLeft, "Align left", "left"),
    alignBtn(UI.alignCenterH, "Align center", "center"),
    alignBtn(UI.alignRight, "Align right", "right"),
    alignBtn(UI.alignTop, "Align top", "top"),
    alignBtn(UI.alignMiddleV, "Align middle", "middle"),
    alignBtn(UI.alignBottom, "Align bottom", "bottom"),
  ]);
  const row2 = h("div", { class: "align-btn-row" }, [
    alignBtn(UI.equalWidth, "Equal width", "equal-width"),
    alignBtn(UI.equalHeight, "Equal height", "equal-height"),
    alignBtn(UI.distributeH, "Distribute horizontally", "distribute-h", 3),
    alignBtn(UI.distributeV, "Distribute vertically", "distribute-v", 3),
  ]);
  const hint = !enabled
    ? h("div", { class: "empty-state", style: "padding:2px 0 0;text-align:left" }, "Select 2 or more objects to align them — Shift-click each one, or drag a selection box over them on the canvas.")
    : null;
  return section("Align & Distribute", [row1, row2, hint]);
}

// ---------------- position/size ----------------
function renderPositionSize(selected) {
  const single = selected.length === 1;
  const el = selected[0];

  if (!single) {
    return section("Position & Size", [
      h("div", { class: "empty-state", style: "padding:4px 0;text-align:left" }, "Select a single object to edit exact position and size. Use arrow keys to nudge the whole selection."),
    ]);
  }

  const commit = (patch) => store.updateElement(el.id, patch);

  return section("Position & Size", [
    row([
      field("X", numberInput(Math.round(el.x), (v) => commit({ x: v }))),
      field("Y", numberInput(Math.round(el.y), (v) => commit({ y: v }))),
    ]),
    row([
      field("Width", numberInput(Math.round(el.w), (v) => commit({ w: Math.max(4, v) }))),
      field("Height", numberInput(Math.round(el.h), (v) => commit({ h: Math.max(4, v) }))),
    ]),
    field("Rotation (°)", numberInput(el.rotation || 0, (v) => commit({ rotation: v }), -360, 360)),
  ]);
}

// ---------------- appearance ----------------
function renderAppearance(selected) {
  const ids = selected.map((e) => e.id);
  const ref = selected[0];
  const applyStyle = (patch, opts) => store.batchUpdateStyle(ids, patch, opts);

  const bgRow = h("div", { class: "appearance-swatch-row" }, [
    field("Background", colorInput(safeColor(ref.style.background), (v) => applyStyle({ background: v }))),
    field("Border Color", colorInput(safeColor(ref.style.borderColor), (v) => applyStyle({ borderColor: v }))),
  ]);

  const borderRow = row([
    field("Border Width", numberInput(ref.style.borderWidth ?? 1, (v) => applyStyle({ borderWidth: Math.max(0, v) }), 0, 20)),
    field("Border Style", selectInput(["solid", "dashed", "dotted"], ref.style.borderStyle || "solid", (v) => applyStyle({ borderStyle: v }))),
  ]);

  const radiusField = field("Corner Radius", rangeWithValue(ref.style.borderRadius ?? 0, 0, 60, (v) => applyStyle({ borderRadius: v }, { pushHistory: false }), (v) => applyStyle({ borderRadius: v })));
  const opacityField = field("Opacity", rangeWithValue(ref.style.opacity ?? 100, 0, 100, (v) => applyStyle({ opacity: v }, { pushHistory: false }), (v) => applyStyle({ opacity: v }), "%"));

  const fontRow = row([
    field("Font", selectInput(FONT_OPTIONS, ref.style.fontFamily || "Segoe UI", (v) => applyStyle({ fontFamily: v }))),
    field("Font Size", numberInput(ref.style.fontSize ?? 13, (v) => applyStyle({ fontSize: v }), 8, 96)),
  ]);

  const weightAlignRow = row([
    field("Weight", selectInput([
      { v: "300", l: "Light" }, { v: "400", l: "Regular" }, { v: "600", l: "Semibold" }, { v: "700", l: "Bold" },
    ], ref.style.fontWeight || "400", (v) => applyStyle({ fontWeight: v }))),
    field("Text Color", colorInput(safeColor(ref.style.color), (v) => applyStyle({ color: v }))),
  ]);

  const alignField = field("Text Align", toggleGroup([
    { v: "left", icon: UI.alignLeft }, { v: "center", icon: UI.alignCenterH }, { v: "right", icon: UI.alignRight },
  ], ref.style.textAlign || "left", (v) => applyStyle({ textAlign: v })));

  const shadowField = field("Shadow", selectInput([
    { v: "none", l: "None" }, { v: "sm", l: "Small" }, { v: "md", l: "Medium" }, { v: "lg", l: "Large" },
  ], ref.style.shadow || "none", (v) => applyStyle({ shadow: v })));

  return section("Appearance", [bgRow, borderRow, radiusField, opacityField, fontRow, weightAlignRow, alignField, shadowField]);
}

function safeColor(c) {
  if (!c || c === "transparent") return "#ffffff";
  return c;
}

// ---------------- visual-specific content properties ----------------
function renderVisualProperties(el) {
  const def = getVisualDef(el.type);
  const family = def ? def.family : el.family;
  const fieldsByFamily = {
    chart: ["title", "subtitle", "axisX", "axisY", "category", "value", "legend"],
    cardstat: ["title", "value", "subtitle", "notes", "rows"],
    table: ["title"],
    map: ["title", "subtitle"],
    filter: ["category"],
    text: ["text"],
    button: ["text"],
    sectionHeader: ["text"],
    groupContainer: ["text"],
  };
  const fields = fieldsByFamily[family] || [];
  if (!fields.length) return document.createDocumentFragment();

  const inputs = fields.map((key) => {
    const label = FIELD_LABELS[key] || key;
    const value = el.content?.[key] ?? "";
    const isLong = key === "notes" || key === "rows" || key === "text";
    // Fields that conceptually hold a data-field name (a filter's bound
    // column, a chart's axis/category/value/legend) get schema suggestions;
    // free-form labels like title/subtitle/notes don't.
    const isFieldName = SCHEMA_SUGGEST_FIELDS.has(key);
    const control = isLong
      ? textareaInput(value, (v) => store.updateElementContent(el.id, { [key]: v }))
      : input({ type: "text", value, list: isFieldName ? FIELD_DATALIST_ID : undefined, onChange: (v) => store.updateElementContent(el.id, { [key]: v }) });
    return field(label, control);
  });

  if (family === "table") {
    inputs.push(...renderTableSchemaBinding(el));
  }

  return section("Visual Properties", inputs);
}

// Lets a table/matrix visual show real column headers from an uploaded
// schema table, instead of always falling back to "Column A, B, C, D".
// Falls back to a free-text comma list when no schema table is linked (or
// none has been uploaded yet), preserving the previous manual-entry behavior.
function renderTableSchemaBinding(el) {
  const tables = store.doc.schema.tables;
  const linkedTable = el.content.linkedTable || "";
  const schemaTable = tables.find((t) => t.name === linkedTable);

  const tableOptions = [{ v: "", l: "None (manual columns)" }, ...tables.map((t) => ({ v: t.name, l: t.name }))];
  const tableSelect = field("Data Table", selectInput(tableOptions, schemaTable ? linkedTable : "", (v) => {
    if (!v) {
      store.updateElementContent(el.id, { linkedTable: "" });
      return;
    }
    const t = tables.find((tt) => tt.name === v);
    // Selecting a table starts with every column checked, matching what the
    // Schema panel's "Insert as Table" shortcut does.
    store.updateElementContent(el.id, { linkedTable: v, linkedColumns: t.columns.map((c) => c.name) });
  }));

  if (!schemaTable) {
    return [
      tableSelect,
      field("Columns (comma separated)", input({
        type: "text",
        value: (el.content.linkedColumns || []).join(", "),
        onChange: (v) => store.updateElementContent(el.id, { linkedColumns: v.split(",").map((s) => s.trim()).filter(Boolean) }),
      })),
    ];
  }

  const selectedCols = new Set(el.content.linkedColumns || []);
  const checkboxList = h("div", { class: "stack", style: "gap:4px;max-height:180px;overflow-y:auto" });
  schemaTable.columns.forEach((col) => {
    const cb = h("input", { type: "checkbox" });
    cb.checked = selectedCols.has(col.name);
    cb.addEventListener("change", () => {
      const next = new Set(el.content.linkedColumns || []);
      if (cb.checked) next.add(col.name); else next.delete(col.name);
      store.updateElementContent(el.id, { linkedColumns: [...next] });
    });
    const row = h("label", { class: "menu-item", style: "padding:4px 0;cursor:pointer" }, [
      cb,
      h("span", { style: "margin-left:6px" }, col.name),
      h("span", { class: "shortcut" }, col.type),
    ]);
    checkboxList.appendChild(row);
  });

  return [tableSelect, field(`Columns (${selectedCols.size} of ${schemaTable.columns.length} shown)`, checkboxList)];
}

// ---------------- small form helpers ----------------
function field(label, control) {
  return h("div", { class: "field" }, [h("label", {}, label), control]);
}
function row(children) {
  return h("div", { class: "grid2" }, children);
}

function input({ type, value, list, onChange }) {
  const el = h("input", { type, value, list });
  el.addEventListener("change", () => onChange(el.value));
  el.addEventListener("keydown", (e) => e.stopPropagation());
  return el;
}

function textareaInput(value, onChange) {
  const el = h("textarea", {}, value);
  el.addEventListener("change", () => onChange(el.value));
  el.addEventListener("keydown", (e) => e.stopPropagation());
  return el;
}

function numberInput(value, onChange, min, max) {
  const el = h("input", { type: "number", value: Number.isFinite(value) ? value : 0 });
  if (min !== undefined) el.min = min;
  if (max !== undefined) el.max = max;
  el.addEventListener("change", () => {
    let v = parseFloat(el.value);
    if (isNaN(v)) v = 0;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    onChange(v);
  });
  el.addEventListener("keydown", (e) => e.stopPropagation());
  return el;
}

function colorInput(value, onChange) {
  const el = h("input", { type: "color", value });
  let committed = value;
  el.addEventListener("input", () => onChange(el.value));
  return el;
}

function selectInput(options, value, onChange) {
  const el = h("select", {});
  options.forEach((opt) => {
    const v = typeof opt === "string" ? opt : opt.v;
    const l = typeof opt === "string" ? opt : opt.l;
    const optEl = h("option", { value: v }, l);
    if (v === value) optEl.selected = true;
    el.appendChild(optEl);
  });
  el.addEventListener("change", () => onChange(el.value));
  return el;
}

function toggleGroup(options, value, onChange) {
  const wrap = h("div", { class: "btn-toggle-group" });
  const btns = options.map((opt) => {
    const b = h("button", { html: opt.icon, "data-tip": opt.v });
    b.classList.toggle("active", opt.v === value);
    b.addEventListener("click", () => {
      btns.forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      onChange(opt.v);
    });
    return b;
  });
  btns.forEach((b) => wrap.appendChild(b));
  return wrap;
}

function rangeWithValue(value, min, max, onInput, onCommit, suffix = "") {
  const wrap = h("div", { class: "row" });
  const rangeEl = h("input", { type: "range", min, max, value });
  const valEl = h("span", { class: "opacity-value" }, `${value}${suffix}`);
  rangeEl.addEventListener("input", () => {
    valEl.textContent = `${rangeEl.value}${suffix}`;
    onInput(parseFloat(rangeEl.value));
  });
  rangeEl.addEventListener("change", () => onCommit(parseFloat(rangeEl.value)));
  wrap.appendChild(rangeEl);
  wrap.appendChild(valEl);
  return wrap;
}
