import { store } from "../store.js";
import { UI } from "../uiIcons.js";
import { h, escapeHtml, formatTime, debounce } from "../utils/dom.js";
import { getIdentity } from "../wfd/identity.js";
import {
  COMMENT_STATUSES, COMMENT_TYPES, DEFAULT_COMMENT_TYPE,
  statusOf, statusLabel, typeLabel, isOpen, involvesMe, isMine, knownPeople, renderCommentText, personLabel,
} from "../wfd/comments.js";
import { attachMentionAutocomplete, initials } from "./mentionInput.js";
import { showToast } from "./toast.js";
import { openAssignPicker } from "./assignPicker.js";
import { emailAssignee } from "../wfd/notify.js";

// ---------------- review panel state ----------------
// scope: "visual" (the selected visual), "page", or "all" (every page).
// Filters are remembered on this computer.

const FILTER_KEY = "wfd-comment-filters";
const filters = loadFilters();
let scope = "page";
let panelEl;
const drafts = new Map(); // draft key -> text, so typing survives re-renders
const openReplyBoxes = new Set(); // comment ids with the reply box open
const openPopovers = new Map(); // elId -> { pop } — several sticky notes can be open at once
let hoverPreviewEl = null;
let hoverPreviewTimer = null;

function loadFilters() {
  const defaults = { status: "active", type: "all", person: "anyone" };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(FILTER_KEY) || "{}") };
  } catch (err) {
    return defaults;
  }
}

function saveFilters() {
  try {
    localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
  } catch (err) { /* ignore */ }
}

function people() {
  return knownPeople(store.doc, getIdentity());
}

export function initCommentsPanel() {
  panelEl = document.getElementById("comments-panel");
  const rerender = debounce(() => { renderPanel(); refreshPopovers(); }, 120);

  store.on("selection:change", () => {
    const sel = store.selection;
    if (sel.length === 1) scope = "visual";
    else if (scope === "visual") scope = "page";
    renderPanel();
  });
  store.on("comments:change", () => { renderPanel(); refreshPopovers(); });
  store.on("elements:change", rerender);
  store.on("pages:change", rerender);
  store.on("doc:change", rerender);
  store.on("page:switch", () => {
    renderPanel();
    closeAllPopovers(); // notes are anchored to visuals on the page you just left
  });
  window.addEventListener("wfd:open-comments", (e) => openPopover(e.detail.elId));
  window.addEventListener("wfd:show-my-comments", () => {
    scope = "all";
    Object.assign(filters, { status: "active", type: "all", person: "me" });
    saveFilters();
    store.setRightTab?.("comments");
    document.querySelector('#right-tabs .tab[data-tab="comments"]')?.click();
    renderPanel();
  });
  setupHoverPreview();
  renderPanel();
}

// ---------------- panel ----------------

function matchesFilters(c) {
  const status = statusOf(c);
  if (filters.status === "active" && status === "done") return false;
  if (!["active", "all"].includes(filters.status) && status !== filters.status) return false;
  if (filters.type !== "all" && (c.type || "") !== filters.type) return false;
  const me = getIdentity();
  if (filters.person === "me" && !involvesMe(c, me)) return false;
  if (filters.person === "mine" && !isMine(c, me)) return false;
  if (filters.person === "unassigned" && c.assignee) return false;
  if (filters.person.startsWith("assignee:")) {
    const key = filters.person.slice(9);
    if (!c.assignee || assigneeKey(c) !== key) return false;
  }
  return true;
}

// Assignee filter key: the email when known, otherwise the name.
function assigneeKey(c) {
  return (c.assigneeEmail || c.assignee || "").toLowerCase();
}

function renderPanel() {
  if (!panelEl) return;
  const focus = captureFocus(panelEl);
  panelEl.innerHTML = "";

  const selected = store.getSelectedElements();
  const target = scope === "visual" && selected.length === 1 ? selected[0] : null;
  if (scope === "visual" && !target) scope = "page";

  panelEl.appendChild(renderToolbar(target));

  let entries;
  if (target) {
    const page = store.getCurrentPage();
    entries = (target.comments || []).map((c) => ({ comment: c, elId: target.id, elName: target.name, pageId: page.id, pageName: page.name }));
    entries.sort((a, b) => a.comment.createdAt - b.comment.createdAt);
  } else {
    entries = store.getAllComments(scope);
  }
  const total = entries.length;
  const shown = entries.filter((e) => matchesFilters(e.comment));
  const openCount = entries.filter((e) => isOpen(e.comment)).length;

  panelEl.appendChild(
    h("div", { class: "cm-count" }, total ? `${shown.length} of ${total} shown · ${openCount} open` : "")
  );

  const list = h("div", { class: "comment-list" });
  if (!shown.length) {
    list.appendChild(h("div", { class: "empty-state" }, emptyMessage(target, total)));
  }
  shown.forEach((entry) => list.appendChild(renderCommentCard(entry, { showWhere: !target })));
  panelEl.appendChild(list);

  if (target) panelEl.appendChild(renderComposer(target.id, "panel"));
  restoreFocus(panelEl, focus);
}

