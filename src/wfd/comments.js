// The review-comment model shared by the comments panel, canvas badges,
// export sticky notes and file merging: status, type, assignee, replies and
// @mentions. People are identified by email (with a display name); comments
// from before emails were added still work by name. Comments from older
// files (which only had `resolved`) are upgraded on load, and `resolved` is
// still written so older copies of the app keep reading files correctly.

import { escapeHtml } from "../utils/dom.js";
import { nameFromEmail } from "./identity.js";

export const COMMENT_STATUSES = [
  { id: "open", label: "Open" },
  { id: "in-progress", label: "In progress" },
  { id: "done", label: "Done" },
];

export const COMMENT_TYPES = [
  { id: "requirement", label: "Requirement" },
  { id: "question", label: "Question" },
  { id: "data", label: "Data / fields" },
  { id: "interaction", label: "Interaction" },
  { id: "design", label: "Design" },
  { id: "issue", label: "Issue" },
];

export const DEFAULT_COMMENT_TYPE = "requirement";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function statusOf(c) {
  if (c.status && COMMENT_STATUSES.some((s) => s.id === c.status)) return c.status;
  return c.resolved ? "done" : "open";
}

export function statusLabel(id) {
  return COMMENT_STATUSES.find((s) => s.id === id)?.label || "Open";
}

export function typeLabel(id) {
  return COMMENT_TYPES.find((t) => t.id === id)?.label || "";
}

export function isOpen(c) {
  return statusOf(c) !== "done";
}

/** Upgrades a comment from any file version to the current shape. */
export function normalizeComment(c) {
  const status = statusOf(c);
  return {
    ...c,
    status,
    resolved: status === "done",
    type: c.type || "",
    authorEmail: c.authorEmail || "",
    assignee: c.assignee || "",
    assigneeEmail: c.assigneeEmail || "",
    mentions: Array.isArray(c.mentions) ? c.mentions : [],
    mentionEmails: Array.isArray(c.mentionEmails) ? c.mentionEmails : [],
    replies: Array.isArray(c.replies)
      ? c.replies.map((r) => ({ ...r, authorEmail: r.authorEmail || "", mentions: Array.isArray(r.mentions) ? r.mentions : [], mentionEmails: Array.isArray(r.mentionEmails) ? r.mentionEmails : [] }))
      : [],
  };
}

// ---------------- people ----------------
// A person is { name, email }. Email is the identity; name is for display.

/** Same person? By email when both sides have one, otherwise by name. */
export function samePerson(aName, aEmail, bName, bEmail) {
  if (aEmail && bEmail) return aEmail.trim().toLowerCase() === bEmail.trim().toLowerCase();
  return !!aName && !!bName && aName.trim().toLowerCase() === bName.trim().toLowerCase();
}

const PEOPLE_KEY = "wfd-known-people";

function rememberedPeople() {
  try {
    return JSON.parse(localStorage.getItem(PEOPLE_KEY) || "[]").map((p) => (typeof p === "string" ? { name: p, email: "" } : p));
  } catch (err) {
    return [];
  }
}

/** Remembers people this user assigned or @mentioned, for suggestions in other projects. */
export function rememberPeople(people) {
  const merged = uniquePeople([...rememberedPeople(), ...people.filter(Boolean)]).slice(0, 300);
  try {
    localStorage.setItem(PEOPLE_KEY, JSON.stringify(merged));
  } catch (err) { /* suggestions just won't persist */ }
}

function uniquePeople(list) {
  const byEmail = new Map();
  const byName = new Map();
  list.forEach((p) => {
    const name = String(p?.name || "").trim();
    const email = String(p?.email || "").trim().toLowerCase();
    if (email) {
      // First name seen wins: callers list this user and the project's
      // members (names people chose themselves) before names typed in comments.
      const prev = byEmail.get(email);
      byEmail.set(email, { name: prev?.name || name || nameFromEmail(email), email });
    } else if (name && name !== "You") {
      byName.set(name.toLowerCase(), { name, email: "" });
    }
  });
  // Drop name-only entries for people we now know by email.
  const emailNames = new Set([...byEmail.values()].map((p) => p.name.toLowerCase()));
  const nameOnly = [...byName.values()].filter((p) => !emailNames.has(p.name.toLowerCase()));
  return [...byEmail.values(), ...nameOnly];
}

/**
 * Everyone relevant to this project: its members (everyone who has opened
 * it), people in its comments, this user, and people they've used before.
 */
