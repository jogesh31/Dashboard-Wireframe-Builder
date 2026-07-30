import { store } from "../store.js";
import { UI } from "../uiIcons.js";
import { h, escapeHtml } from "../utils/dom.js";
import { copyPageToClipboard } from "../export/exportImage.js";

export function openCopyToSlidesModal(includeCommentsDefault = false) {
  const pages = store.doc.pages;
  const overlay = h("div", { class: "modal-overlay" });
  const modal = h("div", { class: "modal export-pdf-modal" });
  overlay.appendChild(modal);
  document.getElementById("modal-host").appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  modal.innerHTML = `
    <div class="modal-header-row">
      <h3>Copy to Google Slides</h3>
      <button class="icon-btn" data-action="close">${UI.close}</button>
    </div>
    <p class="generate-subtitle">Click <strong>Copy</strong> on a page, switch to your Slides tab, and press <strong>Ctrl+V</strong> to paste it onto a slide as an image. Repeat for each page — nothing is saved or downloaded.</p>
    <div class="field">
      <div class="copy-slides-list" id="copy-slides-list"></div>
    </div>
    <div class="row" style="margin-top:4px">
      <label class="menu-item" style="padding:6px 0"><input type="checkbox" id="copy-include-comments" ${includeCommentsDefault ? "checked" : ""} /> &nbsp;Include comment sticky notes</label>
    </div>
    <div class="modal-actions">
      <button class="btn" data-action="close2">Done</button>
    </div>
  `;
  modal.querySelector('[data-action="close"]').addEventListener("click", close);
  modal.querySelector('[data-action="close2"]').addEventListener("click", close);

  const listEl = modal.querySelector("#copy-slides-list");
  const includeCommentsBox = modal.querySelector("#copy-include-comments");

  pages.forEach((p, idx) => {
    const row = h("div", { class: "pdf-page-row copy-slides-row" });
    row.innerHTML = `
      <span class="pdf-page-idx">${idx + 1}</span>
      <span class="pdf-page-name">${escapeHtml(p.name)}</span>
      <button class="btn sm" data-page-id="${p.id}" type="button">Copy</button>
    `;
    const btn = row.querySelector("button");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const originalLabel = btn.textContent;
      const ok = await copyPageToClipboard(includeCommentsBox.checked, p.id);
      btn.textContent = ok ? "Copied ✓" : "Retry";
      btn.disabled = false;
      setTimeout(() => { if (btn.textContent !== originalLabel) btn.textContent = originalLabel; }, 2500);
    });
    listEl.appendChild(row);
  });
}