function emptyMessage(target, total) {
  if (total) return "No comments match these filters.";
  if (target) return "No comments on this visual yet. Add the first one below.";
  return "No comments yet. Select a visual to comment on it, or use the comment tool (C) and click a visual.";
}

function renderToolbar(target) {
  const bar = h("div", { class: "cm-toolbar" });

  const scopes = [
    { id: "visual", label: "This visual", disabled: store.selection.length !== 1 },
    { id: "page", label: "This page" },
    { id: "all", label: "All pages" },
  ];
  const seg = h("div", { class: "cm-scope", role: "tablist" });
  scopes.forEach((s) => {
    const btn = h("button", { class: `cm-scope-btn${scope === s.id ? " active" : ""}`, disabled: s.disabled || null, "data-tip": s.disabled ? "Select one visual first" : null }, s.label);
    btn.addEventListener("click", () => { scope = s.id; renderPanel(); });
    seg.appendChild(btn);
  });
  bar.appendChild(seg);

  if (target) {
    bar.appendChild(h("div", { class: "cm-target" }, ["On ", h("strong", {}, target.name || target.type)]));
  }

  const statusSel = select(
    [{ v: "active", l: "Open + in progress" }, ...COMMENT_STATUSES.map((s) => ({ v: s.id, l: s.label })), { v: "all", l: "All statuses" }],
    filters.status,
    (v) => { filters.status = v; saveFilters(); renderPanel(); }
  );
  const typeSel = select(
    [{ v: "all", l: "All types" }, ...COMMENT_TYPES.map((t) => ({ v: t.id, l: t.label })), { v: "", l: "No type" }],
    filters.type,
    (v) => { filters.type = v; saveFilters(); renderPanel(); }
  );
  const assignees = new Map();
  store.getAllComments("all").forEach(({ comment: c }) => { if (c.assignee) assignees.set(assigneeKey(c), c.assignee); });
  const personSel = select(
    [
      { v: "anyone", l: "Anyone" },
      { v: "me", l: "For me (assigned / @mentioned)" },
      { v: "mine", l: "Written by me" },
      { v: "unassigned", l: "Unassigned" },
      ...[...assignees.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([key, name]) => ({ v: `assignee:${key}`, l: `Assigned to ${name}` })),
    ],
    filters.person,
    (v) => { filters.person = v; saveFilters(); renderPanel(); }
  );
  bar.appendChild(h("div", { class: "cm-filters" }, [statusSel, typeSel, personSel]));
  return bar;
}

