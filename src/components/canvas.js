import { store } from "../store.js";
import { createElementNode, clientToPageCoords, getZoom } from "./canvasElement.js";
import { renderRulers, updateRulerMouseIndicator } from "./rulers.js";
import { rectsIntersect, normalizeRect, bounds } from "../utils/geometry.js";
import { getVisualDef } from "../visualLibrary.js";
import { showToast } from "./toast.js";

let els = {};

const INSERT_TOOL_TYPE = {
  text: "text-box",
  shape: "rectangle",
  image: "image",
};

export function initCanvas() {
  els = {
    wrap: document.getElementById("canvas-viewport-wrap"),
    scroll: document.getElementById("canvas-scroll"),
    inner: document.getElementById("canvas-scroll-inner"),
    pageWrap: document.getElementById("page-canvas-wrap"),
    page: document.getElementById("page-canvas"),
    layer: document.getElementById("elements-layer"),
    marquee: document.getElementById("marquee-box"),
  };

  store.on("elements:change", () => renderElementsLayer());
  store.on("page:switch", () => {
    applyCanvasSize();
    renderElementsLayer();
  });
  store.on("selection:change", () => applySelectionClasses());
  store.on("settings:change", () => {
    applyCanvasSize();
    renderRulers();
  });

  setupPointerHandlers();
  setupDropHandlers();
  setupKeyboardShortcuts();
  setupWheelZoom();
  setupPasteHandler();

  els.scroll.addEventListener("scroll", () => renderRulers());
  window.addEventListener("resize", () => renderRulers());

  applyCanvasSize();
  renderElementsLayer();
  setupAutoFit();
  setTimeout(() => fitToScreen(), 30);
}

// ---------------- rendering ----------------

export function renderElementsLayer() {
  const page = store.getCurrentPage();
  els.layer.innerHTML = "";
  const sorted = [...page.elements].sort((a, b) => a.zIndex - b.zIndex);
  sorted.forEach((el) => {
    const node = createElementNode(el);
    els.layer.appendChild(node);
  });
  applySelectionClasses();
  renderEmptyHint(page);
}

function renderEmptyHint(page) {
  const existing = document.getElementById("canvas-empty-hint");
  if (page.elements.length > 0) {
    if (existing) existing.remove();
    return;
  }
  if (existing) return;

  const hint = document.createElement("div");
  hint.id = "canvas-empty-hint";
  hint.className = "canvas-empty-hint";
  hint.innerHTML = `
    <div class="hint-icon">${SPARKLE_SVG}</div>
    <div class="hint-title">Start building your dashboard wireframe</div>
    <div class="hint-sub">Drag any chart, card, table or filter from the <strong>Visuals</strong> panel onto this page — or generate several at once.</div>
    <div class="hint-actions">
      <button class="btn primary sm" data-action="hint-generate">Generate visuals</button>
      <button class="btn sm" data-action="hint-library">Browse the library</button>
    </div>
  `;
  hint.querySelector('[data-action="hint-generate"]').addEventListener("click", async () => {
    const mod = await import("./generateModal.js");
    mod.openGenerateModal();
  });
  hint.querySelector('[data-action="hint-library"]').addEventListener("click", () => {
    document.querySelector('#left-tabs [data-tab="library"]')?.click();
  });
  els.page.appendChild(hint);
}

