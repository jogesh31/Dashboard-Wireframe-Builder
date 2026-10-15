// @mention suggestions for a comment textarea: typing "@" (then part of a
// name or email) lists matching people ({ name, email }); ↑/↓ to move,
// Enter or Tab to insert, Esc to close.

import { h } from "../utils/dom.js";

export function attachMentionAutocomplete(textarea, getPeople) {
  let menu = null;
  let items = [];
  let active = 0;
  let range = null;

  const close = () => {
    menu?.remove();
    menu = null;
    items = [];
  };

  const insert = (person) => {
    // Two people with the same name: mention by email so it's unambiguous.
    const sameName = getPeople().filter((p) => p.name.toLowerCase() === person.name.toLowerCase()).length > 1;
    const tag = sameName && person.email ? person.email : person.name;
    const value = textarea.value;
    textarea.value = `${value.slice(0, range.start)}@${tag} ${value.slice(range.end)}`;
    const caret = range.start + tag.length + 2;
    textarea.setSelectionRange(caret, caret);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    close();
    textarea.focus();
  };

  const render = () => {
    if (!menu) {
      menu = h("div", { class: "mention-menu", role: "listbox" });
      document.body.appendChild(menu);
    }
    menu.innerHTML = "";
    items.forEach((person, i) => {
      const opt = h("div", { class: `mention-option${i === active ? " active" : ""}`, role: "option" }, [
        h("span", { class: "mention-avatar" }, initials(person.name)),
        h("span", { class: "mention-text" }, [h("span", { class: "mention-name" }, person.name), person.email ? h("span", { class: "mention-email" }, person.email) : null]),
      ]);
      opt.addEventListener("mousedown", (e) => { e.preventDefault(); insert(person); });
      menu.appendChild(opt);
    });
    const r = textarea.getBoundingClientRect();
    const below = r.bottom + 4;
    const fitsBelow = below + menu.offsetHeight < window.innerHeight - 8;
    menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${fitsBelow ? below : Math.max(8, r.top - menu.offsetHeight - 4)}px`;
  };

  const update = () => {
    const caret = textarea.selectionStart;
    const before = textarea.value.slice(0, caret);
    const m = before.match(/(^|[\s(])@([^@\n]{0,30})$/);
    if (!m) return close();
    const query = m[2].toLowerCase();
    const people = getPeople();
    items = people
      .filter((p) => {
        const name = p.name.toLowerCase();
        return name.startsWith(query) || name.split(/\s+/).some((part) => part.startsWith(query)) || (p.email && p.email.toLowerCase().startsWith(query));
      })
      .slice(0, 6);
    if (!items.length) return close();
    active = Math.min(active, items.length - 1);
    range = { start: caret - m[2].length - 1, end: caret };
    render();
  };

  textarea.addEventListener("input", () => { active = 0; update(); });
  textarea.addEventListener("click", update);
  textarea.addEventListener("blur", () => setTimeout(close, 120));
  textarea.addEventListener("keydown", (e) => {
    if (!menu) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      render();
    } else if ((e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.shiftKey) || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      insert(items[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });
}

export function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
