import { store } from "../store.js";
import { UI } from "../uiIcons.js";
import { h } from "../utils/dom.js";
import { zoomIn, zoomOut, fitToScreen, setZoom } from "./canvas.js";
import { showToast } from "./toast.js";
import { exportCurrentPageJPG, copyPageToClipboard } from "../export/exportImage.js";
import { openProjectsModal } from "./projectsModal.js";
import { openGenerateModal } from "./generateModal.js";
import { openExportPdfModal } from "./exportPdfModal.js";
import { openCopyToSlidesModal } from "./copyToSlidesModal.js";

let toolbarEl;
let exportIncludeComments = false;

function iconBtn({ icon, tip, onclick, id, active }) {
  const btn = h("button", { class: `icon-btn ${active ? "active" : ""}`, "data-tip": tip, id, onclick, html: icon });
  return btn;
}

export function initToolbar() {
  toolbarEl = document.getElementById("top-toolbar");
  render();
  store.on("ui:change", updateDynamic);
  store.on("history:change", updateDynamic);
  store.on("selection:change", updateDynamic);
  store.on("settings:change", updateDynamic);
  store.on("doc:meta:change", updateDynamic);
}

function render() {
  toolbarEl.innerHTML = "";

  toolbarEl.appendChild(
    h("div", { class: "brand" }, [
      h("div", { class: "logo-mark" }, "W"),
      h("span", { class: "brand-text" }, "Wireframe Designer"),
    ])
  );

  const titleInput = h("input", {
    class: "doc-title-input",
    type: "text",
    value: store.doc.meta.title,
    onchange: (e) => store.renameDocument(e.target.value),
  });
  toolbarEl.appendChild(titleInput);

  toolbarEl.appendChild(
    h("button", { class: "btn sm", "data-tip": "Start a new wireframe or reopen a saved one", onclick: () => openProjectsModal() }, [
      h("span", { class: "icon", style: "width:13px;height:13px", html: UI.folder }),
      "Projects",
    ])
  );
  toolbarEl.appendChild(h("div", { class: "vdivider" }));

  // Tools group
  const tools = h("div", { class: "toolbar-group", id: "tool-group" });
  [
    { tool: "select", icon: UI.select, tip: "Select (V)" },
    { tool: "hand", icon: UI.hand, tip: "Hand tool — pan (H, or hold Space)" },
    { tool: "text", icon: UI.text, tip: "Text box (T)" },
    { tool: "shape", icon: UI.shape, tip: "Rectangle shape (R)" },
    { tool: "image", icon: UI.image, tip: "Image placeholder (I)" },
    { tool: "comment", icon: UI.comment, tip: "Comment tool — click any visual to add a comment (C)" },
  ].forEach(({ tool, icon, tip }) => {
    tools.appendChild(iconBtn({ icon, tip, id: `tool-${tool}`, onclick: () => store.setTool(tool) }));
  });
  toolbarEl.appendChild(tools);
  toolbarEl.appendChild(h("div", { class: "vdivider" }));

  toolbarEl.appendChild(
    h("button", { class: "btn primary sm generate-btn", "data-tip": "Quickly generate multiple visuals at once", onclick: () => openGenerateModal() }, [
      h("span", { class: "icon", style: "width:14px;height:14px", html: UI.sparkle }),
      "Generate",
    ])
  );
  toolbarEl.appendChild(h("div", { class: "vdivider" }));

  // Edit ops group
  const editOps = h("div", { class: "toolbar-group" });
  editOps.appendChild(iconBtn({ icon: UI.duplicate, tip: "Duplicate (Ctrl+D)", id: "op-duplicate", onclick: () => store.duplicateElements(store.selection) }));
  editOps.appendChild(iconBtn({ icon: UI.delete, tip: "Delete (Del)", id: "op-delete", onclick: () => store.deleteElements(store.selection) }));
  editOps.appendChild(iconBtn({ icon: UI.bringForward, tip: "Bring Forward", id: "op-forward", onclick: () => store.reorderZ(store.selection, "forward") }));
  editOps.appendChild(iconBtn({ icon: UI.sendBackward, tip: "Send Backward", id: "op-backward", onclick: () => store.reorderZ(store.selection, "backward") }));
  editOps.appendChild(iconBtn({ icon: UI.group, tip: "Group (Ctrl+G)", id: "op-group", onclick: () => store.groupElements(store.selection) }));
  editOps.appendChild(iconBtn({ icon: UI.ungroup, tip: "Ungroup (Ctrl+Shift+G)", id: "op-ungroup", onclick: () => store.ungroupElements(store.selection) }));
  toolbarEl.appendChild(editOps);
  toolbarEl.appendChild(h("div", { class: "vdivider" }));

  // Undo/redo
  const history = h("div", { class: "toolbar-group" });
  history.appendChild(iconBtn({ icon: UI.undo, tip: "Undo (Ctrl+Z)", id: "op-undo", onclick: () => store.undo() }));
  history.appendChild(iconBtn({ icon: UI.redo, tip: "Redo (Ctrl+Y)", id: "op-redo", onclick: () => store.redo() }));
  toolbarEl.appendChild(history);
  toolbarEl.appendChild(h("div", { class: "vdivider" }));

  // Zoom
  const zoomControl = h("div", { class: "zoom-control" });
  zoomControl.appendChild(iconBtn({ icon: UI.zoomOut, tip: "Zoom out (Ctrl-)", onclick: () => zoomOut() }));
  const zoomVal = h("span", { class: "zoom-value", id: "zoom-pct-display", onclick: () => setZoom(1) }, "100%");
  zoomControl.appendChild(zoomVal);
  zoomControl.appendChild(iconBtn({ icon: UI.zoomIn, tip: "Zoom in (Ctrl+)", onclick: () => zoomIn() }));
  zoomControl.appendChild(iconBtn({ icon: UI.fitScreen, tip: "Fit to screen (Ctrl+0)", onclick: () => fitToScreen() }));
  toolbarEl.appendChild(zoomControl);
  toolbarEl.appendChild(h("div", { class: "vdivider" }));

  toolbarEl.appendChild(h("div", { class: "toolbar-spacer" }));

  toolbarEl.appendChild(renderCopyToSlidesButton());
  toolbarEl.appendChild(renderExportButton());
  toolbarEl.appendChild(h("div", { class: "vdivider" }));
  toolbarEl.appendChild(renderThemeToggle());

  updateDynamic();
}

