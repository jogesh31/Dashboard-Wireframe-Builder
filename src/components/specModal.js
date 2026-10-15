// "Logic & description" for a visual, opened from the fx button on it.
// Two separate free-text tabs: Logic (formulas / DAX / calculation rules,
// shown in a monospace font) and Description (plain-language explanation),
// plus a status: Draft → Confirmed by client → Built. Hovering the button
// shows both as a read-only preview card. Saved on the visual in the .wfd file.

import { store } from "../store.js";
import { UI } from "../uiIcons.js";
import { h, escapeHtml, formatTime } from "../utils/dom.js";
import { getVisualDef } from "../visualLibrary.js";
import { showToast } from "./toast.js";

export const SPEC_STATUSES = [
  { id: "draft", label: "Draft" },
  { id: "confirmed", label: "Confirmed by client" },
  { id: "built", label: "Built" },
];

// Logic saved by the earlier structured form becomes plain text.
function legacyLogicText(logic) {
  if (!logic) return "";
  const lines = [];
  if (logic.question) lines.push(`Question: ${logic.question}`);
  (logic.measures || []).forEach((m) => {
    if (!(m.name || m.formula)) return;
    lines.push(`${m.name || "Measure"} =${m.formula ? ` ${m.formula}` : ""}${m.format ? `   (${m.format})` : ""}`);
  });
  [["dimensions", "Dimensions"], ["filters", "Filters"], ["source", "Source"], ["interactions", "Interactions"], ["formatting", "Formatting"], ["notes", "Notes"]].forEach(([k, label]) => {
    if (logic[k]) lines.push(`${label}: ${logic[k]}`);
  });
  return lines.join("\n");
}

export function specTexts(el) {
  const s = el.spec || {};
  return {
    logic: s.logicText !== undefined ? s.logicText : legacyLogicText(s.logic),
    description: s.description || "",
    status: s.status || "draft",
  };
}

/** none | draft | confirmed | built — drives the colour of the button on the visual. */
export function specState(el) {
  const t = specTexts(el);
  if (!t.logic.trim() && !t.description.trim()) return "none";
  return t.status;
}

function visualTitle(el) {
  const def = getVisualDef(el.type);
  return el.content?.title || el.content?.category || el.name || def?.label || el.type;
}