function select(options, value, onChange, cls = "cm-select") {
  const sel = h("select", { class: cls });
  if (!options.some((o) => o.v === value)) options = [...options, { v: value, l: value.replace(/^assignee:/, "Assigned to ") }];
  options.forEach((o) => {
    const opt = h("option", { value: o.v }, o.l);
    if (o.v === value) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", () => onChange(sel.value));
  return sel;
}

// ---------------- comment card ----------------

function renderCommentCard({ comment: c, elId, elName, pageId, pageName }, { showWhere }) {
  const status = statusOf(c);
  const me = getIdentity();
  const card = h("div", { class: `comment-card status-${status}${involvesMe(c, me) ? " for-me" : ""}`, "data-comment-id": c.id });

  // status · type · assignee
  const head = h("div", { class: "cc-head" });
  head.appendChild(
    select(COMMENT_STATUSES.map((s) => ({ v: s.id, l: s.label })), status, (v) => store.updateComment(elId, c.id, { status: v }), `cc-status status-${status}`)
  );
  head.appendChild(
    select([{ v: "", l: "No type" }, ...COMMENT_TYPES.map((t) => ({ v: t.id, l: t.label }))], c.type || "", (v) => store.updateComment(elId, c.id, { type: v }), `cc-type${c.type ? ` type-${c.type}` : ""}`)
  );
  head.appendChild(renderAssignee(elId, c));
  card.appendChild(head);

  // author + time
  card.appendChild(
    h("div", { class: "cc-meta" }, [
      h("span", { class: "cc-avatar", title: c.authorEmail || null }, initials(c.author)),
      h("span", { class: "cc-author", title: c.authorEmail || null }, c.author || "Someone"),
      h("span", { class: "cc-time", title: new Date(c.createdAt).toLocaleString() }, formatTime(c.createdAt)),
    ])
  );

  if (showWhere) {
    const where = h("button", { class: "cc-where", "data-tip": "Go to this visual" }, [`on ${elName}`, pageName ? ` · ${pageName}` : ""]);
    where.addEventListener("click", () => goToComment(elId, pageId));
    card.appendChild(where);
  }

  const textEl = h("div", { class: "cc-text", html: renderCommentText(c.text, c.mentions) });
  card.appendChild(textEl);

  // replies
  if (c.replies?.length) {
    const replies = h("div", { class: "cc-replies" });
    c.replies.forEach((r) => {
      const row = h("div", { class: "cc-reply" }, [
        h("div", { class: "cc-meta" }, [
          h("span", { class: "cc-avatar sm", title: r.authorEmail || null }, initials(r.author)),
          h("span", { class: "cc-author", title: r.authorEmail || null }, r.author || "Someone"),
          h("span", { class: "cc-time", title: new Date(r.createdAt).toLocaleString() }, formatTime(r.createdAt)),
        ]),
        h("div", { class: "cc-text", html: renderCommentText(r.text, r.mentions) }),
      ]);
      if (isMine(r, me)) {
        const del = h("button", { class: "cc-reply-del", "data-tip": "Delete your reply", html: UI.close });
        del.addEventListener("click", () => { if (confirm("Delete your reply?")) store.deleteReply(elId, c.id, r.id); });
        row.appendChild(del);
      }
      replies.appendChild(row);
    });
    card.appendChild(replies);
  }

  // actions
  const actions = h("div", { class: "cc-actions" });
  const replyBtn = h("button", {}, "Reply");
  replyBtn.addEventListener("click", () => {
    if (openReplyBoxes.has(c.id)) openReplyBoxes.delete(c.id);
    else openReplyBoxes.add(c.id);
    renderPanel();
    refreshPopovers();
    document.querySelector(`[data-draft="reply:${c.id}"]`)?.focus();
  });
  actions.appendChild(replyBtn);
  if (status !== "done") {
    const doneBtn = h("button", {}, "Mark done");
    doneBtn.addEventListener("click", () => store.updateComment(elId, c.id, { status: "done" }));
    actions.appendChild(doneBtn);
  } else {
    const reopenBtn = h("button", {}, "Reopen");
    reopenBtn.addEventListener("click", () => store.updateComment(elId, c.id, { status: "open" }));
    actions.appendChild(reopenBtn);
  }
  const editBtn = h("button", {}, "Edit");
  editBtn.addEventListener("click", () => startEdit(textEl, elId, c));
  actions.appendChild(editBtn);
  const delBtn = h("button", { class: "danger" }, "Delete");
  delBtn.addEventListener("click", () => {
    const replies = c.replies?.length ? ` and its ${c.replies.length} repl${c.replies.length === 1 ? "y" : "ies"}` : "";
    if (confirm(`Delete this comment${replies}?`)) store.deleteComment(elId, c.id);
  });
  actions.appendChild(delBtn);
  card.appendChild(actions);

  if (openReplyBoxes.has(c.id)) card.appendChild(renderReplyBox(elId, c));
  return card;
}

const ASSIGN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/></svg>`;
const CHEVRON = `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;

function currentAssigneeLabel(c) {
  return c.assignee ? personLabel({ name: c.assignee, email: c.assigneeEmail }) : "";
}

// The assign button: shows who it's assigned to (avatar + first name) or an
// "Assign" button; clicking opens the picker (people list, search, add by email).
function assignButton({ name, email }, onPick, label = "Assign") {
  const has = !!name;
  const btn = h("button", { type: "button", class: `assign-btn${has ? " assigned" : ""}`, "aria-haspopup": "dialog", "data-tip": has ? `Assigned to ${personLabel({ name, email })} — click to change` : "Assign this to someone" });
  btn.innerHTML = has
    ? `<span class="assign-avatar">${escapeHtml(initials(name))}</span><span class="assign-name">${escapeHtml(name)}</span>${CHEVRON}`
    : `${ASSIGN_ICON}<span>${escapeHtml(label)}</span>${CHEVRON}`;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    openAssignPicker(btn, { current: has ? { name, email } : null, onPick });
  });
  return btn;
}

