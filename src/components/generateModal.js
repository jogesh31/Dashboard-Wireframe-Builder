import { store } from "../store.js";
import { UI } from "../uiIcons.js";
import { h } from "../utils/dom.js";
import { groupedCatalog } from "../visualLibrary.js";
import { showToast } from "./toast.js";
import { fitToScreen } from "./canvas.js";
import { planGenerateLayout, generateStartY, parsePattern, rowSizes } from "../generateLayout.js";

// Order requested: Headers first, then Filters, then KPIs, then Visuals.
const SECTIONS = [
  { key: "containers", label: "Headers & Text", groups: ["Containers & Shapes"], defaultType: "section-header", placeholder: "e.g. Sales Overview", color: "#a19f9d" },
  { key: "filters", label: "Filters", groups: ["Filters"], defaultType: "slicer", placeholder: "e.g. Region", color: "#4ba3f0" },
  { key: "kpis", label: "KPIs", groups: ["Cards & KPIs"], defaultType: "kpi-card", placeholder: "e.g. Total Sales", color: "#8f7be8" },
  { key: "visuals", label: "Visuals", groups: ["Bar & Column", "Line & Area", "Pie & Part-to-whole", "Hierarchical & Flow", "Statistical", "Tables & Matrix", "Maps", "Time & Gantt", "Advanced / Other"], defaultType: "column-chart", placeholder: "e.g. Q4 Revenue", color: "#2fb58f" },
];

const PER_ROW_OPTIONS = [
  { v: "auto", l: "Auto", tip: "Up to 4 per row" },
  { v: "1", l: "1" },
  { v: "2", l: "2" },
  { v: "3", l: "3" },
  { v: "4", l: "4" },
  { v: "6", l: "6" },
  { v: "all", l: "All", tip: "All in one row" },
];

// Module-level so reopening the modal remembers what you were configuring.
// Every category defaults to exactly one row — delete it if you don't want that category.
const state = {
  containers: [{ type: "section-header", label: "" }],
  filters: [{ type: "slicer", label: "" }],
  kpis: [{ type: "kpi-card", label: "" }],
  visuals: [{ type: "column-chart", label: "" }],
};

// Layout per section (max visuals per row, or a custom pattern), remembered on this computer.
const LAYOUT_KEY = "wfd-generate-layouts";
const layouts = loadLayouts();

function loadLayouts() {
  const defaults = { containers: { perRow: "1", pattern: "" }, filters: { perRow: "all", pattern: "" }, kpis: { perRow: "all", pattern: "" }, visuals: { perRow: "2", pattern: "" } };
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "{}");
    Object.keys(defaults).forEach((k) => { if (saved[k]) defaults[k] = { ...defaults[k], ...saved[k] }; });
  } catch (err) { /* use defaults */ }
  return defaults;
}

function saveLayouts() {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layouts));
  } catch (err) { /* ignore */ }
}

let hintUpdaters = [];

function currentSections() {
  return SECTIONS.map((s) => ({ key: s.key, items: state[s.key], layout: layouts[s.key] }));
}

export function openGenerateModal() {
  render();
}

function render() {
  const overlay = h("div", { class: "modal-overlay" });
  const modal = h("div", { class: "modal generate-modal" });
  overlay.appendChild(modal);
  document.getElementById("modal-host").appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  modal.innerHTML = `
    <div class="modal-header-row">
      <h3>Generate visuals</h3>
      <button class="icon-btn" data-action="close">${UI.close}</button>
    </div>
    <p class="generate-subtitle">Add a row per visual, pick its type and (optionally) its title, and choose how many go in each row. The preview shows exactly where everything will land.</p>
    <div class="generate-body">
      <div class="generate-sections" id="generate-sections"></div>
      <div class="generate-preview">
        <div class="gp-head"><span>Preview</span><span class="gp-size" id="gp-size"></span></div>
        <div class="gp-page-wrap"><div class="gp-page" id="gp-page"></div></div>
        <div class="gp-legend">${SECTIONS.map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join("")}<span><i class="existing"></i>Already on page</span></div>
        <div class="gp-warnings" id="gp-warnings"></div>
      </div>
    </div>
    <div class="modal-actions" style="justify-content:space-between;align-items:center">
      <span class="generate-total" id="generate-total"></span>
      <div class="row" style="gap:8px">
        <button class="btn" data-action="cancel">Cancel</button>
        <button class="btn primary" data-action="generate">Generate</button>
      </div>
    </div>
  `;
  modal.querySelector('[data-action="close"]').addEventListener("click", close);
  modal.querySelector('[data-action="cancel"]').addEventListener("click", close);

  modal.appendChild(buildFieldDatalist());

  const sectionsWrap = modal.querySelector("#generate-sections");
  const groups = groupedCatalog();
  const totalLabel = modal.querySelector("#generate-total");

  hintUpdaters = [];
  const refresh = () => {
    hintUpdaters.forEach((fn) => fn());
    const total = SECTIONS.reduce((sum, s) => sum + state[s.key].length, 0);
    totalLabel.textContent = total ? `${total} visual${total === 1 ? "" : "s"} to add` : "Nothing selected yet";
    renderPreview(modal);
  };

  SECTIONS.forEach((section) => {
    sectionsWrap.appendChild(buildSection(section, groups, refresh));
  });
  refresh();

  modal.querySelector('[data-action="generate"]').addEventListener("click", () => {
    const created = store.generateElements(currentSections());
    close();
    if (created.length) {
      showToast(`Added ${created.length} visual${created.length === 1 ? "" : "s"} to the canvas`, "success");
      // Zoom out to show the whole page so it's immediately obvious nothing is cut off.
      setTimeout(() => fitToScreen(), 60);
    } else {
      showToast("Pick at least one visual first", "error");
    }
  });
}

