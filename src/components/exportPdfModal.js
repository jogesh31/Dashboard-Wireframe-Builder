import { store } from "../store.js";
import { UI } from "../uiIcons.js";
import { h, escapeHtml } from "../utils/dom.js";
import { exportPagesPDF } from "../export/exportImage.js";

export function openExportPdfModal(includeCommentsDefault = false) {
  const pages = store.doc.pages;
  const overlay = h("div", { class: "modal-overlay" });
  const modal = h("div", { class: "modal export-pdf-modal" });
  overlay.appendChild(modal);
  document.getElementById("modal-host").appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  modal.innerHTML = `
    <div class="modal-header-row">
      <h3>Export as PDF</h3>
      <button class="icon-btn" data-action="close">${UI.close}</button>
    </div>
    <div class="field">
      <label>Pages</label>
      <div class="pdf-page-list" id="pdf-page-list"></div>
      <div class="row" style="margin-top:6px;gap:12px">
        <button class="link-btn" data-action="select-all">Select all</button>
        <button class="link-btn" data-action="select-none">Select none</button>
      </div>
    </div>
    <div class="row" style="margin-top:4px">
      <label class="menu-item" style="padding:6px 0"><input type="checkbox" id="pdf-include-comments" ${includeCommentsDefault ? "checked" : ""} /> &nbsp;Include comment badges</label>
    </div>
    <div class="modal-actions">
      <button class="btn" data-action="cancel">Cancel</button>
      <button class="btn primary" data-action="export">Export PDF</button>
    </div>
  `;
  modal.querySelector('[data-action="close"]').addEventListener("click", close);
  modal.querySelector('[data-action="cancel"]').addEventListener("click", close);

  const listEl = modal.querySelector("#pdf-page-list");
  pages.forEach((p, idx) => {
    const row = h("label", { class: "pdf-page-row" });
    row.innerHTML = `<input type="checkbox" checked data-page-id="${p.id}" /> <span class="pdf-page-idx">${idx + 1}</span> <span class="pdf-page-name">${escapeHtml(p.name)}</span>`;
    listEl.appendChild(row);
  });

  modal.querySelector('[data-action="select-all"]').addEventListener("click", () => {
    listEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = true));
  });
  modal.querySelector('[data-action="select-none"]').addEventListener("click", () => {
    listEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = false));
  });

  modal.querySelector('[data-action="export"]').addEventListener("click", () => {
    const selectedIds = [...listEl.querySelectorAll('input[type="checkbox"]:checked')].map((cb) => cb.dataset.pageId);
    const includeComments = modal.querySelector("#pdf-include-comments").checked;
    close();
    exportPagesPDF(includeComments, selectedIds);
  });
}