function renderAssignee(elId, c) {
  const wrap = h("div", { class: "cc-assignee" });
  wrap.appendChild(
    assignButton({ name: c.assignee, email: c.assigneeEmail }, (person, { notify }) => {
      const same = person && c.assigneeEmail && person.email.toLowerCase() === c.assigneeEmail.toLowerCase();
      if (same) return;
      store.updateComment(elId, c.id, { assignee: person });
      if (person && notify) emailAssignee({ person, elId, commentText: c.text, type: typeLabel(c.type) });
    })
  );
  return wrap;
}

function startEdit(textEl, elId, c) {
  const ta = h("textarea", { class: "cc-edit", rows: "3" });
  ta.value = c.text;
  attachMentionAutocomplete(ta, people);
  textEl.replaceWith(ta);
  ta.focus();
  let done = false;
  const save = () => {
    if (done) return;
    done = true;
    const val = ta.value.trim();
    if (val && val !== c.text) store.updateComment(elId, c.id, { text: val });
    else renderPanel();
  };
  ta.addEventListener("blur", save);
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ta.blur(); }
    if (e.key === "Escape") { done = true; renderPanel(); refreshPopovers(); }
  });
}

function renderReplyBox(elId, c) {
  const key = `reply:${c.id}`;
  const wrap = h("div", { class: "cc-reply-box" });
  const ta = h("textarea", { rows: "2", placeholder: "Reply… type @ to mention someone", "data-draft": key });
  ta.value = drafts.get(key) || "";
  ta.addEventListener("input", () => drafts.set(key, ta.value));
  attachMentionAutocomplete(ta, people);
  const send = h("button", { class: "btn primary sm" }, "Reply");
  const cancel = h("button", { class: "btn sm" }, "Cancel");
  const submit = () => {
    if (!ta.value.trim()) return;
    drafts.delete(key);
    openReplyBoxes.delete(c.id);
    store.addReply(elId, c.id, ta.value);
  };
  send.addEventListener("click", submit);
  cancel.addEventListener("click", () => { drafts.delete(key); openReplyBoxes.delete(c.id); renderPanel(); refreshPopovers(); });
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } });
  wrap.appendChild(ta);
  wrap.appendChild(h("div", { class: "cc-reply-actions" }, [h("span", { class: "cc-hint" }, "Ctrl+Enter to send"), cancel, send]));
  return wrap;
}

// ---------------- new comment composer ----------------

function renderComposer(elId, where) {
  const key = `new:${where}:${elId}`;
  const draft = drafts.get(key) || { text: "", type: DEFAULT_COMMENT_TYPE, assignee: null };
  const wrap = h("div", { class: "comment-composer" });

  const ta = h("textarea", { placeholder: "Add a comment… type @ to mention someone", rows: "3", "data-draft": key });
  ta.value = draft.text;
  attachMentionAutocomplete(ta, people);

  const typeSel = select(COMMENT_TYPES.map((t) => ({ v: t.id, l: t.label })).concat([{ v: "", l: "No type" }]), draft.type, (v) => { draft.type = v; drafts.set(key, draft); }, "cm-select");
  const error = h("div", { class: "cm-error" });
  const btn = h("button", { class: "btn primary sm" }, "Comment");
  // The chosen assignee ({ name, email }) lives on the draft so it survives re-renders.
  const assigneeHost = h("div", { class: "cm-assignee-host" });
  let notifyOnPost = false;
  const drawAssign = () => {
    assigneeHost.innerHTML = "";
    assigneeHost.appendChild(assignButton(draft.assignee || { name: "", email: "" }, (person, { notify }) => {
      draft.assignee = person;
      notifyOnPost = !!(person && notify);
      drafts.set(key, draft);
      drawAssign();
    }, "Assign to…"));
  };
  drawAssign();

  const sync = () => { draft.text = ta.value; drafts.set(key, draft); error.textContent = ""; };
  ta.addEventListener("input", sync);

  const submit = () => {
    if (!ta.value.trim()) { ta.focus(); return; }
    const person = draft.assignee && draft.assignee.name ? draft.assignee : null;
    drafts.delete(key);
    const created = store.addComment(elId, { text: ta.value, type: draft.type, assignee: person });
    if (created && person && notifyOnPost) emailAssignee({ person, elId, commentText: created.text, type: typeLabel(created.type) });
  };
  btn.addEventListener("click", submit);
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } });

  wrap.appendChild(ta);
  wrap.appendChild(h("div", { class: "cm-composer-row" }, [typeSel, assigneeHost]));
  wrap.appendChild(error);
  wrap.appendChild(h("div", { class: "cm-composer-row end" }, [h("span", { class: "cc-hint" }, "Ctrl+Enter to post"), btn]));
  return wrap;
}

