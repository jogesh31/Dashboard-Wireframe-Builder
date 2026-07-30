import { store } from "../store.js";
import { renderElementBody, elementEditableFieldSelector } from "../visualRenderers.js";
import { snapValue, computeAlignmentGuides, bounds } from "../utils/geometry.js";
import { escapeHtml } from "../utils/dom.js";
import { getVisualDef } from "../visualLibrary.js";

const LOCK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/></svg>`;
const COMMENT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 3c-5 0-9 3.4-9 7.5 0 2.3 1.2 4.3 3.2 5.7-.1 1-.5 2.1-1.2 3 1.5-.2 2.8-.8 3.8-1.5 1 .3 2 .5 3.2.5 5 0 9-3.4 9-7.5S17 3 12 3Z"/></svg>`;

function getZoom() {
  return store.doc.settings.zoom || 1;
}

function pageCanvasEl() {
  return document.getElementById("page-canvas");
}

function clientToPageCoords(clientX, clientY) {
  const rect = pageCanvasEl().getBoundingClientRect();
  const zoom = getZoom();
  return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
}

export function createElementNode(el) {
  const node = document.createElement("div");
  node.className = "el";
  node.id = `el-${el.id}`;
  node.dataset.id = el.id;
  node.dataset.type = el.type;
  applyTransform(node, el);

  const inner = document.createElement("div");
  inner.className = "el-inner";
  inner.style.setProperty("--el-color", el.style.color || "#20222b");
  inner.style.setProperty("--el-font", el.style.fontFamily || "Segoe UI");
  inner.style.setProperty("--el-title-size", `${el.style.fontSize || 13}px`);
  inner.style.setProperty("--el-weight", el.style.fontWeight || "400");
  inner.style.setProperty("--el-align", el.style.textAlign || "left");
  inner.style.setProperty("--el-accent", "#6366f1");
  inner.innerHTML = renderElementBody(el);
  node.appendChild(inner);

  node.appendChild(elOverlayFragment(el));

  attachHandlers(node, el);
  return node;
}

function elOverlayFragment(el) {
  const frag = document.createDocumentFragment();

  const selOutline = document.createElement("div");
  selOutline.className = "el-select-outline";
  frag.appendChild(selOutline);

  const hoverOutline = document.createElement("div");
  hoverOutline.className = "el-hover-outline";
  frag.appendChild(hoverOutline);

  const tag = document.createElement("div");
  tag.className = "el-label-tag";
  tag.textContent = el.name || el.type;
  frag.appendChild(tag);

  ["nw", "n", "ne", "e", "se", "s", "sw", "w"].forEach((dir) => {
    const h = document.createElement("div");
    h.className = `resize-handle ${dir}`;
    h.dataset.dir = dir;
    frag.appendChild(h);
  });

  const rotateHandle = document.createElement("div");
  rotateHandle.className = "rotate-handle";
  frag.appendChild(rotateHandle);

  if (el.locked) {
    const lockBadge = document.createElement("div");
    lockBadge.className = "lock-badge";
    lockBadge.innerHTML = LOCK_ICON;
    frag.appendChild(lockBadge);
  }

  const hasComments = el.comments && el.comments.length;
  const badge = document.createElement("div");
  badge.className = `comment-badge${hasComments ? "" : " empty"}`;
  badge.dataset.role = "comment-badge";
  if (hasComments) {
    const unresolved = el.comments.filter((c) => !c.resolved).length;
    badge.textContent = String(unresolved || el.comments.length);
  } else {
    badge.innerHTML = COMMENT_ICON;
    badge.setAttribute("data-tip", "Add comment");
  }
  frag.appendChild(badge);

  return frag;
}

