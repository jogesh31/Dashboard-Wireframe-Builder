import { store } from "../store.js";
import { h } from "../utils/dom.js";
import { zoomIn, zoomOut, fitToScreen, setZoom } from "./canvas.js";
import { downloadProjectJSON, loadProjectFromFile } from "../export/exportProject.js";
import { exportCurrentPageJPG, copyPageToClipboard } from "../export/exportImage.js";
import { showToast } from "./toast.js";
import { showStartScreen } from "./startScreen.js";
import { openGenerateModal } from "./generateModal.js";
import { openExportPdfModal } from "./exportPdfModal.js";
import { openCopyToSlidesModal } from "./copyToSlidesModal.js";
import { openProjectFile, saveProjectFile, saveProjectFileAs, syncNow, unlinkProjectFile, startNewProject, getFileState } from "../wfd/projectFile.js";
import { ensureIdentity } from "../wfd/identity.js";
import { openMembersModal } from "./membersModal.js";

let menuBarEl;
let openMenu = null;
let includeCommentsInExport = false;

export function initMenuBar() {
  menuBarEl = document.getElementById("menu-bar");
  render();
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".menu-root")) closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  document.getElementById("file-input-project").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) await loadProjectFromFile(file);
  });

  // Re-render menu contents (for disabled/checked state) whenever relevant state changes,
  // but only rebuild while closed to avoid yanking an open dropdown from under the user.
  store.on("selection:change", () => { if (!openMenu) render(); });
  store.on("history:change", () => { if (!openMenu) render(); });
  store.on("settings:change", () => { if (!openMenu) render(); });
  window.addEventListener("wfd:file-change", () => { if (!openMenu) render(); });
}

function closeMenu() {
  if (openMenu) {
    openMenu.dropdown.classList.add("hidden");
    openMenu.trigger.classList.remove("open");
    openMenu = null;
  }
}

function menuRoot(label, items) {
  const root = h("div", { class: "menu-root" });
  const trigger = h("div", { class: "menu-trigger" }, label);
  const dropdown = h("div", { class: "menu-dropdown hidden" });

  items.forEach((it) => dropdown.appendChild(renderMenuItem(it)));

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = openMenu && openMenu.trigger === trigger;
    closeMenu();
    if (!wasOpen) {
      dropdown.classList.remove("hidden");
      trigger.classList.add("open");
      openMenu = { trigger, dropdown };
    }
  });

  root.appendChild(trigger);
  root.appendChild(dropdown);
  return root;
}

function renderMenuItem(it) {
  if (it.sep) return h("div", { class: "menu-sep" });
  const item = h("div", { class: `menu-item ${it.disabled ? "disabled" : ""}` });
  const left = h("span", {}, it.checkbox !== undefined ? `${it.checked ? "☑" : "☐"} ${it.label}` : it.label);
  item.appendChild(left);
  if (it.shortcut) item.appendChild(h("span", { class: "shortcut" }, it.shortcut));
  item.addEventListener("click", () => {
    if (it.disabled) return;
    it.action && it.action();
    if (!it.keepOpen) closeMenu();
  });
  return item;
}