// Keeps the caret where it was when the panel re-renders under the user.
function captureFocus(root) {
  const a = document.activeElement;
  if (!a || !root.contains(a) || !a.dataset?.draft) return null;
  return { key: a.dataset.draft, start: a.selectionStart, end: a.selectionEnd };
}

function restoreFocus(root, focus) {
  if (!focus) return;
  const el = root.querySelector(`[data-draft="${CSS.escape(focus.key)}"]`);
  if (!el) return;
  el.focus();
  try { el.setSelectionRange(focus.start, focus.end); } catch (err) { /* ignore */ }
}

function goToComment(elId, pageId) {
  if (pageId && pageId !== store.doc.currentPageId) store.setCurrentPage(pageId);
  store.setSelection([elId]);
  document.getElementById(`el-${elId}`)?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
}

// ---------------- hover preview on canvas badges ----------------

function setupHoverPreview() {
  document.addEventListener("mouseover", (e) => {
    const badge = e.target.closest(".comment-badge");
    if (!badge || badge.classList.contains("empty")) return;
    const elId = badge.closest(".el")?.dataset.id;
    if (elId && openPopovers.has(elId)) return;
    clearTimeout(hoverPreviewTimer);
    hoverPreviewTimer = setTimeout(() => showHoverPreview(badge), 150);
  });
  document.addEventListener("mouseout", (e) => {
    if (!e.target.closest(".comment-badge")) return;
    clearTimeout(hoverPreviewTimer);
    hideHoverPreview();
  });
}

function showHoverPreview(badge) {
  hideHoverPreview();
  const elId = badge.closest(".el")?.dataset.id;
  const el = elId && store.getElement(elId);
  const comments = (el?.comments || []).slice().sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || b.createdAt - a.createdAt);
  if (!comments.length) return;
  const shown = comments.slice(0, 3);
  const preview = h("div", { class: "comment-hover-preview" });
  preview.innerHTML = shown
    .map((c) => {
      const tags = [statusLabel(statusOf(c)), typeLabel(c.type), c.assignee ? `→ ${c.assignee}` : ""].filter(Boolean).join(" · ");
      const text = c.text.length > 120 ? `${c.text.slice(0, 120)}…` : c.text;
      const replies = c.replies?.length ? ` <span class="chp-replies">(${c.replies.length} repl${c.replies.length === 1 ? "y" : "ies"})</span>` : "";
      return `<div class="chp-item"><div class="chp-tags">${escapeHtml(tags)}</div><span class="chp-author">${escapeHtml(c.author)}:</span> ${escapeHtml(text)}${replies}</div>`;
    })
    .join("");
  if (comments.length > shown.length) preview.innerHTML += `<div class="chp-more">+${comments.length - shown.length} more — click to view</div>`;
  document.body.appendChild(preview);
  const rect = badge.getBoundingClientRect();
  const top = Math.min(window.innerHeight - preview.offsetHeight - 10, rect.bottom + 6);
  const left = Math.min(window.innerWidth - preview.offsetWidth - 10, Math.max(6, rect.left - preview.offsetWidth / 2 + rect.width / 2));
  preview.style.top = `${Math.max(6, top)}px`;
  preview.style.left = `${left}px`;
  hoverPreviewEl = preview;
}

function hideHoverPreview() {
  hoverPreviewEl?.remove();
  hoverPreviewEl = null;
}

// ---------------- sticky-note popovers on the canvas ----------------
// Click a comment badge: a draggable note with that visual's full thread.
// Several can be open; pinned ones collapse to a one-line summary and stay put.

let zCounter = 4000;