// ---------------- live preview ----------------

function renderPreview(modal) {
  const pageEl = modal.querySelector("#gp-page");
  const page = store.getCurrentPage();
  const { width, height } = store.doc.canvas;
  const plan = planGenerateLayout(currentSections(), { canvasWidth: width, canvasHeight: height, startY: generateStartY(page) });
  const pageH = plan.neededHeight;

  modal.querySelector("#gp-size").textContent = pageH > height ? `${width} × ${pageH}px (page grows from ${height})` : `${width} × ${pageH}px`;
  pageEl.style.aspectRatio = `${width} / ${pageH}`;
  pageEl.innerHTML = "";
  const pct = (v, total) => `${(v / total) * 100}%`;
  const place = (box, cls, color, label) => {
    const b = h("div", { class: `gp-box ${cls}` }, label ? h("span", {}, label) : null);
    b.style.left = pct(box.x, width);
    b.style.top = pct(box.y, pageH);
    b.style.width = pct(box.w, width);
    b.style.height = pct(box.h, pageH);
    if (color) b.style.background = color;
    pageEl.appendChild(b);
  };
  page.elements.filter((e) => !e.hidden).forEach((e) => place(e, "existing"));
  const colorOf = Object.fromEntries(SECTIONS.map((s) => [s.key, s.color]));
  plan.boxes.forEach((b) => place(b, "new", colorOf[b.sectionKey], (b.label && b.label.trim()) || b.def.label));

  const warnEl = modal.querySelector("#gp-warnings");
  warnEl.innerHTML = "";
  plan.warnings.forEach((w) => {
    const section = SECTIONS.find((s) => s.key === w.sectionKey);
    warnEl.appendChild(h("div", { class: "gp-warning" }, `${section.label}: ${w.perRow} per row makes each one ${w.width}px wide — a ${w.label} needs about ${w.minWidth}px. Try fewer per row.`));
  });
}

// ---------------- sections ----------------

const FIELD_DATALIST_ID = "generate-field-suggestions";

// A single shared <datalist>, built from every column in every uploaded
// schema table. Each name input references it via `list=`, so typing still
// works exactly as free text (nothing is forced) while suggestions show up
// grouped by table — the `label` attribute renders as the table name next
// to the column name in browsers that support it (Firefox shows it inline;
// Chrome shows it as secondary text), degrading gracefully to a plain
// suggestion list elsewhere. No schema uploaded means an empty, harmless list.
function buildFieldDatalist() {
  const datalist = h("datalist", { id: FIELD_DATALIST_ID });
  store.doc.schema.tables.forEach((table) => {
    table.columns.forEach((col) => {
      datalist.appendChild(h("option", { value: col.name, label: table.name }));
    });
  });
  return datalist;
}