export function knownPeople(doc, me) {
  const list = [me];
  (doc.members || []).forEach((m) => list.push({ name: m.name, email: m.email }));
  doc.pages.forEach((p) =>
    p.elements.forEach((e) =>
      (e.comments || []).forEach((c) => {
        list.push({ name: c.author, email: c.authorEmail }, { name: c.assignee, email: c.assigneeEmail });
        (c.replies || []).forEach((r) => list.push({ name: r.author, email: r.authorEmail }));
      })
    )
  );
  return uniquePeople([...list, ...rememberedPeople()]).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Turns what was typed in an assignee box into a person: an exact name or
 * email from the list, or a new email address. Returns null if it's neither.
 */
export function resolvePerson(input, people) {
  const text = String(input || "").trim();
  if (!text) return { name: "", email: "" };
  const lower = text.toLowerCase();
  const byEmail = people.find((p) => p.email && p.email.toLowerCase() === lower);
  if (byEmail) return byEmail;
  const byLabel = people.find((p) => personLabel(p).toLowerCase() === lower);
  if (byLabel) return byLabel;
  const byName = people.filter((p) => p.name.toLowerCase() === lower);
  if (byName.length === 1) return byName[0];
  if (EMAIL.test(text)) return { name: nameFromEmail(text), email: lower };
  return null;
}

export function personLabel(p) {
  return p.email ? `${p.name} <${p.email}>` : p.name;
}

// ---------------- @mentions ----------------

/** People from `people` @mentioned in `text` — by name (longest first) or by email. */
export function extractMentions(text, people) {
  const lower = String(text || "").toLowerCase();
  const found = [];
  const taken = [];
  const candidates = [];
  people.forEach((p) => {
    if (p.name) candidates.push({ p, tag: `@${p.name.toLowerCase()}` });
    if (p.email) candidates.push({ p, tag: `@${p.email.toLowerCase()}` });
  });
  candidates.sort((a, b) => b.tag.length - a.tag.length).forEach(({ p, tag }) => {
    let i = lower.indexOf(tag);
    while (i !== -1) {
      const after = lower.charAt(i + tag.length);
      const covered = taken.some(([s, e]) => s <= i && i < e);
      if (!covered && (!after || !/[a-z0-9]/i.test(after))) {
        taken.push([i, i + tag.length]);
        if (!found.some((f) => samePerson(f.name, f.email, p.name, p.email))) found.push(p);
        break;
      }
      i = lower.indexOf(tag, i + 1);
    }
  });
  return found;
}

/** Escaped comment text with @mentions highlighted (`mentions` are names). */
export function renderCommentText(text, mentions = []) {
  let html = escapeHtml(text || "");
  [...mentions].filter(Boolean).sort((a, b) => b.length - a.length).forEach((name) => {
    const tag = escapeHtml(`@${name}`);
    const re = new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w])", "gi");
    html = html.replace(re, (m) => `<span class="mention">${m}</span>`);
  });
  return html;
}

// ---------------- "for me" ----------------

function mentionsMe(item, me) {
  if (me.email && (item.mentionEmails || []).some((e) => e.toLowerCase() === me.email.toLowerCase())) return true;
  // Older comments only stored names.
  return !(item.mentionEmails || []).length && (item.mentions || []).some((n) => samePerson(n, "", me.name, ""));
}

export function isMine(item, me) {
  return samePerson(item.author, item.authorEmail, me.name, me.email);
}

export function isAssignedTo(c, me) {
  return !!c.assignee && samePerson(c.assignee, c.assigneeEmail, me.name, me.email);
}

/** Comments that involve `me` (assigned to me, or @mentioning me anywhere in the thread). */
export function involvesMe(c, me) {
  if (!me?.name && !me?.email) return false;
  if (isAssignedTo(c, me) || mentionsMe(c, me)) return true;
  return (c.replies || []).some((r) => mentionsMe(r, me));
}

/**
 * New comments, replies and assignments for `me` that appeared between two
 * versions of a project — used to tell someone "2 comments for you" when a
 * teammate's save comes in.
 */
export function newItemsForMe(before, after, me) {
  if (!me || (!me.name && !me.email) || !before || !after) return 0;
  const old = new Map();
  before.pages.forEach((p) => p.elements.forEach((e) => (e.comments || []).forEach((c) => old.set(c.id, c))));
  let count = 0;
  after.pages.forEach((p) =>
    p.elements.forEach((e) =>
      (e.comments || []).forEach((c) => {
        const prev = old.get(c.id);
        const mineComment = isMine(c, me);
        if (!prev) {
          if (!mineComment && involvesMe(c, me)) count++;
          return;
        }
        if (!mineComment && isAssignedTo(c, me) && !isAssignedTo(prev, me)) count++;
        const prevReplies = new Set((prev.replies || []).map((r) => r.id));
        (c.replies || []).forEach((r) => {
          if (prevReplies.has(r.id) || isMine(r, me)) return;
          if (mentionsMe(r, me) || mineComment) count++;
        });
      })
    )
  );
  return count;
}
