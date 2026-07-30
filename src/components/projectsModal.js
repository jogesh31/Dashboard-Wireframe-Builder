import { store } from "../store.js";
import { UI } from "../uiIcons.js";
import { h, escapeHtml, formatTime } from "../utils/dom.js";
import { showToast } from "./toast.js";
import { restoreLinkForCurrentProject } from "../export/sharedFile.js";

function miniPreview(project) {
  const canvas = project.canvas || { width: 1280, height: 720 };
  const page = project.thumbnailPage;
  if (!page || !page.elements.length) {
    return `<div class="project-thumb-empty">Blank</div>`;
  }
  const bg = page.background && page.background !== "transparent" ? page.background : "#ffffff";
  const els = page.elements
    .filter((e) => !e.hidden)
    .slice(0, 40)
    .map((e) => {
      const left = (e.x / canvas.width) * 100;
      const top = (e.y / canvas.height) * 100;
      const w = (e.w / canvas.width) * 100;
      const hh = (e.h / canvas.height) * 100;
      const bgColor = !e.style?.background || e.style.background === "transparent" ? "#dfe1e8" : e.style.background;
      return `<div class="mini-el" style="left:${left}%;top:${top}%;width:${w}%;height:${hh}%;background:${bgColor};border-radius:${Math.min(e.style?.borderRadius || 0, 4)}px"></div>`;
    })
    .join("");
  return `<div class="project-thumb-canvas" style="background:${bg}">${els}</div>`;
}

export function openProjectsModal() {
  renderModal();
}

async function renderModal() {
  const overlay = h("div", { class: "modal-overlay" });
  const modal = h("div", { class: "modal projects-modal" });
  modal.innerHTML = `
    <div class="modal-header-row">
      <h3>My Wireframes</h3>
      <button class="icon-btn" data-action="close">${UI.close}</button>
    </div>
    <div class="projects-grid" id="projects-grid">
      <div class="empty-state">Loading…</div>
    </div>
    <div class="modal-actions" style="justify-content:space-between;align-items:center">
      <button class="btn sm" data-action="import">${UI.upload} Import from file…</button>
      <span style="color:var(--text-tertiary);font-size:11px">Projects are saved automatically in this browser</span>
    </div>
  `;
  overlay.appendChild(modal);
  document.getElementById("modal-host").appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  modal.querySelector('[data-action="close"]').addEventListener("click", close);
  modal.querySelector('[data-action="import"]').addEventListener("click", () => {
    close();
    document.getElementById("file-input-project").click();
  });

  const grid = modal.querySelector("#projects-grid");
  const projects = await store.listProjects();
  grid.innerHTML = "";

  const newTile = h("div", { class: "project-tile new-tile" }, [
    h("div", { class: "project-thumb new-thumb", html: UI.plus }),
    h("div", { class: "project-title" }, "New Wireframe"),
  ]);
  newTile.addEventListener("click", () => {
    close();
    store.newDocument();
    restoreLinkForCurrentProject();
    showToast("Started a new wireframe");
  });
  grid.appendChild(newTile);

  if (!projects.length) {
    grid.appendChild(h("div", { class: "empty-state", style: "grid-column:1/-1" }, "No saved wireframes yet — start one, and it'll show up here automatically."));
  }

  projects.forEach((p) => {
    const isCurrent = p.id === store.doc.meta.id;
    const tile = h("div", { class: `project-tile ${isCurrent ? "current" : ""}` });
    tile.innerHTML = `
      <div class="project-thumb">${miniPreview(p)}</div>
      <div class="project-title">${escapeHtml(p.title || "Untitled Wireframe")}${isCurrent ? ' <span class="badge">current</span>' : ""}</div>
      <div class="project-meta">${p.pageCount} page${p.pageCount === 1 ? "" : "s"} · edited ${formatTime(p.updatedAt)}</div>
      <button class="icon-btn project-delete" data-tip="Delete">${UI.trash}</button>
    `;
    tile.addEventListener("click", async (e) => {
      if (e.target.closest(".project-delete")) return;
      close();
      await store.openProject(p.id);
      restoreLinkForCurrentProject();
      showToast(`Opened "${p.title || "Untitled Wireframe"}"`);
    });
    tile.querySelector(".project-delete").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${p.title || "Untitled Wireframe"}"? This can't be undone.`)) {
        await store.deleteProjectById(p.id);
        overlay.remove();
        renderModal();
      }
    });
    grid.appendChild(tile);
  });
}
