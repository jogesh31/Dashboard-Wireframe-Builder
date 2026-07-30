import { store } from "../store.js";
import { UI } from "../uiIcons.js";
import { h, escapeHtml, formatTime } from "../utils/dom.js";

let panelEl;
const openPopovers = new Map(); // elId -> { pop, elId } — multiple sticky notes can be open at once
let hoverPreviewEl = null;
let hoverPreviewTimer = null;

export function initCommentsPanel() {
  panelEl = document.getElementById("comments-panel");
  store.on("elements:change", renderPanel);
  store.on("selection:change", renderPanel);
  store.on("page:switch", () => {
    renderPanel();
    closeAllPopovers(); // notes are anchored to elements on the page you just left
  });
  store.on("comments:change", () => {
    renderPanel();
    refreshPopover();
  });
  window.addEventListener("wfd:open-comments", (e) => openPopover(e.detail.elId));
  setupHoverPreview();
  renderPanel();
}

function renderPanel() {
  panelEl.innerHTML = "";
  const selected = store.getSelectedElements();

  if (selected.length === 1) {
    const el = selected[0];
    panelEl.appendChild(
      h("div", { class: "comment-thread-target" }, [`Comments on `, h("strong", {}, el.name || el.type)])
    );
    const listWrap = h("div", { class: "comment-list" });
    renderThreadInto(listWrap, el.id);
    panelEl.appendChild(listWrap);
    panelEl.appendChild(renderComposer(el.id));
    return;
  }

  const all = store.getAllComments();
  if (!all.length) {
    panelEl.appendChild(
      h("div", { class: "empty-state" }, "No comments yet. Select a visual and add a comment, or click a comment badge on the canvas.")
    );
    return;
  }
  panelEl.appendChild(h("div", { class: "comment-thread-target" }, `All comments on this page (${all.length})`));
  const listWrap = h("div", { class: "comment-list" });
  all.forEach((c) => {
    const row = h("div", { class: `comment-item ${c.resolved ? "resolved" : ""}` });
    row.innerHTML = `
      <div class="comment-meta"><span class="comment-author">${escapeHtml(c.author)}</span><span class="comment-time">${formatTime(c.createdAt)}</span></div>
      <div class="comment-text">${escapeHtml(c.text)}</div>
      <div class="comment-actions"><button data-action="goto">Go to “${escapeHtml(c.elName || "")}”</button></div>`;
    row.querySelector('[data-action="goto"]').addEventListener("click", () => store.setSelection([c.elId]));
    listWrap.appendChild(row);
  });
  panelEl.appendChild(listWrap);
}

function renderThreadInto(container, elId) {
  container.innerHTML = "";
  const page = store.getCurrentPage();
  const el = store.getElement(elId, page);
  const comments = (el && el.comments) || [];
  if (!comments.length) {
    container.appendChild(h("div", { class: "empty-state" }, "No comments on this visual yet."));
    return;
  }
  comments
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .forEach((c) => container.appendChild(renderCommentItem(elId, c)));
}

function renderCommentItem(elId, c) {
  const item = h("div", { class: `comment-item ${c.resolved ? "resolved" : ""}` });
  item.innerHTML = `
    <div class="comment-meta"><span class="comment-author">${escapeHtml(c.author)}</span><span class="comment-time">${formatTime(c.updatedAt || c.createdAt)}</span></div>
    <div class="comment-text" data-role="text">${escapeHtml(c.text)}</div>
    <div class="comment-actions">
      <button data-action="resolve">${c.resolved ? "Reopen" : "Resolve"}</button>
      <button data-action="edit">Edit</button>
      <button data-action="delete">Delete</button>
    </div>`;

  item.querySelector('[data-action="resolve"]').addEventListener("click", () => store.toggleResolveComment(elId, c.id));
  item.querySelector('[data-action="delete"]').addEventListener("click", () => {
    if (confirm("Delete this comment?")) store.deleteComment(elId, c.id);
  });
  item.querySelector('[data-action="edit"]').addEventListener("click", () => {
    const textEl = item.querySelector('[data-role="text"]');
    const ta = h("textarea", {}, c.text);
    textEl.replaceWith(ta);
    ta.focus();
    const save = () => {
      const val = ta.value.trim();
      if (val) store.editComment(elId, c.id, val);
    };
    ta.addEventListener("blur", save);
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ta.blur(); }
    });
  });

  return item;
}

