import { store } from "../store.js";
import { getFileState, reconnectProjectFile, syncNow, saveProjectFileAs } from "../wfd/projectFile.js";

const FILE_STATUS = {
  synced: { label: "Saved to file", tip: "Every change saves to this file. Click to check for other people's changes now." },
  syncing: { label: "Syncing…", tip: "Saving to the project file" },
  "needs-permission": { label: "Click to reconnect", tip: "The browser needs your permission again to save to this file" },
  error: { label: "Can't reach file", tip: "" },
};

let statusEl;

export function initStatusBar() {
  statusEl = document.getElementById("status-bar");
  render();
  store.on("selection:change", render);
  store.on("page:switch", render);
  store.on("pages:change", render);
  store.on("settings:change", render);
  store.on("elements:change", render);
  store.on("ui:change", render);
  document.addEventListener("wfd:statusbar-update", render);
  window.addEventListener("wfd:file-change", render);
}

function render() {
  const page = store.getCurrentPage();
  const pageIdx = store.doc.pages.findIndex((p) => p.id === page.id) + 1;
  const zoom = Math.round((store.doc.settings.zoom || 1) * 100);
  const selCount = store.selection.length;
  const saving = store.ui.autosaveState === "saving";
  const file = getFileState();

  let selectionText = "No selection";
  if (selCount === 1) {
    const el = store.getElement(store.selection[0], page);
    if (el) selectionText = `${el.name || el.type} — ${Math.round(el.w)}×${Math.round(el.h)} at (${Math.round(el.x)}, ${Math.round(el.y)})`;
  } else if (selCount > 1) {
    selectionText = `${selCount} objects selected`;
  }

  statusEl.innerHTML = `
    <span>Page ${pageIdx} of ${store.doc.pages.length} — ${escapeAttr(page.name)}</span>
    <span class="vdivider"></span>
    <span>${page.elements.length} object${page.elements.length === 1 ? "" : "s"}</span>
    <span class="vdivider"></span>
    <span>${escapeAttr(selectionText)}</span>
    <span class="toolbar-spacer" style="flex:1"></span>
    ${fileChip(file)}<span class="vdivider"></span>
    <span>${store.doc.canvas.width} × ${store.doc.canvas.height}px</span>
    <span class="vdivider"></span>
    <span>Zoom ${zoom}%</span>
    <span class="vdivider"></span>
    <span class="statusbar-autosave ${saving ? "saving" : ""}"><span class="dot"></span>${saving ? "Saving…" : "Saved"}</span>
    <span class="vdivider"></span>
    <a class="statusbar-credit" id="statusbar-credit" href="https://www.linkedin.com/in/jogeshkumarsharma/" target="_blank" rel="noopener noreferrer" data-tip="Connect on LinkedIn">Powered by Jogesh</a>
  `;

  const fileBtn = document.getElementById("statusbar-file-btn");
  if (fileBtn) {
    fileBtn.addEventListener("click", () => {
      if (!file.linked) saveProjectFileAs();
      else if (file.status === "needs-permission") reconnectProjectFile();
      else syncNow();
    });
  }
}

function fileChip(file) {
  if (!file.linked) {
    return `<button class="statusbar-link-btn muted" id="statusbar-file-btn" data-tip="Only saved on this computer. Click to save as a .wfd file you can share (e.g. in OneDrive).">Not saved to a file</button>`;
  }
  const s = FILE_STATUS[file.status] || FILE_STATUS.synced;
  const tip = file.status === "error" ? file.error : s.tip;
  return `<button class="statusbar-link-btn ${escapeAttr(file.status)}" id="statusbar-file-btn" data-tip="${escapeAttr(tip)}">${escapeAttr(file.name)} · ${s.label}</button>`;
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}
