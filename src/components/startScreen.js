// The first screen when the app opens without a file (and File ▸ Home):
// start a new project, open a .wfd file, or pick a recent one — like any
// other desktop tool, instead of silently reopening the last project.

import { store } from "../store.js";
import { UI } from "../uiIcons.js";
import { h, escapeHtml, formatTime } from "../utils/dom.js";
import { getRecentFiles, removeRecentFile, seedRecentFiles } from "../wfd/recentFiles.js";
import { recallRef, backend } from "../wfd/backend.js";
import { openProjectFile, openRecentFile, startNewProject, openDraft } from "../wfd/projectFile.js";

let screenEl = null;

function miniPreview(canvas, page) {
  canvas = canvas || { width: 1280, height: 720 };
  if (!page || !page.elements?.length) return `<div class="project-thumb-empty">Blank</div>`;
  const bg = page.background && page.background !== "transparent" ? page.background : "#ffffff";
  const els = page.elements
    .filter((e) => !e.hidden)
    .slice(0, 40)
    .map((e) => {
      const fill = !e.style?.background || e.style.background === "transparent" ? "#dfe1e8" : e.style.background;
      return `<div class="mini-el" style="left:${(e.x / canvas.width) * 100}%;top:${(e.y / canvas.height) * 100}%;width:${(e.w / canvas.width) * 100}%;height:${(e.h / canvas.height) * 100}%;background:${escapeHtml(fill)};border-radius:${Math.min(e.style?.borderRadius || 0, 4)}px"></div>`;
    })
    .join("");
  return `<div class="project-thumb-canvas" style="background:${escapeHtml(bg)}">${els}</div>`;
}

function folderOf(ref) {
  if (typeof ref !== "string") return "";
  const parts = ref.split(/[\\/]/);
  parts.pop();
  const folder = parts.join("\\");
  return folder.replace(/^C:\\Users\\[^\\]+\\/i, "");
}

/**
 * Shows the start screen. `closable` is false at launch, so the previous
 * session's project never shows until the user picks something.
 */
export async function showStartScreen({ closable = false } = {}) {
  hideStartScreen();
  screenEl = h("div", { class: "start-screen", role: "dialog", "aria-label": "Open a project" });
  document.body.appendChild(screenEl);

  const close = closable ? h("button", { class: "icon-btn start-close", "data-tip": "Back to the current project", html: UI.close, onclick: hideStartScreen }) : null;

  const newBtn = h("button", { class: "start-action primary", onclick: () => run(startNewProject) }, [
    h("span", { class: "icon", html: UI.plus }),
    h("span", {}, [h("strong", {}, "New project"), h("small", {}, "Start a blank wireframe")]),
  ]);
  const openBtn = h("button", { class: "start-action", onclick: () => run(openProjectFile) }, [
    h("span", { class: "icon", html: UI.folder }),
    h("span", {}, [h("strong", {}, "Open project…"), h("small", {}, "Open a .wfd file, e.g. from OneDrive")]),
  ]);

  const recentWrap = h("div", { class: "start-section" }, [h("div", { class: "start-section-title" }, "Recent projects")]);
  const recentGrid = h("div", { class: "projects-grid start-grid" }, h("div", { class: "empty-state" }, "Loading…"));
  recentWrap.appendChild(recentGrid);
  const draftsWrap = h("div", { class: "start-section hidden" });

  screenEl.appendChild(
    h("div", { class: "start-inner" }, [
      h("div", { class: "start-side" }, [
        h("div", { class: "start-brand" }, [h("span", { class: "start-logo" }, "W"), "Wireframe Designer"]),
        newBtn,
        openBtn,
        h("p", { class: "start-hint" }, "Projects are single .wfd files. Save them in a shared OneDrive folder and everyone sees each other's changes."),
      ]),
      h("div", { class: "start-main" }, [close, recentWrap, draftsWrap]),
    ])
  );

  const onKey = (e) => { if (closable && e.key === "Escape") hideStartScreen(); };
  document.addEventListener("keydown", onKey);
  screenEl._cleanup = () => document.removeEventListener("keydown", onKey);

  await renderRecent(recentGrid);
  await renderDrafts(draftsWrap);
}

export function hideStartScreen() {
  if (!screenEl) return;
  screenEl._cleanup?.();
  screenEl.remove();
  screenEl = null;
}

