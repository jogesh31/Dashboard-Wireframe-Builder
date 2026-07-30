import { store } from "../store.js";
import { groupedCatalog } from "../visualLibrary.js";
import { buildGlyph } from "../visualIcons.js";
import { h, escapeHtml } from "../utils/dom.js";
import { clientToPageCoords } from "./canvasElement.js";
import { showToast } from "./toast.js";

let panelEl;
let searchInput;
let categoriesEl;
const collapsedGroups = new Set();

export function initLibraryPanel() {
  panelEl = document.getElementById("library-panel");
  buildShell();
  renderResults("");
}

// Built once. The search <input> is never destroyed/recreated on keystroke —
// only the results below it are — so typing never loses focus.
function buildShell() {
  panelEl.innerHTML = "";

  const searchWrap = h("div", { id: "library-search" });
  searchInput = h("input", { type: "search", placeholder: "Search visuals…" });
  searchInput.addEventListener("input", () => renderResults(searchInput.value));
  searchWrap.appendChild(searchInput);
  panelEl.appendChild(searchWrap);

  categoriesEl = h("div", { class: "library-categories" });
  panelEl.appendChild(categoriesEl);
}

function renderResults(filterText) {
  categoriesEl.innerHTML = "";

  const groups = groupedCatalog();
  const q = filterText.trim().toLowerCase();

  let anyResults = false;
  groups.forEach((items, groupName) => {
    const filtered = q ? items.filter((it) => it.label.toLowerCase().includes(q)) : items;
    if (!filtered.length) return;
    anyResults = true;
    const collapsed = collapsedGroups.has(groupName) && !q;
    const catEl = h("div", { class: `lib-category ${collapsed ? "collapsed" : ""}` });
    const headerEl = h("div", { class: "lib-category-header" }, [
      chevSvg(),
      groupName,
      h("span", { class: "count" }, String(filtered.length)),
    ]);
    headerEl.addEventListener("click", () => {
      if (collapsedGroups.has(groupName)) collapsedGroups.delete(groupName);
      else collapsedGroups.add(groupName);
      renderResults(searchInput.value);
    });
    catEl.appendChild(headerEl);

    const gridEl = h("div", { class: "lib-grid" });
    filtered.forEach((def) => gridEl.appendChild(renderLibItem(def)));
    catEl.appendChild(gridEl);

    categoriesEl.appendChild(catEl);
  });

  if (!anyResults) {
    categoriesEl.appendChild(h("div", { class: "lib-empty" }, `No visuals match "${escapeHtml(filterText)}"`));
  }
}

function chevSvg() {
  const span = document.createElement("span");
  span.className = "icon chev";
  span.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg>`;
  return span;
}

function renderLibItem(def) {
  const item = h("div", { class: "lib-item", draggable: "true", dataset: { type: def.type }, "data-tip": def.label }, [
    h("div", { class: "lib-item-icon", html: buildGlyph(def.iconKind, def.type) }),
    h("div", { class: "lib-item-label" }, def.label),
  ]);

  item.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/wfd-visual-type", def.type);
    e.dataTransfer.effectAllowed = "copy";
    store.ui.draggingLibraryType = def.type;
  });
  item.addEventListener("dragend", () => {
    store.ui.draggingLibraryType = null;
  });

  // Fallback: click-to-add at canvas center (helps touch/trackpad users and quick adds)
  item.addEventListener("dblclick", () => {
    const pageEl = document.getElementById("page-canvas");
    const rect = pageEl.getBoundingClientRect();
    const pt = clientToPageCoords(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const el = store.addElementFromLibrary(def.type, pt.x, pt.y);
    if (el) showToast(`Added ${el.name} to canvas`);
  });

  return item;
}