function openPopover(elId) {
  clearTimeout(hoverPreviewTimer);
  hideHoverPreview();
  store.setSelection([elId]);

  const existing = openPopovers.get(elId);
  if (existing) { bringToFront(existing.pop); return; }

  const node = document.getElementById(`el-${elId}`);
  if (!node) return;
  const rect = node.getBoundingClientRect();

  const pop = h("div", { class: "comment-popover" });
  pop.innerHTML = `
    <div class="comment-popover-header" data-role="drag-handle">
      <span>Comments</span>
      <div class="row" style="gap:2px">
        <button class="icon-btn sm" data-action="pin" data-tip="Pin — collapse to a short note">${UI.pin}</button>
        <button class="icon-btn sm" data-action="close" data-tip="Close">${UI.close}</button>
      </div>
    </div>
    <div class="comment-list" data-role="thread"></div>
    <div data-role="composer"></div>
    <div class="comment-popover-compact" data-role="compact-preview"></div>`;
  document.body.appendChild(pop);
  openPopovers.set(elId, { pop });
  fillPopover(pop, elId);

  const top = Math.min(window.innerHeight - pop.offsetHeight - 12, rect.bottom + 8);
  const left = Math.min(window.innerWidth - 340, rect.left);
  pop.style.top = `${Math.max(8, top)}px`;
  pop.style.left = `${Math.max(8, left)}px`;

  pop.querySelector('[data-action="close"]').addEventListener("click", () => closePopover(elId));
  const pinBtn = pop.querySelector('[data-action="pin"]');
  pinBtn.addEventListener("click", () => {
    const pinned = pop.classList.toggle("pinned");
    pinBtn.innerHTML = pinned ? UI.pinFilled : UI.pin;
    pinBtn.classList.toggle("active", pinned);
    pinBtn.setAttribute("data-tip", pinned ? "Unpin — show the full thread" : "Pin — collapse to a short note");
    if (pinned) updateCompactPreview(pop, elId);
  });
  pop.querySelector('[data-role="compact-preview"]').addEventListener("click", () => {
    pop.classList.remove("pinned");
    pinBtn.innerHTML = UI.pin;
    pinBtn.classList.remove("active");
  });
  pop.addEventListener("pointerdown", () => bringToFront(pop));
  makeDraggable(pop, pop.querySelector('[data-role="drag-handle"]'));
  bringToFront(pop);

  if (openPopovers.size === 1) setTimeout(() => document.addEventListener("mousedown", onOutsideClick), 0);
  pop.querySelector('[data-role="composer"] textarea')?.focus();
}

function fillPopover(pop, elId) {
  const el = store.findElementAnyPage(elId)?.el;
  const thread = pop.querySelector('[data-role="thread"]');
  const focus = captureFocus(pop);
  thread.innerHTML = "";
  const comments = (el?.comments || []).slice().sort((a, b) => a.createdAt - b.createdAt);
  if (!comments.length) thread.appendChild(h("div", { class: "empty-state" }, "No comments on this visual yet."));
  comments.forEach((c) => thread.appendChild(renderCommentCard({ comment: c, elId }, { showWhere: false })));
  const composerHost = pop.querySelector('[data-role="composer"]');
  composerHost.innerHTML = "";
  composerHost.appendChild(renderComposer(elId, "popover"));
  if (pop.classList.contains("pinned")) updateCompactPreview(pop, elId);
  restoreFocus(pop, focus);
}

function refreshPopovers() {
  openPopovers.forEach(({ pop }, elId) => {
    if (!store.findElementAnyPage(elId)) closePopover(elId);
    else fillPopover(pop, elId);
  });
}

function updateCompactPreview(pop, elId) {
  const compact = pop.querySelector('[data-role="compact-preview"]');
  const comments = store.findElementAnyPage(elId)?.el.comments || [];
  if (!comments.length) { compact.textContent = "No comments yet — click to open"; return; }
  const open = comments.filter(isOpen).length;
  const latest = comments.slice().sort((a, b) => b.createdAt - a.createdAt)[0];
  compact.innerHTML = `<span class="cpc-author">${escapeHtml(latest.author)}:</span> ${escapeHtml(latest.text)} <span class="cpc-count">(${open} open of ${comments.length})</span>`;
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
      pop.style.left = `${Math.max(0, Math.min(window.innerWidth - 60, startLeft + ev.clientX - startX))}px`;
      pop.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, startTop + ev.clientY - startY))}px`;
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
  if (e.target.closest(".comment-badge, .mention-menu")) return;
  openPopovers.forEach(({ pop }, elId) => {
    if (!pop.classList.contains("pinned") && !pop.contains(e.target)) closePopover(elId);
  });
}

function closePopover(elId) {
  const entry = openPopovers.get(elId);
  if (!entry) return;
  entry.pop.remove();
  openPopovers.delete(elId);
  if (!openPopovers.size) document.removeEventListener("mousedown", onOutsideClick);
}

function closeAllPopovers() {
  [...openPopovers.keys()].forEach(closePopover);
}
