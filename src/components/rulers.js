import { store } from "../store.js";

function niceStep(zoom) {
  const target = 70; // desired px between major ticks on screen
  const raw = target / zoom;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  return steps.find((s) => s >= raw) || 1000;
}

export function renderRulers() {
  const scroll = document.getElementById("canvas-scroll");
  const rulerH = document.getElementById("ruler-h");
  const rulerV = document.getElementById("ruler-v");
  const wrap = document.getElementById("page-canvas-wrap");
  if (!scroll || !rulerH || !rulerV || !wrap) return;

  const zoom = store.doc.settings.zoom || 1;
  const scrollRect = scroll.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const originX = wrapRect.left - scrollRect.left; // px offset of page origin within ruler viewport
  const originY = wrapRect.top - scrollRect.top;

  const step = niceStep(zoom);
  const stepPx = step * zoom;

  rulerH.innerHTML = "";
  rulerV.innerHTML = "";

  const hWidth = rulerH.clientWidth;
  const vHeight = rulerV.clientHeight;

  const firstTickIndexH = Math.floor(-originX / stepPx) - 1;
  const lastTickIndexH = Math.ceil((hWidth - originX) / stepPx) + 1;
  for (let i = firstTickIndexH; i <= lastTickIndexH; i++) {
    const value = i * step;
    const px = originX + value * zoom;
    if (px < -20 || px > hWidth + 20) continue;
    const mark = document.createElement("div");
    mark.className = "ruler-mark";
    mark.style.left = `${px}px`;
    mark.style.height = value % (step * 5) === 0 ? "9px" : "5px";
    rulerH.appendChild(mark);
    if (value % (step * 2) === 0 || step >= 50) {
      const label = document.createElement("div");
      label.className = "ruler-tick";
      label.style.left = `${px + 2}px`;
      label.textContent = value;
      rulerH.appendChild(label);
    }
  }

  const firstTickIndexV = Math.floor(-originY / stepPx) - 1;
  const lastTickIndexV = Math.ceil((vHeight - originY) / stepPx) + 1;
  for (let i = firstTickIndexV; i <= lastTickIndexV; i++) {
    const value = i * step;
    const px = originY + value * zoom;
    if (px < -20 || px > vHeight + 20) continue;
    const mark = document.createElement("div");
    mark.className = "ruler-mark";
    mark.style.top = `${px}px`;
    mark.style.width = value % (step * 5) === 0 ? "9px" : "5px";
    rulerV.appendChild(mark);
    if (value % (step * 2) === 0 || step >= 50) {
      const label = document.createElement("div");
      label.className = "ruler-tick";
      label.style.top = `${px + 2}px`;
      label.textContent = value;
      rulerV.appendChild(label);
    }
  }
}

export function updateRulerMouseIndicator(clientX, clientY) {
  const scroll = document.getElementById("canvas-scroll");
  const rulerH = document.getElementById("ruler-h");
  const rulerV = document.getElementById("ruler-v");
  if (!scroll || !rulerH || !rulerV) return;
  const rect = scroll.getBoundingClientRect();

  let hInd = rulerH.querySelector(".ruler-mouse-indicator");
  if (!hInd) {
    hInd = document.createElement("div");
    hInd.className = "ruler-mouse-indicator";
    rulerH.appendChild(hInd);
  }
  hInd.style.left = `${clientX - rect.left}px`;

  let vInd = rulerV.querySelector(".ruler-mouse-indicator");
  if (!vInd) {
    vInd = document.createElement("div");
    vInd.className = "ruler-mouse-indicator";
    rulerV.appendChild(vInd);
  }
  vInd.style.top = `${clientY - rect.top}px`;
}