export function applyTransform(node, el) {
  node.style.left = `${el.x}px`;
  node.style.top = `${el.y}px`;
  node.style.width = `${el.w}px`;
  node.style.height = `${el.h}px`;
  node.style.zIndex = el.zIndex;
  node.style.transform = el.rotation ? `rotate(${el.rotation}deg)` : "";
  node.style.opacity = (el.style.opacity ?? 100) / 100;
  node.style.background = el.style.background || "transparent";
  node.style.border = el.style.borderWidth > 0 ? `${el.style.borderWidth}px ${el.style.borderStyle || "solid"} ${el.style.borderColor}` : "none";
  node.style.borderRadius = `${Math.min(el.style.borderRadius ?? 0, Math.min(el.w, el.h) / 2)}px`;
  node.style.boxShadow = el.style.shadow === "sm" ? "0 1px 3px rgba(0,0,0,0.15)" : el.style.shadow === "md" ? "0 4px 10px rgba(0,0,0,0.18)" : el.style.shadow === "lg" ? "0 10px 24px rgba(0,0,0,0.22)" : "none";
  node.classList.toggle("locked", !!el.locked);
  node.classList.toggle("el-hidden", !!el.hidden);
  node.classList.toggle("is-group", !!el.groupId);
}

// ---------------- interactions ----------------

function attachHandlers(node, el) {
  node.addEventListener("pointerdown", (e) => onElementPointerDown(e, node, el));
  node.addEventListener("dblclick", (e) => onElementDoubleClick(e, node, el));

  const commentBadge = node.querySelector('[data-role="comment-badge"]');
  if (commentBadge) {
    commentBadge.addEventListener("pointerdown", (e) => e.stopPropagation());
    commentBadge.addEventListener("click", (e) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent("wfd:open-comments", { detail: { elId: el.id } }));
    });
  }

  node.querySelectorAll(".resize-handle").forEach((h) => {
    h.addEventListener("pointerdown", (e) => onResizeStart(e, node, el, h.dataset.dir));
  });
  const rotateHandle = node.querySelector(".rotate-handle");
  if (rotateHandle) rotateHandle.addEventListener("pointerdown", (e) => onRotateStart(e, node, el));
}

function isEditableTarget(target) {
  return target.closest("[contenteditable]") || target.tagName === "INPUT" || target.tagName === "TEXTAREA";
}

function onElementPointerDown(e, node, el) {
  const tool = store.ui.tool;
  if (tool === "comment") {
    e.stopPropagation();
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("wfd:open-comments", { detail: { elId: el.id } }));
    return;
  }
  if (tool !== "select") return; // let canvas-level handler manage insert/hand tools
  if (isEditableTarget(e.target) && node.querySelector('[contenteditable="true"]')) return; // currently editing text
  if (el.locked) return;
  if (e.target.closest(".resize-handle") || e.target.closest(".rotate-handle")) return;

  e.stopPropagation();

  const currentPage = store.getCurrentPage();
  const liveEl = store.getElement(el.id, currentPage) || el;
  const groupIds = liveEl.groupId ? store.getGroupMemberIds(liveEl.groupId) : [el.id];
  const alreadySelected = store.selection.includes(el.id);
  const additive = e.shiftKey || e.ctrlKey || e.metaKey;

  if (additive) {
    if (alreadySelected) {
      store.setSelection(store.selection.filter((id) => !groupIds.includes(id)));
    } else {
      store.setSelection([...new Set([...store.selection, ...groupIds])]);
    }
  } else if (!alreadySelected) {
    store.setSelection(groupIds);
  }

  if (!store.selection.includes(el.id)) return; // was a deselect click

  startDrag(e, el.id);
}

