// Tooltips for any element with a data-tip attribute. Rendered as one
// body-level fixed element (not a ::after) so scrolling/overflow-clipped
// containers like the toolbar can't cut it off, and positioned beside the
// element — below by default, above if there's no room — never on top of it.

const GAP = 8;
const EDGE = 6;
const SHOW_DELAY = 300;

let tipEl = null;
let showTimer = null;
let currentTarget = null;

export function initTooltips() {
  tipEl = document.createElement("div");
  tipEl.className = "wfd-tooltip";
  tipEl.setAttribute("role", "tooltip");
  document.body.appendChild(tipEl);

  document.addEventListener("mouseover", (e) => {
    const target = e.target.closest?.("[data-tip]");
    if (target === currentTarget) return;
    hide();
    if (!target) return;
    currentTarget = target;
    showTimer = setTimeout(() => show(target), SHOW_DELAY);
  });
  document.addEventListener("mouseout", (e) => {
    if (currentTarget && !currentTarget.contains(e.relatedTarget)) hide();
  });
  document.addEventListener("mousedown", hide, true);
  document.addEventListener("keydown", hide, true);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("blur", hide);
}

function show(target) {
  if (!target.isConnected || target !== currentTarget) return;
  const text = target.getAttribute("data-tip");
  if (!text) return;
  tipEl.textContent = text;
  tipEl.style.left = "0px";
  tipEl.style.top = "0px";
  tipEl.classList.add("visible");

  const r = target.getBoundingClientRect();
  const tw = tipEl.offsetWidth;
  const th = tipEl.offsetHeight;

  let top = r.bottom + GAP;
  if (top + th > window.innerHeight - EDGE) top = r.top - GAP - th;
  top = Math.max(EDGE, top);

  let left = r.left + r.width / 2 - tw / 2;
  left = Math.max(EDGE, Math.min(window.innerWidth - tw - EDGE, left));

  tipEl.style.left = `${Math.round(left)}px`;
  tipEl.style.top = `${Math.round(top)}px`;
}

function hide() {
  clearTimeout(showTimer);
  showTimer = null;
  currentTarget = null;
  if (tipEl) tipEl.classList.remove("visible");
}
