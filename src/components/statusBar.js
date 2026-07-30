import { store } from "../store.js";
import { isLinked, getLinkedFileName, reloadFromLinkedFile } from "../export/sharedFile.js";

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
  window.addEventListener("wfd:shared-file-change", render);
}

function render() {
  const page = store.getCurrentPage();
  const pageIdx = store.doc.pages.findIndex((p) => p.id === page.id) + 1;
  const zoom = Math.round((store.doc.settings.zoom || 1) * 100);
  const selCount = store.selection.length;
  const saving = store.ui.autosaveState === "saving";
  const linked = isLinked();

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
    ${linked ? `<button class="statusbar-link-btn" id="statusbar-link-btn" data-tip="Click to reload the latest saved changes">🔗 ${escapeAttr(getLinkedFileName())} — reload</button><span class="vdivider"></span>` : ""}
    <span>${store.doc.canvas.width} × ${store.doc.canvas.height}px</span>
    <span class="vdivider"></span>
    <span>Zoom ${zoom}%</span>
    <span class="vdivider"></span>
    <span class="statusbar-autosave ${saving ? "saving" : ""}"><span class="dot"></span>${saving ? "Saving…" : "Saved"}</span>
    <span class="vdivider"></span>
    <a class="statusbar-credit" id="statusbar-credit" href="https://www.linkedin.com/in/jogeshkumarsharma/" target="_blank" rel="noopener noreferrer" data-tip="Connect on LinkedIn">Powered by Jogesh</a>
  `;

  const linkBtn = document.getElementById("statusbar-link-btn");
  if (linkBtn) linkBtn.addEventListener("click", () => reloadFromLinkedFile());
}

function escapeAttr(s) {
  return String(s).replace(/</g, "&lt;");
}