const SPARKLE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/></svg>`;

function applySelectionClasses() {
  const page = store.getCurrentPage();
  const selection = new Set(store.selection);
  page.elements.forEach((el) => {
    const node = document.getElementById(`el-${el.id}`);
    if (!node) return;
    const isSel = selection.has(el.id);
    node.classList.toggle("selected", isSel);
    node.classList.toggle("multi", isSel && selection.size > 1);
  });
}

export function applyCanvasSize() {
  const { width, height } = store.doc.canvas;
  const zoom = getZoom();
  els.page.style.width = `${width}px`;
  els.page.style.height = `${height}px`;
  els.page.style.transform = `scale(${zoom})`;
  els.page.style.background = store.getCurrentPage().background || "#ffffff";
  els.pageWrap.style.width = `${width * zoom}px`;
  els.pageWrap.style.height = `${height * zoom}px`;

  const settings = store.doc.settings;
  els.page.classList.toggle("grid-on", !!settings.showGrid);
  els.page.style.backgroundSize = `${settings.gridSize}px ${settings.gridSize}px`;
  els.wrap.classList.toggle("rulers-hidden", !settings.showRulers);

  const zoomDisplay = document.getElementById("zoom-pct-display");
  if (zoomDisplay) zoomDisplay.textContent = `${Math.round(zoom * 100)}%`;

  document.dispatchEvent(new CustomEvent("wfd:statusbar-update"));
}

// ---------------- zoom ----------------

// Fit-to-screen stays "on" until the user zooms by hand: while it's on, the
// page re-fits whenever the canvas area changes size (side panels hidden or
// shown, window resized) and whenever a project is opened.
let autoFit = true;
const FIT_PADDING = 40;

export function setZoom(z, opts = {}) {
  if (!opts.fromFit) autoFit = false;
  const prevZoom = getZoom();
  store.setZoom(z);
  applyCanvasSize();
  renderRulers();
  if (opts.centerClientX !== undefined) {
    // keep the point under the cursor stable
    const scroll = els.scroll;
    const rect = scroll.getBoundingClientRect();
    const zoom = getZoom();
    const ratio = zoom / prevZoom;
    const cx = opts.centerClientX - rect.left + scroll.scrollLeft;
    const cy = opts.centerClientY - rect.top + scroll.scrollTop;
    scroll.scrollLeft = cx * ratio - (opts.centerClientX - rect.left);
    scroll.scrollTop = cy * ratio - (opts.centerClientY - rect.top);
  }
}

export function zoomIn() {
  setZoom(Math.min(4, getZoom() * 1.2));
}
export function zoomOut() {
  setZoom(Math.max(0.1, getZoom() / 1.2));
}
export function zoomReset() {
  setZoom(1);
  centerCanvas();
}

export function fitToScreen() {
  if (!els.scroll.clientWidth) return; // not laid out yet
  const { width, height } = store.doc.canvas;
  const vw = els.scroll.clientWidth - FIT_PADDING * 2 - 2;
  const vh = els.scroll.clientHeight - FIT_PADDING * 2 - 2;
  const scale = Math.max(0.1, Math.min(vw / width, vh / height, 2));
  setZoom(Math.floor(scale * 1000) / 1000, { fromFit: true });
  autoFit = true;
  centerCanvas();
}

function centerCanvas() {
  setTimeout(() => {
    const scroll = els.scroll;
    scroll.scrollLeft = Math.max(0, (scroll.scrollWidth - scroll.clientWidth) / 2);
    scroll.scrollTop = 0;
  }, 0);
}

function setupAutoFit() {
  let pending = null;
  const refit = () => {
    if (!autoFit) return;
    clearTimeout(pending);
    pending = setTimeout(() => fitToScreen(), 30);
  };
  new ResizeObserver(refit).observe(els.scroll);
  // Opening / switching projects: fit the new project instead of restoring its saved zoom.
  window.addEventListener("wfd:project-opened", () => { autoFit = true; refit(); });
}

function setupWheelZoom() {
  els.scroll.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 1 / 1.08 : 1.08;
        setZoom(Math.max(0.1, Math.min(4, getZoom() * delta)), { centerClientX: e.clientX, centerClientY: e.clientY });
      }
    },
    { passive: false }
  );
}

// ---------------- pan (hand tool + space + middle mouse) ----------------

let spaceHeld = false;
let panning = false;

function setupPointerHandlers() {
  els.page.addEventListener("pointerdown", (e) => onPageBackgroundPointerDown(e));

  els.scroll.addEventListener("pointerdown", (e) => {
    const isMiddle = e.button === 1;
    const isHandTool = store.ui.tool === "hand" || spaceHeld;
    if (isMiddle || (isHandTool && e.target === els.scroll)) {
      startPan(e);
    }
  });

  els.scroll.addEventListener("pointermove", (e) => updateRulerMouseIndicator(e.clientX, e.clientY));

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !isTypingTarget(e.target)) {
      spaceHeld = true;
      els.scroll.classList.add("hand-tool");
    }
  });
  document.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      spaceHeld = false;
      els.scroll.classList.remove("hand-tool");
    }
  });
}

function startPan(e) {
  e.preventDefault();
  panning = true;
  els.scroll.classList.add("panning");
  const startX = e.clientX, startY = e.clientY;
  const startLeft = els.scroll.scrollLeft, startTop = els.scroll.scrollTop;

  const onMove = (ev) => {
    els.scroll.scrollLeft = startLeft - (ev.clientX - startX);
    els.scroll.scrollTop = startTop - (ev.clientY - startY);
  };
  const onUp = () => {
    panning = false;
    els.scroll.classList.remove("panning");
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
}

// ---------------- click on empty canvas: marquee select / insert / deselect ----------------

function onPageBackgroundPointerDown(e) {
  if (e.target !== els.page && e.target !== els.layer) return; // clicked an element, handled elsewhere
  const tool = store.ui.tool;

  if (tool === "hand" || spaceHeld) return; // handled by pan

  if (tool === "text" || tool === "shape" || tool === "image") {
    const pt = clientToPageCoords(e.clientX, e.clientY);
    const type = INSERT_TOOL_TYPE[tool];
    const el = store.addElementFromLibrary(type, pt.x, pt.y);
    store.setTool("select");
    showToast(`Added ${el.name}`);
    return;
  }

  if (tool === "comment") {
    showToast("Click a visual to add a comment to it");
    return;
  }

  if (tool !== "select") return;

  startMarquee(e);
}

function startMarquee(e) {
  const startPt = clientToPageCoords(e.clientX, e.clientY);
  const wrapRect = els.wrap.getBoundingClientRect();
  const startScreen = { x: e.clientX - wrapRect.left, y: e.clientY - wrapRect.top };
  let moved = false;
  const additive = e.shiftKey || e.ctrlKey || e.metaKey;
  const initialSelection = additive ? [...store.selection] : [];

  els.marquee.classList.remove("hidden");

  const onMove = (ev) => {
    const curScreen = { x: ev.clientX - wrapRect.left, y: ev.clientY - wrapRect.top };
    if (Math.abs(curScreen.x - startScreen.x) > 3 || Math.abs(curScreen.y - startScreen.y) > 3) moved = true;
    const left = Math.min(startScreen.x, curScreen.x);
    const top = Math.min(startScreen.y, curScreen.y);
    const w = Math.abs(curScreen.x - startScreen.x);
    const h = Math.abs(curScreen.y - startScreen.y);
    els.marquee.style.left = `${left}px`;
    els.marquee.style.top = `${top}px`;
    els.marquee.style.width = `${w}px`;
    els.marquee.style.height = `${h}px`;

    const curPt = clientToPageCoords(ev.clientX, ev.clientY);
    const rect = normalizeRect({ x1: startPt.x, y1: startPt.y, x2: curPt.x, y2: curPt.y });
    const rectBounds = { left: rect.x, top: rect.y, right: rect.x + rect.w, bottom: rect.y + rect.h };
    const page = store.getCurrentPage();
    const hitIds = page.elements.filter((el) => !el.hidden && !el.locked && rectsIntersect(rectBounds, bounds(el))).map((el) => el.id);
    store.setSelection([...new Set([...initialSelection, ...hitIds])]);
  };

  const onUp = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    els.marquee.classList.add("hidden");
    if (!moved && !additive) {
      store.clearSelection();
    }
  };

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
}

// ---------------- drop from library ----------------

function setupDropHandlers() {
  els.scroll.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  els.scroll.addEventListener("drop", (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("text/wfd-visual-type");
    if (!type) return;
    const def = getVisualDef(type);
    if (!def) return;
    const pt = clientToPageCoords(e.clientX, e.clientY);
    const el = store.addElementFromLibrary(type, pt.x, pt.y);
    if (el) showToast(`Added ${el.name} to canvas`);
  });
}

// ---------------- keyboard shortcuts ----------------

function isTypingTarget(target) {
  if (!target) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (isTypingTarget(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;

    if ((e.key === "Delete" || e.key === "Backspace") && store.selection.length) {
      e.preventDefault();
      store.deleteElements(store.selection);
      return;
    }
    if (!mod && !e.altKey) {
      const toolKeys = { v: "select", h: "hand", t: "text", r: "shape", i: "image", c: "comment" };
      const key = e.key.toLowerCase();
      if (toolKeys[key]) {
        e.preventDefault();
        store.setTool(toolKeys[key]);
        return;
      }
    }
    if (mod && e.key.toLowerCase() === "d" && store.selection.length) {
      e.preventDefault();
      store.duplicateElements(store.selection);
      return;
    }
    if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      store.undo();
      return;
    }
    if ((mod && e.key.toLowerCase() === "y") || (mod && e.shiftKey && e.key.toLowerCase() === "z")) {
      e.preventDefault();
      store.redo();
      return;
    }
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      store.setSelection(store.getCurrentPage().elements.filter((el) => !el.locked).map((el) => el.id));
      return;
    }
    if (mod && e.key.toLowerCase() === "g" && store.selection.length >= 2) {
      e.preventDefault();
      if (e.shiftKey) store.ungroupElements(store.selection);
      else store.groupElements(store.selection);
      return;
    }
    if (e.key === "Escape") {
      store.clearSelection();
      return;
    }
    if (e.key.startsWith("Arrow") && store.selection.length) {
      e.preventDefault();
      const delta = e.shiftKey ? 10 : 1;
      const dx = e.key === "ArrowLeft" ? -delta : e.key === "ArrowRight" ? delta : 0;
      const dy = e.key === "ArrowUp" ? -delta : e.key === "ArrowDown" ? delta : 0;
      const page = store.getCurrentPage();
      const updates = store.selection.map((id) => {
        const el = store.getElement(id, page);
        return { id, patch: { x: el.x + dx, y: el.y + dy } };
      });
      store.batchUpdateElements(updates);
      return;
    }
    if (mod && (e.key === "=" || e.key === "+")) {
      e.preventDefault();
      zoomIn();
      return;
    }
    if (mod && e.key === "-") {
      e.preventDefault();
      zoomOut();
      return;
    }
    if (mod && e.key === "0") {
      e.preventDefault();
      fitToScreen();
      return;
    }
  });
}

// ---------------- paste image from clipboard (screenshots, copied images) ----------------

function setupPasteHandler() {
  document.addEventListener("paste", (e) => {
    if (isTypingTarget(document.activeElement)) return; // let normal text paste happen
    if (document.querySelector(".modal-overlay")) return; // don't hijack paste inside a dialog

    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    let imageItem = null;
    for (const item of items) {
      if (item.type && item.type.startsWith("image/")) {
        imageItem = item;
        break;
      }
    }
    if (!imageItem) return;

    e.preventDefault();
    const blob = imageItem.getAsFile();
    if (!blob) return;

    downscaleImageBlob(blob)
      .then(({ dataUrl, naturalWidth, naturalHeight }) => {
        const el = store.addPastedImage(dataUrl, naturalWidth, naturalHeight);
        if (el) showToast("Pasted image added to canvas");
      })
      .catch((err) => {
        console.error(err);
        showToast("Couldn't paste that image", "error");
      });
  });
}

// Reads a pasted image blob and re-encodes it capped at a sane resolution,
// so a giant screenshot doesn't bloat autosave/export with a multi-MB data URL.
function downscaleImageBlob(blob) {
  const maxSide = 1600;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the pasted image"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode the pasted image"));
      img.onload = () => {
        let { naturalWidth: width, naturalHeight: height } = img;
        if (width > maxSide || height > maxSide) {
          const scale = maxSide / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvasEl = document.createElement("canvas");
        canvasEl.width = width;
        canvasEl.height = height;
        const ctx = canvasEl.getContext("2d");
        // JPEG has no transparency: without this, a transparent PNG (a logo,
        // an icon) would come out on a black background.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve({
          dataUrl: canvasEl.toDataURL("image/jpeg", 0.88),
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(blob);
  });
}
