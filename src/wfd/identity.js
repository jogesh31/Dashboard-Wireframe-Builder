// Who is using this copy of the app: a name and a work email. There's no
// password or sign-in — the desktop app pre-fills both from the Office /
// OneDrive account already signed in on this PC, the person confirms once,
// and it's kept on this computer. Comments, assignments and saves are tied
// to the email, so "Priya" and "Priya Sharma" can't become two people.
// (Who can open a project is still decided by OneDrive's sharing.)

import { h, escapeHtml } from "../utils/dom.js";

const KEY = "wfd-user";
const LEGACY_NAME_KEY = "wfd-user-name";
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && saved.name) return { name: saved.name, email: saved.email || "" };
    const legacy = localStorage.getItem(LEGACY_NAME_KEY);
    return legacy ? { name: legacy, email: "" } : { name: "", email: "" };
  } catch (err) {
    return { name: "", email: "" };
  }
}

export function getIdentity() {
  return read();
}

export function getUserName() {
  return read().name;
}

export function getUserEmail() {
  return read().email;
}

export function setIdentity({ name, email }) {
  const value = { name: name.trim(), email: email.trim().toLowerCase() };
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
    localStorage.setItem(LEGACY_NAME_KEY, value.name);
  } catch (err) { /* storage blocked — identity just won't persist */ }
  window.dispatchEvent(new CustomEvent("wfd:identity-change", { detail: value }));
}

/** "priya.sharma@acc.com" → "Priya Sharma" (used when only an email is known). */
export function nameFromEmail(email) {
  const local = String(email || "").split("@")[0];
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

async function detected() {
  if (typeof window === "undefined" || !window.wfdNative?.detectIdentities) return [];
  try {
    return await window.wfdNative.detectIdentities();
  } catch (err) {
    return [];
  }
}

/**
 * Asks the user to confirm who they are if no email is stored yet (or
 * always, when `force`). Resolves with { name, email }.
 */
export async function ensureIdentity(force = false) {
  const current = read();
  if (current.name && current.email && !force) return current;

  const accounts = await detected();
  return new Promise((resolve) => {
    const overlay = h("div", { class: "modal-overlay" });
    const modal = h("div", { class: "modal identity-modal" });
    const first = !current.name;
    modal.innerHTML = `
      <h3>${first ? "Welcome to Wireframe Designer" : current.email ? "Your profile" : "Add your work email"}</h3>
      <p class="identity-intro">Your name and email go on your comments and changes, so teammates can assign work to you and @mention you.${accounts.length ? " We found these accounts on this PC:" : ""}</p>
      <div class="identity-accounts"></div>
      <div class="field"><label for="wfd-id-name">Your name</label><input type="text" id="wfd-id-name" autocomplete="name" placeholder="Priya Sharma" /></div>
      <div class="field"><label for="wfd-id-email">Work email</label><input type="email" id="wfd-id-email" autocomplete="email" placeholder="priya.sharma@company.com" /></div>
      <div class="identity-error" id="wfd-id-error"></div>
      <p class="identity-note">No password needed — this only labels your work. Who can open a project is set by its OneDrive sharing.</p>
      <div class="modal-actions">${!first && current.email ? '<button class="btn" data-action="cancel">Cancel</button>' : ""}<button class="btn primary" data-action="save">${first ? "Continue" : "Save"}</button></div>`;
    overlay.appendChild(modal);
    document.getElementById("modal-host").appendChild(overlay);

    const nameIn = modal.querySelector("#wfd-id-name");
    const emailIn = modal.querySelector("#wfd-id-email");
    const error = modal.querySelector("#wfd-id-error");
    const list = modal.querySelector(".identity-accounts");

    const pick = (acc) => {
      emailIn.value = acc.email;
      if (acc.name && (!nameIn.value || !current.name)) nameIn.value = acc.name;
      list.querySelectorAll(".identity-account").forEach((b) => b.classList.toggle("selected", b.dataset.email === acc.email));
      error.textContent = "";
    };
    accounts.forEach((acc) => {
      const btn = h("button", { class: "identity-account", type: "button", "data-email": acc.email });
      btn.innerHTML = `<span class="ia-name">${escapeHtml(acc.name || nameFromEmail(acc.email))}</span><span class="ia-email">${escapeHtml(acc.email)}</span><span class="ia-tag">${acc.work ? "Work" : "Personal"} · ${escapeHtml(acc.source)}</span>`;
      btn.addEventListener("click", () => pick(acc));
      list.appendChild(btn);
    });

    nameIn.value = current.name;
    emailIn.value = current.email;
    const match = accounts.find((a) => a.email.toLowerCase() === current.email.toLowerCase()) || (!current.email && accounts[0]);
    if (match) pick(match);
    if (!nameIn.value && emailIn.value) nameIn.value = nameFromEmail(emailIn.value);

    (nameIn.value ? emailIn : nameIn).focus();
    [nameIn, emailIn].forEach((i) => i.addEventListener("input", () => { error.textContent = ""; }));
    emailIn.addEventListener("input", () => {
      list.querySelectorAll(".identity-account").forEach((b) => b.classList.toggle("selected", b.dataset.email === emailIn.value.trim()));
    });

    const close = (value) => { overlay.remove(); resolve(value); };
    const save = () => {
      const name = nameIn.value.trim();
      const email = emailIn.value.trim();
      if (!name) { error.textContent = "Enter your name"; nameIn.focus(); return; }
      if (!EMAIL_PATTERN.test(email)) { error.textContent = "Enter a valid email, like name@company.com"; emailIn.focus(); return; }
      setIdentity({ name, email });
      close(read());
    };
    modal.querySelector('[data-action="save"]').addEventListener("click", save);
    modal.querySelector('[data-action="cancel"]')?.addEventListener("click", () => close(current));
    [nameIn, emailIn].forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); }));
  });
}

/** Kept for older call sites. */
export const ensureUserName = ensureIdentity;
