export function snapValue(value, gridSize) {
  if (!gridSize) return value;
  return Math.round(value / gridSize) * gridSize;
}

export function bounds(el) {
  return {
    left: el.x,
    top: el.y,
    right: el.x + el.w,
    bottom: el.y + el.h,
    centerX: el.x + el.w / 2,
    centerY: el.y + el.h / 2,
    width: el.w,
    height: el.h,
  };
}

export function rectsIntersect(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function rectFromPoints(x1, y1, x2, y2) {
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    right: Math.max(x1, x2),
    bottom: Math.max(y1, y2),
  };
}

/**
 * Computes alignment guide candidates between a moving element's bounds and
 * sibling bounds. Returns matched guides (screen-space page coords) plus a
 * suggested snap delta {dx, dy}.
 */
export function computeAlignmentGuides(movingBounds, siblingBoundsList, threshold = 6) {
  const vTargets = []; // {value, type}
  const hTargets = [];

  const mv = movingBounds;
  const movingXs = [
    { v: mv.left, edge: "left" },
    { v: mv.centerX, edge: "centerX" },
    { v: mv.right, edge: "right" },
  ];
  const movingYs = [
    { v: mv.top, edge: "top" },
    { v: mv.centerY, edge: "centerY" },
    { v: mv.bottom, edge: "bottom" },
  ];

  let bestDx = null;
  let bestDy = null;
  const matchedV = [];
  const matchedH = [];

  siblingBoundsList.forEach((sb) => {
    const sxs = [sb.left, sb.centerX, sb.right];
    const sys = [sb.top, sb.centerY, sb.bottom];

    movingXs.forEach((mx) => {
      sxs.forEach((sx) => {
        const diff = sx - mx.v;
        if (Math.abs(diff) <= threshold) {
          if (bestDx === null || Math.abs(diff) < Math.abs(bestDx)) bestDx = diff;
          matchedV.push({ value: sx, from: Math.min(sb.top, mv.top), to: Math.max(sb.bottom, mv.bottom) });
        }
      });
    });

    movingYs.forEach((my) => {
      sys.forEach((sy) => {
        const diff = sy - my.v;
        if (Math.abs(diff) <= threshold) {
          if (bestDy === null || Math.abs(diff) < Math.abs(bestDy)) bestDy = diff;
          matchedH.push({ value: sy, from: Math.min(sb.left, mv.left), to: Math.max(sb.right, mv.right) });
        }
      });
    });
  });

  return {
    dx: bestDx || 0,
    dy: bestDy || 0,
    vGuides: matchedV,
    hGuides: matchedH,
  };
}

function overlapArea(a, b) {
  const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return w * h;
}

/**
 * Nudges a proposed top-left placement diagonally (cascading, like PowerPoint's
 * repeated-paste offset) until it doesn't heavily overlap an existing element,
 * so repeated quick-adds don't stack exactly on top of each other and become
 * impossible to select individually.
 */
export function findNonOverlappingPosition(existingElements, x, y, w, h, canvasW, canvasH) {
  const step = 26;
  let px = x;
  let py = y;
  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = { left: px, top: py, right: px + w, bottom: py + h };
    const collides = existingElements.some((el) => {
      if (el.hidden) return false;
      const eb = { left: el.x, top: el.y, right: el.x + el.w, bottom: el.y + el.h };
      return overlapArea(candidate, eb) > 0.35 * w * h;
    });
    if (!collides) return { x: Math.round(px), y: Math.round(py) };
    px += step;
    py += step;
    if (canvasW && px + w > canvasW - 10) px = 20;
    if (canvasH && py + h > canvasH - 10) py = 20;
  }
  return { x: Math.round(px), y: Math.round(py) };
}

/**
 * Keeps a box fully inside [0,0,boundsW,boundsH] — shrinking it first if it's
 * larger than the canvas, then sliding it back on-page. Used everywhere an
 * element's position/size can change (drag, resize, generate, property-panel
 * edits) so nothing can ever end up partially or fully outside the page.
 */
export function clampToBounds(x, y, w, h, boundsW, boundsH) {
  const cw = Math.min(w, boundsW);
  const ch = Math.min(h, boundsH);
  const cx = Math.max(0, Math.min(x, boundsW - cw));
  const cy = Math.max(0, Math.min(y, boundsH - ch));
  return { x: cx, y: cy, w: cw, h: ch };
}

export function normalizeRect(rect) {
  return {
    x: Math.min(rect.x1, rect.x2),
    y: Math.min(rect.y1, rect.y2),
    w: Math.abs(rect.x2 - rect.x1),
    h: Math.abs(rect.y2 - rect.y1),
  };
}