function startDrag(e, primaryId) {
  const page = store.getCurrentPage();
  const selectedIds = [...store.selection];
  const startEls = selectedIds.map((id) => store.getElement(id, page)).filter(Boolean).map((e2) => ({ id: e2.id, x: e2.x, y: e2.y, w: e2.w, h: e2.h }));
  const primary = startEls.find((s) => s.id === primaryId) || startEls[0];
  if (!primary) return;

  const others = page.elements.filter((e2) => !selectedIds.includes(e2.id) && !e2.hidden).map(bounds);
  const startPointer = clientToPageCoords(e.clientX, e.clientY);
  const settings = store.doc.settings;
  let moved = false;
  let lastDx = 0, lastDy = 0;

  const onMove = (ev) => {
    const cur = clientToPageCoords(ev.clientX, ev.clientY);
    let dx = cur.x - startPointer.x;
    let dy = cur.y - startPointer.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved = true;
    if (!moved) return;

    let newX = primary.x + dx;
    let newY = primary.y + dy;

    if (settings.snapToGrid) {
      newX = snapValue(newX, settings.gridSize);
      newY = snapValue(newY, settings.gridSize);
    }

    const movingBounds = { left: newX, top: newY, right: newX + primary.w, bottom: newY + primary.h, centerX: newX + primary.w / 2, centerY: newY + primary.h / 2, width: primary.w, height: primary.h };
    const guides = computeAlignmentGuides(movingBounds, others, 6 / getZoom());
    if (guides.vGuides.length) newX += guides.dx;
    if (guides.hGuides.length) newY += guides.dy;

    dx = newX - primary.x;
    dy = newY - primary.y;

    // Keep every selected element (not just the one under the cursor) fully on the page.
    const { width: canvasW, height: canvasH } = store.doc.canvas;
    let minDx = -Infinity, maxDx = Infinity, minDy = -Infinity, maxDy = Infinity;
    startEls.forEach((s) => {
      minDx = Math.max(minDx, -s.x);
      maxDx = Math.min(maxDx, canvasW - s.w - s.x);
      minDy = Math.max(minDy, -s.y);
      maxDy = Math.min(maxDy, canvasH - s.h - s.y);
    });
    if (minDx <= maxDx) dx = Math.max(minDx, Math.min(dx, maxDx));
    if (minDy <= maxDy) dy = Math.max(minDy, Math.min(dy, maxDy));

    lastDx = dx;
    lastDy = dy;

    startEls.forEach((s) => {
      const n = document.getElementById(`el-${s.id}`);
      if (n) {
        n.style.left = `${s.x + dx}px`;
        n.style.top = `${s.y + dy}px`;
      }
    });

    drawGuides(guides.vGuides, guides.hGuides);
  };

  const onUp = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    clearGuides();
    if (moved) {
      const updates = startEls.map((s) => ({ id: s.id, patch: { x: Math.round(s.x + lastDx), y: Math.round(s.y + lastDy) } }));
      store.batchUpdateElements(updates);
    }
  };

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
}

function onResizeStart(e, node, el) {
  e.stopPropagation();
  e.preventDefault();
  const dir = e.currentTarget.dataset.dir;
  const page = store.getCurrentPage();
  const liveEl = store.getElement(el.id, page) || el;
  const start = { x: liveEl.x, y: liveEl.y, w: liveEl.w, h: liveEl.h };
  const startPointer = clientToPageCoords(e.clientX, e.clientY);
  const settings = store.doc.settings;
  const minSize = 12;
  // Pictures resize like they do in Word/PowerPoint: corner handles keep the
  // original aspect ratio (so the image never gets stretched/cropped-looking);
  // edge handles still allow a free, single-axis resize.
  const isImage = getVisualDef(el.type)?.family === "image";
  const isCornerHandle = dir.length === 2;
  const aspect = start.w / start.h;

  const onMove = (ev) => {
    const cur = clientToPageCoords(ev.clientX, ev.clientY);
    let dx = cur.x - startPointer.x;
    let dy = cur.y - startPointer.y;

    let { x, y, w, h } = start;

    if (dir.includes("e")) w = Math.max(minSize, start.w + dx);
    if (dir.includes("s")) h = Math.max(minSize, start.h + dy);
    if (dir.includes("w")) {
      w = Math.max(minSize, start.w - dx);
      x = start.x + (start.w - w);
    }
    if (dir.includes("n")) {
      h = Math.max(minSize, start.h - dy);
      y = start.y + (start.h - h);
    }

    if (isImage && isCornerHandle) {
      if (Math.abs(w - start.w) >= Math.abs(h - start.h) * aspect) {
        w = Math.max(minSize, w);
        h = w / aspect;
      } else {
        h = Math.max(minSize, h);
        w = h * aspect;
      }
      if (dir.includes("w")) x = start.x + (start.w - w);
      if (dir.includes("n")) y = start.y + (start.h - h);
    }

    if (settings.snapToGrid) {
      const gs = settings.gridSize;
      if (dir.includes("e")) w = snapValue(x + w, gs) - x;
      if (dir.includes("s")) h = snapValue(y + h, gs) - y;
      if (dir.includes("w")) { const nx = snapValue(x, gs); w += x - nx; x = nx; }
      if (dir.includes("n")) { const ny = snapValue(y, gs); h += y - ny; y = ny; }
      w = Math.max(minSize, w);
      h = Math.max(minSize, h);
    }

    // Never let a resize push the element off the page.
    const { width: canvasW, height: canvasH } = store.doc.canvas;
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > canvasW) w = canvasW - x;
    if (y + h > canvasH) h = canvasH - y;
    w = Math.max(minSize, w);
    h = Math.max(minSize, h);

    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    node.style.width = `${w}px`;
    node.style.height = `${h}px`;
    node._pendingRect = { x, y, w, h };
  };

  const onUp = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    if (node._pendingRect) {
      const r = node._pendingRect;
      store.updateElement(el.id, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
      node._pendingRect = null;
    }
  };

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
}