function buildSection(section, groups, refresh) {
  const wrap = h("div", { class: "generate-section" });
  const header = h("div", { class: "generate-section-header" }, [
    h("span", { class: "gs-dot", style: `background:${section.color}` }),
    h("span", { class: "gs-title" }, section.label),
  ]);
  const rowsWrap = h("div", { class: "generate-section-rows" });
  const addBtn = h("button", { class: "gs-add-link", type: "button" }, [
    h("span", { class: "icon", style: "width:12px;height:12px", html: UI.plus }),
    "Add row",
  ]);
  addBtn.addEventListener("click", () => {
    const rows = state[section.key];
    const last = rows[rows.length - 1];
    rows.push({ type: last ? last.type : section.defaultType, label: "" });
    renderRows();
    refresh();
  });

  header.appendChild(addBtn);
  wrap.appendChild(header);
  wrap.appendChild(rowsWrap);
  wrap.appendChild(buildLayoutControl(section, refresh));

  function renderRows() {
    rowsWrap.innerHTML = "";
    const rows = state[section.key];
    if (!rows.length) {
      rowsWrap.appendChild(h("div", { class: "gs-empty" }, "No rows — click “Add row” to include this category."));
      return;
    }
    rows.forEach((rowState, idx) => {
      const row = h("div", { class: "generate-row" });
      const select = buildSelect(section, groups, rowState.type);
      select.addEventListener("change", () => { state[section.key][idx].type = select.value; refresh(); });

      const labelInput = h("input", { type: "text", class: "gr-label-input", placeholder: section.placeholder, value: rowState.label, list: FIELD_DATALIST_ID, autocomplete: "off" });
      labelInput.addEventListener("input", () => { state[section.key][idx].label = labelInput.value; refresh(); });

      const delBtn = h("button", { class: "gr-del-btn", type: "button", "data-tip": "Remove this row", html: UI.close });
      delBtn.addEventListener("click", () => {
        state[section.key].splice(idx, 1);
        renderRows();
        refresh();
      });
      row.appendChild(select);
      row.appendChild(labelInput);
      row.appendChild(delBtn);
      rowsWrap.appendChild(row);
    });
  }
  renderRows();

  return wrap;
}

// "Max per row: Auto 1 2 3 4 6 All" plus a custom pattern box (e.g. 3,2,1).
function buildLayoutControl(section, refresh) {
  const layout = layouts[section.key];
  const wrap = h("div", { class: "gs-layout" }, [h("span", { class: "gs-layout-label" }, "Max per row")]);
  const seg = h("div", { class: "gs-perrow" });
  const pattern = h("input", { type: "text", class: "gs-pattern", placeholder: "Custom e.g. 3,2,1", value: layout.pattern, "data-tip": "Visuals in each row, left to right — the last number repeats" });
  const hint = h("span", { class: "gs-layout-hint" });

  const update = () => {
    const usingPattern = !!parsePattern(layout.pattern);
    seg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", !usingPattern && b.dataset.v === layout.perRow));
    pattern.classList.toggle("invalid", !!layout.pattern.trim() && !usingPattern);
    saveLayouts();
    refresh();
  };

  PER_ROW_OPTIONS.forEach((o) => {
    const b = h("button", { type: "button", "data-v": o.v, "data-tip": o.tip || `${o.v} per row` }, o.l);
    b.addEventListener("click", () => {
      layout.perRow = o.v;
      layout.pattern = "";
      pattern.value = "";
      update();
    });
    seg.appendChild(b);
  });
  pattern.addEventListener("input", () => { layout.pattern = pattern.value; update(); });

  wrap.appendChild(seg);
  wrap.appendChild(pattern);
  wrap.appendChild(hint);
  // "→ 3 rows: 2 + 2 + 2" — refreshed with the preview, so it follows added/removed rows.
  hintUpdaters.push(() => {
    const sizes = rowSizes(state[section.key].length, layout);
    hint.textContent = sizes.length ? `→ ${sizes.length} row${sizes.length === 1 ? "" : "s"}: ${sizes.join(" + ")}` : "";
  });

  const usingPattern = !!parsePattern(layout.pattern);
  seg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", !usingPattern && b.dataset.v === layout.perRow));
  return wrap;
}

function buildSelect(section, groups, selectedType) {
  const select = document.createElement("select");
  select.className = "gr-select";
  section.groups.forEach((groupName) => {
    const items = groups.get(groupName) || [];
    if (!items.length) return;
    const optgroup = document.createElement("optgroup");
    optgroup.label = section.groups.length > 1 ? groupName : section.label;
    items.forEach((def) => {
      const opt = document.createElement("option");
      opt.value = def.type;
      opt.textContent = def.label;
      if (def.type === selectedType) opt.selected = true;
      optgroup.appendChild(opt);
    });
    select.appendChild(optgroup);
  });
  return select;
}