function renderComposer(elId) {
  const wrap = h("div", { class: "comment-composer" });
  const ta = h("textarea", { placeholder: "Add a comment…", rows: "2" });
  const btn = h("button", { class: "btn primary sm" }, "Comment");
  btn.addEventListener("click", () => {
    if (!ta.value.trim()) return;
    store.addComment(elId, ta.value);
    ta.value = "";
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      btn.click();
    }
  });
  wrap.appendChild(ta);
  wrap.appendChild(btn);
  return wrap;
}

// ---------------- hover preview (icon-only, comment text shows on hover) ----------------

function setupHoverPreview() {
  document.addEventListener("mouseover", (e) => {
    const badge = e.target.closest(".comment-badge");
    if (!badge || badge.classList.contains("empty")) return;
    const elId = badge.closest(".el")?.dataset.id;
    if (elId && openPopovers.has(elId)) return; // that note is already open — don't also show the preview
    clearTimeout(hoverPreviewTimer);
    hoverPreviewTimer = setTimeout(() => showHoverPreview(badge), 150);
  });
  document.addEventListener("mouseout", (e) => {
    const badge = e.target.closest(".comment-badge");
    if (!badge) return;
    clearTimeout(hoverPreviewTimer);
    hideHoverPreview();
  });
}

function showHoverPreview(badge) {
  hideHoverPreview();
  const elNode = badge.closest(".el");
  if (!elNode) return;
  const elId = elNode.dataset.id;
  const el = store.getElement(elId);
  const comments = (el && el.comments) || [];
  if (!comments.length) return;

  const sorted = comments.slice().sort((a, b) => b.createdAt - a.createdAt);
  const shown = sorted.slice(0, 3);
  const preview = h("div", { class: "comment-hover-preview" });
  preview.innerHTML = shown
    .map((c) => `<div class="chp-item"><span class="chp-author">${escapeHtml(c.author)}:</span> ${escapeHtml(c.text.length > 120 ? c.text.slice(0, 120) + "…" : c.text)}</div>`)
    .join("");
  if (sorted.length > shown.length) {
    preview.innerHTML += `<div class="chp-more">+${sorted.length - shown.length} more — click to view</div>`;
  }
  document.body.appendChild(preview);

  const rect = badge.getBoundingClientRect();
  const top = Math.min(window.innerHeight - preview.offsetHeight - 10, rect.bottom + 6);
  const left = Math.min(window.innerWidth - preview.offsetWidth - 10, Math.max(6, rect.left - preview.offsetWidth / 2 + rect.width / 2));
  preview.style.top = `${Math.max(6, top)}px`;
  preview.style.left = `${left}px`;

  hoverPreviewEl = preview;
}

function hideHoverPreview() {
  if (hoverPreviewEl) {
    hoverPreviewEl.remove();
    hoverPreviewEl = null;
  }
}

// ---------------- floating sticky-note popovers (click a comment badge) ----------------
// Multiple can be open at once, like sticky notes — each is independently
// draggable anywhere on screen, resizable via the native corner grip, and can
// be pinned so it stays visible instead of auto-closing on an outside click.

let zCounter = 4000;