async function run(action) {
  const result = await action();
  if (result !== false) hideStartScreen();
}

async function seedFromLinkedProjects() {
  const entries = [];
  for (const p of await store.listProjects()) {
    const ref = await recallRef(p.id).catch(() => null);
    if (!ref) continue;
    entries.push({ ref, name: backend.nameOf(ref), projectId: p.id, title: p.title, pageCount: p.pageCount, canvas: p.canvas, thumbnailPage: p.thumbnailPage, openedAt: p.updatedAt });
  }
  return entries.length ? seedRecentFiles(entries) : [];
}

async function renderRecent(grid) {
  let recent = await getRecentFiles();
  if (!recent.length) recent = await seedFromLinkedProjects();
  grid.innerHTML = "";
  if (!recent.length) {
    grid.appendChild(h("div", { class: "empty-state", style: "grid-column:1/-1" }, "Projects you open or save will appear here."));
    return;
  }
  recent.forEach((entry) => {
    const tile = h("div", { class: "project-tile", tabindex: "0" });
    const where = folderOf(entry.ref);
    tile.innerHTML = `
      <div class="project-thumb">${miniPreview(entry.canvas, entry.thumbnailPage)}</div>
      <div class="project-title">${escapeHtml(entry.title || entry.name)}</div>
      <div class="project-meta" title="${escapeHtml(typeof entry.ref === "string" ? entry.ref : entry.name)}">${escapeHtml(entry.name)}${where ? ` · ${escapeHtml(where)}` : ""}</div>
      <div class="project-meta">${entry.pageCount || 1} page${entry.pageCount === 1 ? "" : "s"} · opened ${formatTime(entry.openedAt)}</div>
      <button class="icon-btn project-delete" data-tip="Remove from list (the file isn't deleted)">${UI.close}</button>`;
    const open = async () => {
      tile.classList.add("loading");
      const ok = await openRecentFile(entry);
      tile.classList.remove("loading");
      if (ok) hideStartScreen();
      else if (!(await backend.stat(entry.ref).catch(() => null))) tile.remove();
    };
    tile.addEventListener("click", (e) => { if (!e.target.closest(".project-delete")) open(); });
    tile.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
    tile.querySelector(".project-delete").addEventListener("click", async (e) => {
      e.stopPropagation();
      await removeRecentFile(entry.projectId);
      tile.remove();
    });
    grid.appendChild(tile);
  });
}

// Projects that exist only on this computer (never saved as a .wfd file).
async function renderDrafts(wrap) {
  const projects = await store.listProjects();
  const drafts = [];
  for (const p of projects) {
    const hasContent = p.thumbnailPage?.elements?.length || p.pageCount > 1;
    if (!hasContent) continue;
    if (await recallRef(p.id).catch(() => null)) continue;
    drafts.push(p);
  }
  if (!drafts.length) return;

  wrap.classList.remove("hidden");
  wrap.appendChild(h("div", { class: "start-section-title" }, ["Not saved to a file ", h("span", { class: "start-section-sub" }, "— only on this computer")]));
  const grid = h("div", { class: "projects-grid start-grid small" });
  drafts.forEach((p) => {
    const tile = h("div", { class: "project-tile", tabindex: "0" });
    tile.innerHTML = `
      <div class="project-thumb">${miniPreview(p.canvas, p.thumbnailPage)}</div>
      <div class="project-title">${escapeHtml(p.title || "Untitled Wireframe")}</div>
      <div class="project-meta">edited ${formatTime(p.updatedAt)}</div>
      <button class="icon-btn project-delete" data-tip="Delete this draft">${UI.trash}</button>`;
    const open = async () => { if (await openDraft(p.id)) hideStartScreen(); };
    tile.addEventListener("click", (e) => { if (!e.target.closest(".project-delete")) open(); });
    tile.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
    tile.querySelector(".project-delete").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete "${p.title || "Untitled Wireframe"}"? It was never saved to a file, so this can't be undone.`)) return;
      await store.deleteProjectById(p.id);
      tile.remove();
      if (!grid.children.length) wrap.classList.add("hidden");
    });
    grid.appendChild(tile);
  });
  wrap.appendChild(grid);
}

// Opening a file from elsewhere (double-click while the app is open) closes it too.
window.addEventListener("wfd:project-opened", hideStartScreen);