function render() {
  menuBarEl.innerHTML = "";

  const file = getFileState();
  const fileMenu = menuRoot("File", [
    { label: "Home (Recent Projects)…", action: () => showStartScreen({ closable: true }) },
    { label: "New Project", action: () => startNewProject().then(() => showToast("Started a new project — press Ctrl+S to save it as a file")) },
    { label: "Open Project File (.wfd)…", shortcut: "Ctrl+O", action: () => openProjectFile() },
    { sep: true },
    { label: "Save", shortcut: "Ctrl+S", action: () => saveProjectFile() },
    { label: file.linked ? "Save As (a copy)…" : "Save As…", shortcut: "Ctrl+Shift+S", action: () => saveProjectFileAs() },
    { label: "Sync Now", action: () => syncNow(), disabled: !file.linked },
    { label: "Stop Saving to This File", action: () => unlinkProjectFile(), disabled: !file.linked },
    { sep: true },
    { label: "Import Old Project (.wfd.json)…", action: () => document.getElementById("file-input-project").click() },
    { label: "Download a Copy (.wfd)", action: () => downloadProjectJSON() },
    { sep: true },
    { label: "Rename Wireframe…", action: () => {
      const name = prompt("Wireframe title", store.doc.meta.title);
      if (name) store.renameDocument(name);
    } },
    { label: "Project Members…", action: () => openMembersModal() },
    { label: "My Profile (Name and Email)…", action: () => ensureIdentity(true) },
  ]);

  const editMenu = menuRoot("Edit", [
    { label: "Undo", shortcut: "Ctrl+Z", action: () => store.undo(), disabled: !store.historyState().canUndo },
    { label: "Redo", shortcut: "Ctrl+Y", action: () => store.redo(), disabled: !store.historyState().canRedo },
    { sep: true },
    { label: "Duplicate", shortcut: "Ctrl+D", action: () => store.duplicateElements(store.selection), disabled: !store.selection.length },
    { label: "Delete", shortcut: "Del", action: () => store.deleteElements(store.selection), disabled: !store.selection.length },
    { sep: true },
    { label: "Group", shortcut: "Ctrl+G", action: () => store.groupElements(store.selection), disabled: store.selection.length < 2 },
    { label: "Ungroup", shortcut: "Ctrl+Shift+G", action: () => store.ungroupElements(store.selection), disabled: !store.selection.length },
    { sep: true },
    { label: "Select All", shortcut: "Ctrl+A", action: () => store.setSelection(store.getCurrentPage().elements.filter((e) => !e.locked).map((e) => e.id)) },
  ]);

  const settings = store.doc.settings;
  const viewMenu = menuRoot("View", [
    { label: "Zoom In", shortcut: "Ctrl+", action: () => zoomIn() },
    { label: "Zoom Out", shortcut: "Ctrl-", action: () => zoomOut() },
    { label: "Zoom to 100%", action: () => setZoom(1) },
    { label: "Fit to Screen", shortcut: "Ctrl+0", action: () => fitToScreen() },
    { sep: true },
    { label: "Show Grid", checkbox: true, checked: settings.showGrid, action: () => store.toggleGrid(), keepOpen: true },
    { label: "Snap to Grid", checkbox: true, checked: settings.snapToGrid, action: () => store.toggleSnap(), keepOpen: true },
    { label: "Show Rulers", checkbox: true, checked: settings.showRulers, action: () => store.toggleRulers(), keepOpen: true },
  ]);

  const insertMenu = menuRoot("Insert", [
    { label: "Generate Multiple Visuals…", action: () => openGenerateModal() },
    { sep: true },
    { label: "Text Box", action: () => store.setTool("text") },
    { label: "Rectangle", action: () => store.setTool("shape") },
    { label: "Image Placeholder", action: () => store.setTool("image") },
    { sep: true },
    { label: "Upload Data Schema…", action: () => document.getElementById("file-input-schema").click() },
  ]);

  const exportMenu = menuRoot("Export", [
    { label: "Copy Page to Clipboard (paste into Slides)", action: () => copyPageToClipboard(includeCommentsInExport) },
    { label: "Copy Pages to Google Slides…", action: () => openCopyToSlidesModal(includeCommentsInExport) },
    { sep: true },
    { label: "Export Page as JPG", action: () => exportCurrentPageJPG(includeCommentsInExport) },
    { label: "Export as PDF…", action: () => openExportPdfModal(includeCommentsInExport) },
    { sep: true },
    { label: "Include Comments in Export", checkbox: true, checked: includeCommentsInExport, keepOpen: true, action: () => { includeCommentsInExport = !includeCommentsInExport; render(); } },
  ]);

  [fileMenu, editMenu, viewMenu, insertMenu, exportMenu].forEach((m) => menuBarEl.appendChild(m));
}
