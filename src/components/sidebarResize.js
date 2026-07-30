import { renderRulers } from "./rulers.js";

const MIN_W = 220;
const MAX_W = 480;
const DEFAULTS = { left: 268, right: 300 };

const state = {
  left: { width: DEFAULTS.left, collapsed: false },
  right: { width: DEFAULTS.right, collapsed: false },
};

function loadPersisted() {
  try {
    const raw = localStorage.getItem("wfd-sidebar-layout");
    if (raw) {
      const saved = JSON.parse(raw);
      // The left panel holds the Pages (slide thumbnail) list, so — like Google
      // Slides' filmstrip — it should always be visible on load; only its width
      // is remembered. The right panel's collapsed state is still remembered.
      if (saved.left) delete saved.left.collapsed;
      Object.assign(state, saved);
    }
  } catch (e) { /* ignore */ }
}

function persist() {
  try {
    localStorage.setItem("wfd-sidebar-layout", JSON.stringify(state));
  } catch (e) { /* ignore */ }
}

function apply(side) {
  const s = state[side];
  const varName = side === "left" ? "--left-w" : "--right-w";
  document.documentElement.style.setProperty(varName, `${s.collapsed ? 0 : s.width}px`);

  const btn = document.getElementById(`${side}-collapse-btn`);
  if (btn) {
    if (side === "left") btn.textContent = s.collapsed ? "›" : "‹";
    else btn.textContent = s.collapsed ? "‹" : "›";
    btn.setAttribute("data-tip", s.collapsed ? "Show panel" : "Hide panel");
  }
  const handle = document.getElementById(`${side}-resize-handle`);
  if (handle) handle.classList.toggle("collapsed", s.collapsed);

  setTimeout(() => renderRulers(), 20);
}

export function initSidebarResize() {
  loadPersisted();
  apply("left");
  apply("right");

  setupSide("left");
  setupSide("right");
}

function setupSide(side) {
  const handle = document.getElementById(`${side}-resize-handle`);
  const collapseBtn = document.getElementById(`${side}-collapse-btn`);
  const body = document.getElementById("body-grid");

  collapseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    state[side].collapsed = !state[side].collapsed;
    apply(side);
    persist();
  });

  handle.addEventListener("pointerdown", (e) => {
    if (e.target === collapseBtn) return;
    if (state[side].collapsed) return; // expand via the button only
    e.preventDefault();
    handle.classList.add("dragging");
    const startX = e.clientX;
    const startWidth = state[side].width;

    const onMove = (ev) => {
      const delta = side === "left" ? ev.clientX - startX : startX - ev.clientX;
      state[side].width = Math.max(MIN_W, Math.min(MAX_W, startWidth + delta));
      apply(side);
    };
    const onUp = () => {
      handle.classList.remove("dragging");
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      persist();
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  });

  handle.addEventListener("dblclick", (e) => {
    if (e.target === collapseBtn) return;
    state[side].width = DEFAULTS[side];
    apply(side);
    persist();
  });
}
