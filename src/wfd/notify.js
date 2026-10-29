// "Email them" when work is assigned. The app has no mail server and holds no
// credentials, so it opens a ready-to-send message in the person's own mail
// app (Outlook, Gmail desktop, etc.) — addressed, with subject and details
// filled in. The assigner just presses Send, so the email comes from their
// own account.

import { store } from "../store.js";
import { getIdentity } from "./identity.js";
import { getFileState } from "./projectFile.js";
import { showToast } from "../components/toast.js";

const PREF_KEY = "wfd-notify-on-assign";
const MAX_URL = 1800; // mailto links longer than ~2000 characters are cut off by some mail apps

export function getNotifyPreference() {
  try {
    return localStorage.getItem(PREF_KEY) !== "off";
  } catch (err) {
    return true;
  }
}

export function setNotifyPreference(on) {
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch (err) { /* ignore */ }
}

function visualTitle(el) {
  return el?.content?.title || el?.content?.category || el?.name || "a visual";
}

/** Builds the mailto: link for an assignment. */
export function buildAssignmentMail({ person, elId, commentText, type }) {
  const found = store.findElementAnyPage(elId);
  const me = getIdentity();
  const project = store.doc.meta.title || "Wireframe";
  const file = getFileState();
  const where = found ? `"${visualTitle(found.el)}" on page "${found.page.name}"` : "a visual";
  const first = (person.name || "").split(/\s+/)[0] || "there";

  const lines = [
    `Hi ${first},`,
    "",
    `${me.name || "A teammate"} assigned you a comment in the wireframe "${project}".`,
    "",
    `Visual: ${where}`,
    type ? `Type: ${type}` : null,
    commentText ? `Comment: ${commentText.trim()}` : null,
    "",
    file.linked ? `Open the project file "${file.name}" in Wireframe Designer (it's in the shared OneDrive folder), go to that page and open the Comments tab — filter "For me" to see everything assigned to you.` : `Open the wireframe "${project}" in Wireframe Designer and check the Comments tab — filter "For me".`,
    "",
    `Thanks,`,
    me.name || "",
  ].filter((l) => l !== null);

  const subject = `[${project}] Assigned to you: ${found ? visualTitle(found.el) : "a comment"}`;
  let body = lines.join("\r\n");
  let url = `mailto:${encodeURIComponent(person.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (url.length > MAX_URL && commentText) {
    const room = Math.max(40, commentText.length - (url.length - MAX_URL) / 3);
    body = body.replace(commentText.trim(), `${commentText.trim().slice(0, Math.floor(room))}…`);
    url = `mailto:${encodeURIComponent(person.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  return { url, subject, body };
}

/**
 * Opens the email in the user's mail app. Does nothing for yourself or for
 * someone without an email. Returns true if a message was opened.
 */
export function emailAssignee({ person, elId, commentText, type }) {
  const me = getIdentity();
  if (!person?.email) return false;
  if (me.email && person.email.toLowerCase() === me.email.toLowerCase()) return false;
  const { url, body } = buildAssignmentMail({ person, elId, commentText, type });
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast(`Email to ${person.name || person.email} opened in your mail app — press Send`, "info", 5000);
  try { navigator.clipboard?.writeText(body); } catch (err) { /* optional */ }
  return true;
}
