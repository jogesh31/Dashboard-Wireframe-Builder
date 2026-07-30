import { store } from "../store.js";
import { UI } from "../uiIcons.js";
import { buildGlyph } from "../visualIcons.js";
import { getVisualDef } from "../visualLibrary.js";
import { h, escapeHtml } from "../utils/dom.js";

let panelEl;
let dragSrcId = null;

export function initLayersPanel() {
  panelEl = document.getElementById("layers-panel");
  store.on("elements:change", render);
  store.on("page:switch", render);
  store.on("selection:change", updateSelectedClasses);
  render();
}

function render() {
  panelEl.innerHTML = "";
  const page = store.getCurrentPage();
  const sorted = [...page.elements].sort((a, b) => b.zIndex - a.zIndex);

  if (!sorted.length) {
    panelEl.appendChild(h("div", { class: "empty-state" }, "No layers yet. Drag a visual from the library onto the canvas to get started."));
    return;
  }

  const list = h("div", { class: "layer-list" });
  sorted.forEach((el) => list.appendChild(renderRow(el)));
  panelEl.appendChild(list);
}

function renderRow(el) {
  const def = getVisualDef(el.type);
  const isSelected = store.selection.includes(el.id);
  const row = h("div", {
    class: `layer-row ${isSelected ? "selected" : ""} ${el.hidden ? "dim" : ""}`,
    draggable: "true",
    dataset: { id: el.id },
  });

  row.innerHTML = `
    <span class="layer-icon">${buildGlyph(def ? def.iconKind : "rect", el.id)}</span>
    <span class="layer-name" data-role="name">${escapeHtml(el.name || el.type)}</span>
    <div class="layer-actions">
      <button class="icon-btn" data-action="lock" data-tip="${el.locked ? "Unlock" : "Lock"}">${el.locked ? UI.lock : UI.unlock}</button>
      <button class="icon-btn" data-action="hide" data-tip="${el.hidden ? "Show" : "Hide"}">${el.hidden ? UI.eyeOff : UI.eye}</button>
      <button class="icon-btn" data-action="delete" data-tip="Delete">${UI.trash}</button>
    </div>`;

  row.addEventListener("click", (e) => {
    if (e.target.closest(".layer-actions") || e.target.closest("[contenteditable]")) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) store.toggleSelection(el.id);
    else store.setSelection([el.id]);
  });

  row.querySelector('[data-action="lock"]').addEventListener("click", (e) => {
    e.stopPropagation();
    store.updateElement(el.id, { locked: !el.locked });
  });
  row.querySelector('[data-action="hide"]').addEventListener("click", (e) => {
    e.stopPropagation();
    store.updateElement(el.id, { hidden: !el.hidden });
  });
  row.querySelector('[data-action="delete"]').addEventListener("click", (e) => {
    e.stopPropagation();
    store.deleteElements([el.id]);
  });

  const nameEl = row.querySelector('[data-role="name"]');
  nameEl.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    nameEl.contentEditable = "true";
    nameEl.focus();
    document.execCommand("selectAll", false, null);
  });
  nameEl.addEventListener("blur", () => {
    nameEl.contentEditable = "false";
    const val = nameEl.textContent.trim();
    if (val && val !== el.name) store.updateElement(el.id, { name: val });
    else nameEl.textContent = el.name;
  });
  nameEl.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); nameEl.blur(); }
    if (e.key === "Escape") { nameEl.textContent = el.name; nameEl.blur(); }
  });

  row.addEventListener("dragstart", (e) => {
    dragSrcId = el.id;
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  row.addEventListener("dragend", () => {
    row.classList.remove("dragging");
    panelEl.querySelectorAll(".layer-row").forEach((r) => r.classList.remove("drag-over-top", "drag-over-bottom"));
  });
  row.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!dragSrcId || dragSrcId === el.id) return;
    const rect = row.getBoundingClientRect();
    const top = e.clientY - rect.top < rect.height / 2;
    row.classList.toggle("drag-over-top", top);
    row.classList.toggle("drag-over-bottom", !top);
  });
  row.addEventListener("dragleave", () => row.classList.remove("drag-over-top", "drag-over-bottom"));
  row.addEventListener("drop", (e) => {
    e.preventDefault();
    const top = row.classList.contains("drag-over-top");
    row.classList.remove("drag-over-top", "drag-over-bottom");
    if (!dragSrcId || dragSrcId === el.id) return;
    reorderByDrag(dragSrcId, el.id, top);
    dragSrcId = null;
  });

  return row;
}

function reorderByDrag(srcId, targetId, placeBefore) {
  const page = store.getCurrentPage();
  const sorted = [...page.elements].sort((a, b) => b.zIndex - a.zIndex); // top-first (visual order)
  const srcIdx = sorted.findIndex((e) => e.id === srcId);
  if (srcIdx === -1) return;
  const [srcEl] = sorted.splice(srcIdx, 1);
  let targetIdx = sorted.findIndex((e) => e.id === targetId);
  if (targetIdx === -1) return;
  if (!placeBefore) targetIdx += 1;
  sorted.splice(targetIdx, 0, srcEl);
  // Re-assign zIndex so topmost row = highest zIndex
  const n = sorted.length;
  const updates = sorted.map((e, i) => ({ id: e.id, patch: { zIndex: n - i } }));
  store.batchUpdateElements(updates);
}

function updateSelectedClasses() {
  const page = store.getCurrentPage();
  panelEl.querySelectorAll(".layer-row").forEach((row) => {
    row.classList.toggle("selected", store.selection.includes(row.dataset.id));
  });
}