export function openSpecModal(elId, startTab = "logic") {
  hideSpecPreview();
  const found = store.findElementAnyPage(elId);
  if (!found) return;
  const el = found.el;
  const def = getVisualDef(el.type);
  const draft = specTexts(el);
  let tab = startTab;
  let dirty = false;

  const overlay = h("div", { class: "modal-overlay" });
  const modal = h("div", { class: "modal spec-modal" });
  overlay.appendChild(modal);
  document.getElementById("modal-host").appendChild(overlay);

  const finish = () => { overlay.remove(); document.removeEventListener("keydown", onKey, true); };
  const close = () => { if (dirty && !confirm("Discard your unsaved changes?")) return; finish(); };
  const save = () => {
    store.updateElementSpec(elId, { logicText: draft.logic, description: draft.description, status: draft.status });
    dirty = false;
    finish();
    showToast("Logic and description saved", "success");
  };
  const onKey = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopPropagation(); save(); }
  };
  document.addEventListener("keydown", onKey, true);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });

  const TABS = {
    logic: {
      label: "Logic",
      hint: "Formulas and calculation rules behind this visual — measures, DAX, filters, conditions.",
      placeholder: "On-time % = DIVIDE([On-time orders], [Total orders])\nFilter: Order date = last 12 months\nYoY % = DIVIDE([Sales] - [Sales LY], [Sales LY])",
      cls: "spec-text logic",
    },
    description: {
      label: "Description",
      hint: "Describe what this visual shows, who uses it and how to read it — in plain language for the client and the developer.",
      placeholder: "Shows on-time delivery by supplier for the last 12 months, so procurement can spot suppliers that need a review.",
      cls: "spec-text",
    },
  };

  const render = () => {
    modal.innerHTML = "";
    modal.appendChild(h("div", { class: "modal-header-row" }, [
      h("div", {}, [h("h3", {}, visualTitle(el)), h("div", { class: "spec-sub" }, def?.label || el.type)]),
      h("button", { class: "icon-btn", html: UI.close, onclick: close, "aria-label": "Close" }),
    ]));

    const tabs = h("div", { class: "spec-tabs", role: "tablist" });
    Object.entries(TABS).forEach(([id, t]) => {
      const filled = draft[id].trim() ? " •" : "";
      const b = h("button", { class: `spec-tab${tab === id ? " active" : ""}`, role: "tab", type: "button" }, `${t.label}${filled}`);
      b.addEventListener("click", () => { tab = id; render(); });
      tabs.appendChild(b);
    });
    modal.appendChild(tabs);

    const t = TABS[tab];
    const ta = h("textarea", { class: t.cls, rows: "12", placeholder: t.placeholder, spellcheck: tab === "logic" ? "false" : "true" });
    ta.value = draft[tab];
    ta.addEventListener("input", () => { draft[tab] = ta.value; dirty = true; });
    modal.appendChild(h("div", { class: "spec-body" }, [h("p", { class: "spec-hint" }, t.hint), ta]));
    setTimeout(() => ta.focus(), 0);

    const statusSel = h("select", { class: "spec-status" }, SPEC_STATUSES.map((s) => { const o = h("option", { value: s.id }, s.label); if (s.id === draft.status) o.selected = true; return o; }));
    statusSel.addEventListener("change", () => { draft.status = statusSel.value; dirty = true; });
    const meta = el.spec?.updatedAt ? `Last saved by ${el.spec.updatedBy || "someone"} · ${formatTime(el.spec.updatedAt)}` : "Not saved yet";
    modal.appendChild(h("div", { class: "modal-actions spec-actions" }, [
      h("label", { class: "spec-status-wrap" }, ["Status ", statusSel]),
      h("span", { class: "spec-meta" }, meta),
      h("button", { class: "btn", onclick: close }, "Cancel"),
      h("button", { class: "btn primary", onclick: save }, "Save"),
    ]));
  };
  render();
}

// ---------------- hover preview ----------------

let previewEl = null;

export function showSpecPreview(elId, anchor) {
  hideSpecPreview();
  const el = store.findElementAnyPage(elId)?.el;
  if (!el) return;
  const t = specTexts(el);
  if (!t.logic.trim() && !t.description.trim()) return;
  const status = SPEC_STATUSES.find((s) => s.id === t.status)?.label || "Draft";
  const section = (label, text, cls) => `<div class="sp-section"><div class="sp-label">${label}</div>${text.trim() ? `<div class="sp-text ${cls}">${escapeHtml(text)}</div>` : `<div class="sp-empty">Not written yet</div>`}</div>`;
  previewEl = h("div", { class: "spec-preview", role: "tooltip" });
  previewEl.innerHTML = `
    <div class="sp-head"><span class="sp-title">${escapeHtml(visualTitle(el))}</span><span class="sp-status spec-${escapeHtml(t.status)}">${escapeHtml(status)}</span></div>
    ${section("Logic", t.logic, "logic")}
    ${section("Description", t.description, "")}
    <div class="sp-foot">${el.spec?.updatedAt ? `Last saved by ${escapeHtml(el.spec.updatedBy || "someone")} · ${escapeHtml(formatTime(el.spec.updatedAt))} · ` : ""}Click to edit</div>`;
  document.body.appendChild(previewEl);
  const r = anchor.getBoundingClientRect();
  const pw = previewEl.offsetWidth, ph = previewEl.offsetHeight;
  let left = Math.max(8, Math.min(r.left + r.width / 2 - pw / 2, window.innerWidth - pw - 8));
  let top = r.bottom + 8;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 8);
  previewEl.style.left = `${Math.round(left)}px`;
  previewEl.style.top = `${Math.round(top)}px`;
}

export function hideSpecPreview() {
  previewEl?.remove();
  previewEl = null;
}
