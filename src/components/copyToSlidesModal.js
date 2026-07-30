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
    <p class="generate-subtitle"><strong>Paste into Slides:</strong> Click <strong>Copy Page</strong> to copy the entire page as an image, then press <strong>Ctrl+V</strong> in your Slides tab. <strong>Or:</strong> click on individual visuals below to copy them separately (easier to edit after pasting).</p>
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
      <button class="btn sm" data-page-id="${p.id}" type="button">Copy Page</button>
      <button class="btn sm secondary" data-page-id="${p.id}" data-action="toggle-visuals" type="button" style="margin-left: 4px;">Visuals ▼</button>
    `;
    const copyBtn = row.querySelector('button:not([data-action])');
    const toggleBtn = row.querySelector('[data-action="toggle-visuals"]');

    copyBtn.addEventListener("click", async () => {
      copyBtn.disabled = true;
      const originalLabel = copyBtn.textContent;
      const ok = await copyPageToClipboard(includeCommentsBox.checked, p.id);
      copyBtn.textContent = ok ? "Copied ✓" : "Retry";
      copyBtn.disabled = false;
      setTimeout(() => { if (copyBtn.textContent !== originalLabel) copyBtn.textContent = originalLabel; }, 2500);
    });

    // Show individual visuals from this page
    const visualsContainer = h("div", { class: "copy-slides-visuals hidden", style: "margin-top: 8px; margin-left: 28px; padding-left: 12px; border-left: 2px solid var(--border-color);" });
    if (p.elements.filter(e => !e.hidden).length > 0) {
      p.elements.filter(e => !e.hidden).forEach((el) => {
        const visualRow = h("div", { class: "copy-slides-visual-row", style: "display: flex; gap: 8px; align-items: center; padding: 4px 0; font-size: 12px;" });
        visualRow.innerHTML = `
          <span style="flex: 1; color: var(--text-secondary);">${escapeHtml(el.name || el.type)}</span>
          <button class="btn xs" data-element-id="${el.id}" style="padding: 2px 8px; font-size: 11px;">Copy</button>
        `;
        const visualBtn = visualRow.querySelector("button");
        visualBtn.addEventListener("click", async () => {
          visualBtn.disabled = true;
          const originalText = visualBtn.textContent;
          try {
            const elNode = document.getElementById(`el-${el.id}`);
            if (elNode && window.html2canvas) {
              const canvas = await window.html2canvas(elNode, { scale: 2, backgroundColor: "transparent" });
              canvas.toBlob((blob) => {
                const item = new ClipboardItem({ "image/png": blob });
                navigator.clipboard.write([item]).then(() => {
                  visualBtn.textContent = "Copied ✓";
                  setTimeout(() => { visualBtn.textContent = originalText; }, 2000);
                }).catch(() => {
                  visualBtn.textContent = "Error";
                  setTimeout(() => { visualBtn.textContent = originalText; }, 2000);
                });
              });
            }
          } catch (e) {
            console.error("Failed to copy visual:", e);
          } finally {
            visualBtn.disabled = false;
          }
        });
        visualsContainer.appendChild(visualRow);
      });
    } else {
      visualsContainer.innerHTML = '<span style="color: var(--text-secondary); font-size: 12px; padding: 4px 0;">No visuals on this page</span>';
    }

    toggleBtn.addEventListener("click", () => {
      visualsContainer.classList.toggle("hidden");
      toggleBtn.textContent = visualsContainer.classList.contains("hidden") ? "Visuals ▼" : "Visuals ▲";
    });

    row.appendChild(visualsContainer);
    listEl.appendChild(row);
  });
}