function renderThemeToggle() {
  const btn = h("button", { class: "icon-btn", id: "theme-toggle", "data-tip": "Toggle dark / light mode" });
  const apply = () => {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    btn.innerHTML = isLight ? UI.sun : UI.moon;
  };
  btn.addEventListener("click", () => {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    const next = isLight ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("wfd-theme", next); } catch (e) {}
    apply();
  });
  apply();
  return btn;
}

function renderCopyToSlidesButton() {
  const root = h("div", { class: "menu-root split-btn" });
  const mainBtn = h("button", { class: "btn sm split-btn-main", "data-tip": "Copy this page as an image — then paste (Ctrl+V) into Google Slides" }, [
    h("span", { class: "icon", style: "width:14px;height:14px", html: UI.clipboard }),
    "Copy to Slides",
  ]);
  const caretBtn = h("button", { class: "icon-btn split-btn-caret", "data-tip": "More copy options", html: UI.chevDown });
  const dropdown = h("div", { class: "menu-dropdown hidden", style: "right:0;left:auto" });

  mainBtn.addEventListener("click", () => copyPageToClipboard(exportIncludeComments));

  const allPagesItem = h("div", { class: "menu-item" }, [h("span", {}, "Copy Pages to Google Slides…")]);
  allPagesItem.addEventListener("click", () => { close(); openCopyToSlidesModal(exportIncludeComments); });

  const sep = h("div", { class: "menu-sep" });

  const commentsItem = h("div", { class: "menu-item" }, [
    h("span", {}, `${exportIncludeComments ? "☑" : "☐"} Include comment sticky notes`),
  ]);
  commentsItem.addEventListener("click", () => {
    exportIncludeComments = !exportIncludeComments;
    commentsItem.firstChild.textContent = `${exportIncludeComments ? "☑" : "☐"} Include comment sticky notes`;
  });

  [allPagesItem, sep, commentsItem].forEach((n) => dropdown.appendChild(n));

  function close() {
    dropdown.classList.add("hidden");
    caretBtn.classList.remove("open");
    document.removeEventListener("click", onOutsideClick);
  }
  function onOutsideClick(e) {
    if (!root.contains(e.target)) close();
  }
  caretBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = dropdown.classList.contains("hidden");
    if (isHidden) {
      dropdown.classList.remove("hidden");
      caretBtn.classList.add("open");
      setTimeout(() => document.addEventListener("click", onOutsideClick), 0);
    } else {
      close();
    }
  });

  root.appendChild(mainBtn);
  root.appendChild(caretBtn);
  root.appendChild(dropdown);
  return root;
}