function openPopover(elId) {
  clearTimeout(hoverPreviewTimer);
  hideHoverPreview();
  store.setSelection([elId]);

  const existing = openPopovers.get(elId);
  if (existing) {
    bringToFront(existing.pop);
    return;
  }

  const node = document.getElementById(`el-${elId}`);
  if (!node) return;
  const rect = node.getBoundingClientRect();

  const pop = h("div", { class: "comment-popover" });
  pop.innerHTML = `
    <div class="comment-popover-header" data-role="drag-handle">
      <span>Comments</span>
      <div class="row" style="gap:2px">
        <button class="icon-btn sm" data-action="pin" data-tip="Pin — keep this note visible">${UI.pin}</button>
        <button class="icon-btn sm" data-action="close">${UI.close}</button>
      </div>
    </div>`;
  const listWrap = h("div", { class: "comment-list" });
  renderThreadInto(listWrap, elId);
  pop.appendChild(listWrap);
  pop.appendChild(renderComposer(elId));
  pop.appendChild(h("div", { class: "comment-popover-compact", "data-role": "compact-preview" }));

  document.body.appendChild(pop);
  const top = Math.min(window.innerHeight - pop.offsetHeight - 12, rect.bottom + 8);
  const left = Math.min(window.innerWidth - 300, rect.left);
  pop.style.top = `${Math.max(8, top)}px`;
  pop.style.left = `${Math.max(8, left)}px`;

  pop.querySelector('[data-action="close"]').addEventListener("click", () => closePopover(elId));

  const pinBtn = pop.querySelector('[data-action="pin"]');
  pinBtn.addEventListener("click", () => {
    const pinned = pop.classList.toggle("pinned");
    pinBtn.innerHTML = pinned ? UI.pinFilled : UI.pin;
    pinBtn.classList.toggle("active", pinned);
    pinBtn.setAttribute("data-tip", pinned ? "Unpin — show full comments again" : "Pin — collapse to a short note");
    if (pinned) updateCompactPreview(pop, elId);
  });

  // Clicking the collapsed short box re-expands it without unpinning (still stays visible either way).
  pop.querySelector('[data-role="compact-preview"]').addEventListener("click", () => {
    pop.classList.remove("pinned");
    pinBtn.innerHTML = UI.pin;
    pinBtn.classList.remove("active");
    pinBtn.setAttribute("data-tip", "Pin — collapse to a short note");
  });

  pop.addEventListener("pointerdown", () => bringToFront(pop));
  makeDraggable(pop, pop.querySelector('[data-role="drag-handle"]'));

  openPopovers.set(elId, { pop, elId });
  bringToFront(pop);

  if (openPopovers.size === 1) {
    setTimeout(() => document.addEventListener("mousedown", onOutsideClick), 0);
  }
}

function bringToFront(pop) {
  zCounter += 1;
  pop.style.zIndex = zCounter;
}

function makeDraggable(pop, handle) {
  handle.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    e.preventDefault();
    bringToFront(pop);
    const startX = e.clientX, startY = e.clientY;
    const startLeft = pop.offsetLeft, startTop = pop.offsetTop;
    pop.classList.add("dragging");

    const onMove = (ev) => {
      const nx = startLeft + (ev.clientX - startX);
      const ny = startTop + (ev.clientY - startY);
      pop.style.left = `${Math.max(0, Math.min(window.innerWidth - 60, nx))}px`;
      pop.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, ny))}px`;
    };
    const onUp = () => {
      pop.classList.remove("dragging");
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  });
}

function onOutsideClick(e) {
  if (e.target.closest(".comment-badge")) return; // badge clicks manage their own open/focus
  openPopovers.forEach(({ pop, elId }) => {
    if (pop.classList.contains("pinned")) return;
    if (!pop.contains(e.target)) closePopover(elId);
  });
}

function refreshPopover() {
  openPopovers.forEach(({ pop, elId }) => {
    const listWrap = pop.querySelector(".comment-list");
    renderThreadInto(listWrap, elId);
    if (pop.classList.contains("pinned")) updateCompactPreview(pop, elId);
  });
}

function updateCompactPreview(pop, elId) {
  const compact = pop.querySelector('[data-role="compact-preview"]');
  if (!compact) return;
  const el = store.getElement(elId);
  const comments = (el && el.comments) || [];
  if (!comments.length) {
    compact.textContent = "No comments yet — click to open";
    return;
  }
  const latest = comments.slice().sort((a, b) => b.createdAt - a.createdAt)[0];
  const countSuffix = comments.length > 1 ? ` (+${comments.length - 1} more)` : "";
  compact.innerHTML = `<span class="cpc-author">${escapeHtml(latest.author)}:</span> ${escapeHtml(latest.text)}${escapeHtml(countSuffix)}`;
}

function closePopover(elId) {
  const entry = openPopovers.get(elId);
  if (!entry) return;
  entry.pop.remove();
  openPopovers.delete(elId);
  if (openPopovers.size === 0) {
    document.removeEventListener("mousedown", onOutsideClick);
  }
}

function closeAllPopovers() {
  [...openPopovers.keys()].forEach((id) => closePopover(id));
}
