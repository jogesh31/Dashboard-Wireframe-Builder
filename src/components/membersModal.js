// File ▸ Project Members: everyone who has opened this project (added
// automatically) plus people added by email so work can be assigned to them
// before they've opened it. Stored in the project file.

import { store } from "../store.js";
import { UI } from "../uiIcons.js";
import { h } from "../utils/dom.js";
import { getIdentity, nameFromEmail, EMAIL_PATTERN } from "../wfd/identity.js";
import { initials } from "./mentionInput.js";

export function openMembersModal() {
  const overlay = h("div", { class: "modal-overlay" });
  const modal = h("div", { class: "modal members-modal" });
  overlay.appendChild(modal);
  document.getElementById("modal-host").appendChild(overlay);
  const close = () => { off(); overlay.remove(); };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  const render = () => {
    const me = getIdentity();
    const members = (store.doc.members || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    modal.innerHTML = "";
    const header = h("div", { class: "modal-header-row" }, [h("h3", {}, "Project members"), h("button", { class: "icon-btn", html: UI.close, onclick: close })]);
    modal.appendChild(header);
    modal.appendChild(h("p", { class: "generate-subtitle" }, "Everyone who opens this project is added automatically. Add people by email to assign them work before they've opened it. This list is for assigning and @mentions; who can open the file is set by its OneDrive sharing."));

    const list = h("div", { class: "members-list" });
    if (!members.length) list.appendChild(h("div", { class: "empty-state" }, "No members yet — save the project as a file and open it to add yourself."));
    members.forEach((m) => {
      const isMe = me.email && m.id === me.email.toLowerCase();
      const row = h("div", { class: "member-row" }, [
        h("span", { class: "cc-avatar" }, initials(m.name)),
        h("span", { class: "member-text" }, [h("span", { class: "member-name" }, [m.name, isMe ? h("span", { class: "member-you" }, " (you)") : null]), h("span", { class: "member-email" }, m.email)]),
      ]);
      if (!isMe) {
        const remove = h("button", { class: "icon-btn sm", "data-tip": "Remove from this list", html: UI.trash });
        remove.addEventListener("click", () => {
          if (confirm(`Remove ${m.name} (${m.email}) from this project's members? Their existing comments stay.`)) store.removeMember(m.email);
        });
        row.appendChild(remove);
      }
      list.appendChild(row);
    });
    modal.appendChild(list);

    const emailIn = h("input", { type: "email", placeholder: "colleague@company.com", class: "member-email-input" });
    const nameIn = h("input", { type: "text", placeholder: "Name (optional)", class: "member-name-input" });
    const error = h("div", { class: "cm-error" });
    const add = h("button", { class: "btn primary sm" }, "Add");
    const submit = () => {
      const email = emailIn.value.trim().toLowerCase();
      if (!EMAIL_PATTERN.test(email)) { error.textContent = "Enter a valid email address"; emailIn.focus(); return; }
      if ((store.doc.members || []).some((m) => m.id === email)) { error.textContent = "Already a member"; return; }
      store.addMemberByEmail({ email, name: nameIn.value.trim() || nameFromEmail(email) });
    };
    add.addEventListener("click", submit);
    [emailIn, nameIn].forEach((i) => {
      i.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
      i.addEventListener("input", () => { error.textContent = ""; });
    });
    modal.appendChild(h("div", { class: "member-add" }, [emailIn, nameIn, add]));
    modal.appendChild(error);
    modal.appendChild(h("div", { class: "modal-actions" }, [h("button", { class: "btn", onclick: close }, "Done")]));
  };

  const off = store.on("members:change", render);
  render();
}
