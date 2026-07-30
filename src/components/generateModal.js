import { store } from "../store.js";
import { UI } from "../uiIcons.js";
import { h } from "../utils/dom.js";
import { groupedCatalog } from "../visualLibrary.js";
import { showToast } from "./toast.js";
import { fitToScreen } from "./canvas.js";

// Order requested: Headers first, then Filters, then KPIs, then Visuals.
const SECTIONS = [
  { key: "containers", label: "Headers & Text", groups: ["Containers & Shapes"], defaultType: "section-header", placeholder: "e.g. Sales Overview" },
  { key: "filters", label: "Filters", groups: ["Filters"], defaultType: "slicer", placeholder: "e.g. Region" },
  { key: "kpis", label: "KPIs", groups: ["Cards & KPIs"], defaultType: "kpi-card", placeholder: "e.g. Total Sales" },
  { key: "visuals", label: "Visuals", groups: ["Bar & Column", "Line & Area", "Pie & Part-to-whole", "Hierarchical & Flow", "Statistical", "Tables & Matrix", "Maps", "Time & Gantt", "Advanced / Other"], defaultType: "column-chart", placeholder: "e.g. Q4 Revenue" },
];

// Module-level so reopening the modal remembers what you were configuring.
// Every category defaults to exactly one row — delete it if you don't want that category.
const state = {
  containers: [{ type: "section-header", label: "" }],
  filters: [{ type: "slicer", label: "" }],
  kpis: [{ type: "kpi-card", label: "" }],
  visuals: [{ type: "column-chart", label: "" }],
};

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
    <p class="generate-subtitle">Add a row per visual, pick its type and (optionally) its title — remove any you don't need — then generate the whole set at once, auto-arranged as a clean grid.</p>
    <div class="generate-sections" id="generate-sections"></div>
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

  const sectionsWrap = modal.querySelector("#generate-sections");
  const groups = groupedCatalog();
  const totalLabel = modal.querySelector("#generate-total");

  const updateTotal = () => {
    const total = SECTIONS.reduce((sum, s) => sum + state[s.key].length, 0);
    totalLabel.textContent = total ? `${total} visual${total === 1 ? "" : "s"} to add` : "Nothing selected yet";
  };

  SECTIONS.forEach((section) => {
    sectionsWrap.appendChild(buildSection(section, groups, updateTotal));
  });
  updateTotal();

  modal.querySelector('[data-action="generate"]').addEventListener("click", () => {
    const orderedGroups = SECTIONS.map((s) => state[s.key]);
    const created = store.generateElements(orderedGroups);
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

function buildSection(section, groups, updateTotal) {
  const wrap = h("div", { class: "generate-section" });
  const header = h("div", { class: "generate-section-header" }, [
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
    updateTotal();
  });

  header.appendChild(addBtn);
  wrap.appendChild(header);
  wrap.appendChild(rowsWrap);

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
      select.addEventListener("change", () => { state[section.key][idx].type = select.value; });

      const labelInput = h("input", { type: "text", class: "gr-label-input", placeholder: section.placeholder, value: rowState.label });
      labelInput.addEventListener("input", () => { state[section.key][idx].label = labelInput.value; });

      const delBtn = h("button", { class: "gr-del-btn", type: "button", "data-tip": "Remove this row", html: UI.close });
      delBtn.addEventListener("click", () => {
        state[section.key].splice(idx, 1);
        renderRows();
        updateTotal();
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