function renderExportButton() {
  const root = h("div", { class: "menu-root" });
  const trigger = h("button", { class: "btn primary sm", "data-tip": "Export your wireframe as JPG or PDF" }, [
    h("span", { class: "icon", style: "width:14px;height:14px", html: UI.export }),
    "Export",
  ]);
  const dropdown = h("div", { class: "menu-dropdown hidden", style: "right:0;left:auto" });

  const jpgItem = h("div", { class: "menu-item" }, [h("span", {}, "Export Page as JPG")]);
  jpgItem.addEventListener("click", () => {
    close();
    exportCurrentPageJPG(exportIncludeComments);
  });

  const pdfItem = h("div", { class: "menu-item" }, [h("span", {}, "Export as PDF…")]);
  pdfItem.addEventListener("click", () => {
    close();
    openExportPdfModal(exportIncludeComments);
  });

  const sep = h("div", { class: "menu-sep" });

  const commentsItem = h("div", { class: "menu-item" }, [
    h("span", {}, `${exportIncludeComments ? "☑" : "☐"} Include comment badges`),
  ]);
  commentsItem.addEventListener("click", () => {
    exportIncludeComments = !exportIncludeComments;
    commentsItem.firstChild.textContent = `${exportIncludeComments ? "☑" : "☐"} Include comment badges`;
  });

  [jpgItem, pdfItem, sep, commentsItem].forEach((n) => dropdown.appendChild(n));

  function close() {
    dropdown.classList.add("hidden");
    trigger.classList.remove("open");
    document.removeEventListener("click", onOutsideClick);
  }
  function onOutsideClick(e) {
    if (!root.contains(e.target)) close();
  }
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = dropdown.classList.contains("hidden");
    if (isHidden) {
      dropdown.classList.remove("hidden");
      trigger.classList.add("open");
      setTimeout(() => document.addEventListener("click", onOutsideClick), 0);
    } else {
      close();
    }
  });

  root.appendChild(trigger);
  root.appendChild(dropdown);
  return root;
}

function updateDynamic() {
  const tool = store.ui.tool;
  ["select", "hand", "text", "shape", "image", "comment"].forEach((t) => {
    const btn = document.getElementById(`tool-${t}`);
    if (btn) btn.classList.toggle("active", tool === t);
  });

  const hasSelection = store.selection.length > 0;
  const hasMulti = store.selection.length >= 2;
  const setDisabled = (id, disabled) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = disabled;
  };
  setDisabled("op-duplicate", !hasSelection);
  setDisabled("op-delete", !hasSelection);
  setDisabled("op-forward", !hasSelection);
  setDisabled("op-backward", !hasSelection);
  setDisabled("op-group", !hasMulti);
  setDisabled("op-ungroup", !hasSelection);

  const hist = store.historyState();
  setDisabled("op-undo", !hist.canUndo);
  setDisabled("op-redo", !hist.canRedo);

  const zoomVal = document.getElementById("zoom-pct-display");
  if (zoomVal) zoomVal.textContent = `${Math.round((store.doc.settings.zoom || 1) * 100)}%`;

  const titleInput = toolbarEl.querySelector(".doc-title-input");
  if (titleInput && document.activeElement !== titleInput) titleInput.value = store.doc.meta.title;
}
