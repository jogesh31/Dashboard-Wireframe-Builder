// Assign picker: a popover listing the project's people (avatar, name, email)
// with search; type a new email to add someone; "Unassign" clears it; and an
// "Email them" switch that opens a ready-to-send message in the user's mail app.

import { h } from "../utils/dom.js";
import { store } from "../store.js";
import { getIdentity, EMAIL_PATTERN, nameFromEmail } from "../wfd/identity.js";
import { knownPeople, rememberPeople } from "../wfd/comments.js";
import { getNotifyPreference, setNotifyPreference } from "../wfd/notify.js";
import { initials } from "./mentionInput.js";

let panel = null;
let cleanup = null;

export function closeAssignPicker() {
  cleanup?.();
  panel?.remove();
  panel = null;
  cleanup = null;
}

/**
 * onPick(person | null, { notify }) — person is { name, email }, or null for Unassign.
 * `current` is the current assignee ({ name, email }) or null.
 */
export function openAssignPicker(anchor, { current = null, onPick, allowNotify = true }) {
  closeAssignPicker();
  const me = getIdentity();
  const people = knownPeople(store.doc, me).filter((p) => p.email);
  // "Me" first, so assigning to yourself is one click.
  people.sort((a, b) => Number(b.email === me.email) - Number(a.email === me.email) || a.name.localeCompare(b.name));

  panel = h("div", { class: "ap-picker", role: "dialog", "aria-label": "Assign to" });
  const search = h("input", { type: "text", class: "ap-search", placeholder: "Search or type an email…", autocomplete: "off" });
  const list = h("div", { class: "ap-list", role: "listbox" });
  const notifyBox = h("input", { type: "checkbox", id: "ap-notify" });
  notifyBox.checked = getNotifyPreference();
  notifyBox.addEventListener("change", () => setNotifyPreference(notifyBox.checked));
  const notifyRow = h("label", { class: "ap-notify", for: "ap-notify" }, [notifyBox, h("span", {}, ["Email them ", h("small", {}, "— opens a message in your mail app")])]);

  panel.appendChild(h("div", { class: "ap-head" }, "Assign to"));
  panel.appendChild(search);
  panel.appendChild(list);
  if (allowNotify) panel.appendChild(notifyRow);

  const pick = (person) => {
    const notify = allowNotify && notifyBox.checked;
    if (person) rememberPeople([person]);
    closeAssignPicker();
    onPick(person, { notify });
  };

  let active = 0;
  let shown = [];
  const render = () => {
    const q = search.value.trim().toLowerCase();
    list.innerHTML = "";
    shown = people.filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
    shown.forEach((p, i) => {
      const isCurrent = current?.email && p.email.toLowerCase() === current.email.toLowerCase();
      const row = h("button", { type: "button", class: `ap-row${i === active ? " active" : ""}${isCurrent ? " current" : ""}`, role: "option" }, [
        h("span", { class: "ap-avatar" }, initials(p.name)),
        h("span", { class: "ap-text" }, [h("span", { class: "ap-name" }, [p.name, p.email === me.email ? h("span", { class: "ap-you" }, " (you)") : null]), h("span", { class: "ap-email" }, p.email)]),
        isCurrent ? h("span", { class: "ap-check" }, "✓") : null,
      ]);
      row.addEventListener("click", () => pick(p));
      row.addEventListener("mouseenter", () => { active = i; list.querySelectorAll(".ap-row").forEach((r, k) => r.classList.toggle("active", k === i)); });
      list.appendChild(row);
    });
    // Typed an email that isn't in the list yet: offer to add and assign them.
    const typed = search.value.trim();
    if (EMAIL_PATTERN.test(typed) && !people.some((p) => p.email.toLowerCase() === typed.toLowerCase())) {
      const row = h("button", { type: "button", class: "ap-row ap-new" }, [h("span", { class: "ap-avatar plus" }, "+"), h("span", { class: "ap-text" }, [h("span", { class: "ap-name" }, `Assign to ${typed}`), h("span", { class: "ap-email" }, "Adds them to this project's members")])]);
      row.addEventListener("click", () => pick({ name: nameFromEmail(typed), email: typed.toLowerCase() }));
      list.appendChild(row);
    } else if (!shown.length) {
      list.appendChild(h("div", { class: "ap-empty" }, q ? "No match — type a full email address to add someone." : "No one in this project yet — type an email address."));
    }
    if (current?.name) {
      const un = h("button", { type: "button", class: "ap-unassign" }, `Unassign ${current.name}`);
      un.addEventListener("click", () => pick(null));
      list.appendChild(un);
    }
  };
  search.addEventListener("input", () => { active = 0; render(); });
  search.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (shown.length) active = (active + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length;
      render();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const typed = search.value.trim();
      if (shown[active] && (!EMAIL_PATTERN.test(typed) || shown.length)) pick(shown[active]);
      else if (EMAIL_PATTERN.test(typed)) pick({ name: nameFromEmail(typed), email: typed.toLowerCase() });
    }
  });
  render();

  document.body.appendChild(panel);
  const r = anchor.getBoundingClientRect();
  const pw = panel.offsetWidth, ph = panel.offsetHeight;
  const left = Math.min(window.innerWidth - pw - 8, Math.max(8, r.right - pw));
  let top = r.bottom + 6;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
  search.focus({ preventScroll: true });

  const onDown = (e) => { if (!panel.contains(e.target) && !anchor.contains(e.target)) closeAssignPicker(); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); closeAssignPicker(); } };
  setTimeout(() => {
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
  cleanup = () => {
    document.removeEventListener("mousedown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
  };
}
