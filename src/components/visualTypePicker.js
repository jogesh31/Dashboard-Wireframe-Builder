// The "change visual type" picker opened from the button on a visual —
// like Power BI's Visualizations pane: a grid of visual icons, grouped, with
// search. Picking one converts the visual in place.

import { store } from "../store.js";
import { groupedCatalog, getVisualDef } from "../visualLibrary.js";
import { buildGlyph } from "../visualIcons.js";
import { h } from "../utils/dom.js";
import { showToast } from "./toast.js";

// Data visuals can switch between each other; text, images and shapes can't.
export const SWITCHABLE_FAMILIES = new Set(["chart", "cardstat", "table", "map", "filter"]);

let panel = null;
let cleanup = null;

export function closeVisualTypePicker() {
  cleanup?.();
  panel?.remove();
  panel = null;
  cleanup = null;
}

export function openVisualTypePicker(elId, anchor) {
  closeVisualTypePicker();
  const el = store.findElementAnyPage(elId)?.el;
  if (!el) return;

  panel = h("div", { class: "vt-picker", role: "dialog", "aria-label": "Change visual type" });
  const search = h("input", { type: "search", class: "vt-search", placeholder: "Search visuals…" });
  const body = h("div", { class: "vt-body" });
  panel.appendChild(h("div", { class: "vt-head" }, [h("span", { class: "vt-title" }, "Change visual type"), h("span", { class: "vt-current" }, getVisualDef(el.type)?.label || el.type)]));
  panel.appendChild(search);
  panel.appendChild(body);

  const render = () => {
    const q = search.value.trim().toLowerCase();
    body.innerHTML = "";
    let any = false;
    groupedCatalog().forEach((items, group) => {
      const list = items.filter((d) => SWITCHABLE_FAMILIES.has(d.family) && (!q || d.label.toLowerCase().includes(q) || group.toLowerCase().includes(q)));
      if (!list.length) return;
      any = true;
      body.appendChild(h("div", { class: "vt-group" }, group));
      const grid = h("div", { class: "vt-grid" });
      list.forEach((d) => {
        const tile = h("button", { class: `vt-tile${d.type === el.type ? " current" : ""}`, type: "button", "data-tip": d.label, "aria-label": d.label, html: buildGlyph(d.iconKind, d.type) });
        tile.addEventListener("click", () => {
          if (d.type !== el.type && store.changeElementType(elId, d.type)) showToast(`Changed to ${d.label}`, "success");
          closeVisualTypePicker();
        });
        grid.appendChild(tile);
      });
      body.appendChild(grid);
    });
    if (!any) body.appendChild(h("div", { class: "vt-empty" }, "No visuals match"));
  };
  search.addEventListener("input", render);
  render();

  document.body.appendChild(panel);
  const r = anchor.getBoundingClientRect();
  const pw = panel.offsetWidth, ph = panel.offsetHeight;
  let left = Math.min(window.innerWidth - pw - 8, Math.max(8, r.left));
  let top = r.bottom + 6;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
  search.focus({ preventScroll: true });

  const onDown = (e) => { if (!panel.contains(e.target) && !anchor.contains(e.target)) closeVisualTypePicker(); };
  const onKey = (e) => { if (e.key === "Escape") closeVisualTypePicker(); };
  const onScroll = (e) => { if (!panel.contains(e.target)) closeVisualTypePicker(); };
  setTimeout(() => {
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("scroll", onScroll, true);
  }, 0);
  const offPage = store.on("page:switch", closeVisualTypePicker);
  cleanup = () => {
    document.removeEventListener("mousedown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("scroll", onScroll, true);
    offPage();
  };
}
