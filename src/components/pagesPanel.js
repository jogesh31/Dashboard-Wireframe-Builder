import { store } from "../store.js";
import { h, escapeHtml } from "../utils/dom.js";
import { showToast } from "./toast.js";
import { renderElementBody } from "../visualRenderers.js";

const ICONS = {
  add: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`,
  duplicate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V4h12"/></svg>`,
  rename: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  delete: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>`,
};

let panelEl;
let dragSrcId = null;
let thumbObservers = [];

export function initPagesPanel() {
  panelEl = document.getElementById("pages-panel");
  store.on("pages:change", render);
  store.on("page:switch", render);
  store.on("elements:change", renderActiveThumbOnly);
  render();
}

// Elements change on almost every edit (drag, typing, etc.) — repainting every
// thumbnail each time would be wasteful, so only the thumbnail for the page
// currently being edited is refreshed live; the rest catch up on page:switch.
function renderActiveThumbOnly() {
  const page = store.getCurrentPage();
  const thumb = panelEl.querySelector(`.page-thumb[data-id="${page.id}"]`);
  if (!thumb) return;
  const box = thumb.querySelector(".page-thumb-canvas");
  const old = thumbObservers.find((o) => o.box === box);
  if (old) { old.observer.disconnect(); thumbObservers = thumbObservers.filter((o) => o !== old); }
  box.innerHTML = "";
  const { stage, observer } = buildThumbStage(page, box);
  box.appendChild(stage);
  thumbObservers.push({ box, stage, observer });
  applyThumbScale(box, stage); // box is already live, so this can size correctly right away
}

function render() {
  thumbObservers.forEach((o) => o.observer.disconnect());
  thumbObservers = [];
  panelEl.innerHTML = "";

  const header = h("div", { id: "pages-panel-header" }, [
    h("span", { class: "title" }, `Pages (${store.doc.pages.length})`),
  ]);
  panelEl.appendChild(header);

  const list = h("div", { class: "page-list" });
  store.doc.pages.forEach((page, idx) => {
    list.appendChild(renderThumb(page, idx));
  });
  panelEl.appendChild(list);
  // Thumb boxes have zero layout width until the list is attached to the
  // document, so the initial scale can only be measured now, post-attach.
  thumbObservers.forEach((o) => applyThumbScale(o.box, o.stage));

  panelEl.appendChild(
    h("button", {
      class: "btn add-page-btn",
      onclick: () => {
        store.addPage(store.doc.currentPageId);
        showToast("Page added");
      },
    }, [h("span", { class: "icon", html: ICONS.add }), "Add Page"])
  );
}

// Renders an actual scaled-down copy of the page (colors, text, chart shapes,
// tables) into `box`, like a Google Slides filmstrip thumbnail — not just
// abstract placeholder rectangles. A ResizeObserver keeps the scale correct
// as the sidebar is resized, since the box's pixel width isn't known upfront;
// the caller also applies an initial scale once the box is attached and laid out.
function buildThumbStage(page, box) {
  const { width, height } = store.doc.canvas;
  const stage = h("div", { class: "page-thumb-stage" });
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.style.background = page.background || "#ffffff";

  [...page.elements]
    .filter((e) => !e.hidden)
    .sort((a, b) => a.zIndex - b.zIndex)
    .forEach((el) => stage.appendChild(buildThumbElement(el)));

  const observer = new ResizeObserver(() => applyThumbScale(box, stage));
  observer.observe(box);

  return { stage, observer };
}

function applyThumbScale(box, stage) {
  const canvasWidth = store.doc.canvas.width;
  const scale = box.clientWidth / canvasWidth;
  if (scale > 0) stage.style.transform = `scale(${scale})`;
}

function buildThumbElement(el) {
  const node = h("div", { class: "el thumb-el" });
  node.style.left = `${el.x}px`;
  node.style.top = `${el.y}px`;
  node.style.width = `${el.w}px`;
  node.style.height = `${el.h}px`;
  node.style.zIndex = el.zIndex;
  node.style.transform = el.rotation ? `rotate(${el.rotation}deg)` : "";
  node.style.opacity = (el.style.opacity ?? 100) / 100;
  node.style.background = el.style.background || "transparent";
  node.style.border = el.style.borderWidth > 0 ? `${el.style.borderWidth}px ${el.style.borderStyle || "solid"} ${el.style.borderColor}` : "none";
  node.style.borderRadius = `${Math.min(el.style.borderRadius ?? 0, Math.min(el.w, el.h) / 2)}px`;
  node.style.boxShadow = el.style.shadow === "sm" ? "0 1px 3px rgba(0,0,0,0.15)" : el.style.shadow === "md" ? "0 4px 10px rgba(0,0,0,0.18)" : el.style.shadow === "lg" ? "0 10px 24px rgba(0,0,0,0.22)" : "none";

  const inner = h("div", { class: "el-inner" });
  inner.style.setProperty("--el-color", el.style.color || "#20222b");
  inner.style.setProperty("--el-font", el.style.fontFamily || "Segoe UI");
  inner.style.setProperty("--el-title-size", `${el.style.fontSize || 13}px`);
  inner.style.setProperty("--el-weight", el.style.fontWeight || "400");
  inner.style.setProperty("--el-align", el.style.textAlign || "left");
  inner.style.setProperty("--el-accent", "#6366f1");
  inner.innerHTML = renderElementBody(el);
  node.appendChild(inner);
  return node;
}

function renderThumb(page, idx) {
  const isActive = page.id === store.doc.currentPageId;
  const thumb = h("div", {
    class: `page-thumb ${isActive ? "active" : ""}`,
    draggable: "true",
    dataset: { id: page.id },
    onclick: () => store.setCurrentPage(page.id),
  });

  thumb.innerHTML = `
    <div class="page-thumb-canvas" data-role="canvas-box"></div>
    <div class="page-thumb-footer">
      <span class="page-thumb-index">${idx + 1}</span>
      <span class="page-thumb-name" data-role="name">${escapeHtml(page.name)}</span>
      <div class="page-thumb-actions">
        <button class="icon-btn" data-action="duplicate" data-tip="Duplicate page">${ICONS.duplicate}</button>
        <button class="icon-btn" data-action="rename" data-tip="Rename page">${ICONS.rename}</button>
        <button class="icon-btn" data-action="delete" data-tip="Delete page" ${store.doc.pages.length <= 1 ? "disabled" : ""}>${ICONS.delete}</button>
      </div>
    </div>`;

  const canvasBox = thumb.querySelector('[data-role="canvas-box"]');
  const { stage, observer } = buildThumbStage(page, canvasBox);
  canvasBox.appendChild(stage);
  thumbObservers.push({ box: canvasBox, stage, observer });

  thumb.querySelector('[data-action="duplicate"]').addEventListener("click", (e) => {
    e.stopPropagation();
    store.duplicatePage(page.id);
    showToast("Page duplicated");
  });
  thumb.querySelector('[data-action="delete"]').addEventListener("click", (e) => {
    e.stopPropagation();
    if (store.doc.pages.length <= 1) return;
    if (confirm(`Delete "${page.name}"? This cannot be undone from here (but Undo works).`)) {
      store.deletePage(page.id);
      showToast("Page deleted");
    }
  });
  const nameEl = thumb.querySelector('[data-role="name"]');
  const startRename = (e) => {
    e.stopPropagation();
    nameEl.contentEditable = "true";
    nameEl.focus();
    document.execCommand("selectAll", false, null);
  };
  thumb.querySelector('[data-action="rename"]').addEventListener("click", startRename);
  nameEl.addEventListener("dblclick", startRename);
  nameEl.addEventListener("blur", () => {
    nameEl.contentEditable = "false";
    const val = nameEl.textContent.trim();
    if (val && val !== page.name) store.renamePage(page.id, val);
    else nameEl.textContent = page.name;
  });
  nameEl.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); nameEl.blur(); }
    if (e.key === "Escape") { nameEl.textContent = page.name; nameEl.blur(); }
  });

  thumb.addEventListener("dragstart", (e) => {
    dragSrcId = page.id;
    thumb.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", page.id);
  });
  thumb.addEventListener("dragend", () => {
    thumb.classList.remove("dragging");
    panelEl.querySelectorAll(".page-thumb").forEach((t) => t.classList.remove("drop-before", "drop-after"));
  });
  thumb.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!dragSrcId || dragSrcId === page.id) return;
    const rect = thumb.getBoundingClientRect();
    const before = e.clientY - rect.top < rect.height / 2;
    thumb.classList.toggle("drop-before", before);
    thumb.classList.toggle("drop-after", !before);
  });
  thumb.addEventListener("dragleave", () => {
    thumb.classList.remove("drop-before", "drop-after");
  });
  thumb.addEventListener("drop", (e) => {
    e.preventDefault();
    const before = thumb.classList.contains("drop-before");
    thumb.classList.remove("drop-before", "drop-after");
    if (!dragSrcId || dragSrcId === page.id) return;
    const ids = store.doc.pages.map((p) => p.id);
    const fromIdx = ids.indexOf(dragSrcId);
    ids.splice(fromIdx, 1);
    let toIdx = ids.indexOf(page.id);
    if (!before) toIdx += 1;
    ids.splice(toIdx, 0, dragSrcId);
    store.reorderPages(ids);
    dragSrcId = null;
  });

  return thumb;
}