function onRotateStart(e, node, el) {
  e.stopPropagation();
  e.preventDefault();
  const page = store.getCurrentPage();
  const liveEl = store.getElement(el.id, page) || el;
  const rect = node.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let lastRotation = liveEl.rotation || 0;

  const onMove = (ev) => {
    const angle = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90;
    let snapped = angle;
    if (ev.shiftKey) snapped = Math.round(angle / 15) * 15;
    lastRotation = Math.round(snapped);
    node.style.transform = `rotate(${lastRotation}deg)`;
  };
  const onUp = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    store.updateElement(el.id, { rotation: lastRotation });
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
}

function onElementDoubleClick(e, node, el) {
  if (store.ui.tool !== "select") return;
  if (el.locked) return;
  const fieldTarget = e.target.closest("[data-field]");
  const fields = elementEditableFieldSelector(el);
  if (!fields.length && !fieldTarget) return;
  const field = fieldTarget ? fieldTarget.dataset.field : fields[0];
  if (!field) return;
  e.stopPropagation();
  beginInlineEdit(node, el, field);
}

function beginInlineEdit(node, el, field) {
  const target = node.querySelector(`[data-field="${field}"]`);
  if (!target) return;
  node.classList.add("editing-text");
  target.contentEditable = "true";
  target.focus();
  document.execCommand && placeCaretAtEnd(target);

  const finish = (commit) => {
    target.contentEditable = "false";
    node.classList.remove("editing-text");
    target.removeEventListener("blur", onBlur);
    target.removeEventListener("keydown", onKeydown);
    if (commit) {
      const text = target.innerText.replace(/ /g, " ");
      store.updateElementContent(el.id, { [field]: text });
    } else {
      target.textContent = el.content?.[field] ?? "";
    }
  };

  const onBlur = () => finish(true);
  const onKeydown = (ev) => {
    ev.stopPropagation();
    if (ev.key === "Enter" && !ev.shiftKey && field !== "text") {
      ev.preventDefault();
      finish(true);
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      finish(false);
    }
  };
  target.addEventListener("blur", onBlur);
  target.addEventListener("keydown", onKeydown);
}

function placeCaretAtEnd(el2) {
  const range = document.createRange();
  range.selectNodeContents(el2);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// ---------------- guides ----------------
function drawGuides(vGuides, hGuides) {
  const svg = document.getElementById("guides-svg");
  if (!svg) return;
  svg.innerHTML = "";
  const zoom = getZoom();
  vGuides.forEach((g) => {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", g.value * zoom);
    line.setAttribute("x2", g.value * zoom);
    line.setAttribute("y1", g.from * zoom);
    line.setAttribute("y2", g.to * zoom);
    line.setAttribute("class", "guide-line");
    svg.appendChild(line);
  });
  hGuides.forEach((g) => {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("y1", g.value * zoom);
    line.setAttribute("y2", g.value * zoom);
    line.setAttribute("x1", g.from * zoom);
    line.setAttribute("x2", g.to * zoom);
    line.setAttribute("class", "guide-line");
    svg.appendChild(line);
  });
}

function clearGuides() {
  const svg = document.getElementById("guides-svg");
  if (svg) svg.innerHTML = "";
}

export { clientToPageCoords, getZoom };
