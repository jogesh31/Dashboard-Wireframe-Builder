// Keeps the open project in sync with its .wfd file (typically in a shared
// OneDrive folder). Every autosave also writes the file; before writing, the
// file is re-read and anything someone else saved since our last sync is
// merged in, so two people never overwrite each other. Changes arriving from
// other people are highlighted on the canvas and summarized in a banner.

import { store } from "../store.js";
import { showToast } from "../components/toast.js";
import { saveSeenSnapshot, loadSeenSnapshot, getMetaValue, putMetaValue } from "../persistence.js";
import { backend, rememberRef, recallRef, forgetRef } from "./backend.js";
import { serializeProject, parseProject, sharedContent, contentKey, mergeDocs, diffDocs, FILE_EXTENSION } from "./format.js";
import { getIdentity } from "./identity.js";
import { addRecentFile, removeRecentFile } from "./recentFiles.js";
import { newItemsForMe } from "./comments.js";

const state = {
  ref: null,
  name: "",
  projectId: null,
  base: null, // shared content as of the last sync with the file
  baseKey: "",
  mtime: 0,
  status: "none", // none | synced | syncing | needs-permission | error
  error: "",
  syncing: false,
  pending: false,
  unwatch: null,
};

// Changes from other people, shown until the user dismisses them.
const remote = {
  highlights: { added: new Set(), modified: new Set(), commented: new Set() },
  summary: null, // { by, at, added, modified, removed, newComments, pages: Map, conflicts: [] }
  conflictCopies: [], // [{ ref, name }]
};

function emit() {
  document.title = state.ref ? `${state.name} — Wireframe Designer` : "Wireframe Designer";
  window.dispatchEvent(new CustomEvent("wfd:file-change"));
}

const RETRY_MS = 10000;
let retryTimer = null;

function setStatus(status, error = "") {
  state.status = status;
  state.error = error;
  // While the file is unreachable (moved, OneDrive offline, network drive
  // down), keep retrying so saving resumes by itself once it's back.
  clearTimeout(retryTimer);
  if (status === "error") retryTimer = setTimeout(() => syncNow(), RETRY_MS);
  emit();
}

export function getFileState() {
  return { linked: !!state.ref && state.projectId === store.doc.meta.id, name: state.name, status: state.status, error: state.error, kind: backend.kind };
}

export function getRemoteChanges() {
  return remote;
}

export function getHighlight(elId) {
  if (remote.highlights.added.has(elId)) return "added";
  if (remote.highlights.modified.has(elId)) return "modified";
  if (remote.highlights.commented.has(elId)) return "commented";
  return null;
}

/** "Mark as seen": clears the highlights and forgets them for this project. */
export function dismissRemoteChanges() {
  const hadSome = !!remote.summary;
  resetRemote();
  if (hadSome && state.projectId) savePending(state.projectId);
}

/** Clears what's shown (e.g. when switching projects) without forgetting it. */
function resetRemote() {
  remote.highlights = { added: new Set(), modified: new Set(), commented: new Set() };
  remote.summary = null;
  emit();
  store.emit("elements:change", store.getCurrentPage());
}

// Changes from others that haven't been marked as seen are kept with the
// project on this computer, so closing the app (or a teammate saving just as
// it closes) never makes them disappear without being shown.
function savePending(projectId) {
  const value = remote.summary
    ? {
        highlights: { added: [...remote.highlights.added], modified: [...remote.highlights.modified], commented: [...remote.highlights.commented] },
        summary: { ...remote.summary, pages: [...remote.summary.pages.entries()] },
      }
    : null;
  return putMetaValue(`pending:${projectId}`, value);
}

async function restorePending(projectId) {
  const saved = await getMetaValue(`pending:${projectId}`);
  if (!saved?.summary || store.doc.meta.id !== projectId) return;
  remote.highlights = {
    added: new Set(saved.highlights.added),
    modified: new Set(saved.highlights.modified),
    commented: new Set(saved.highlights.commented),
  };
  remote.summary = { ...saved.summary, pages: new Map(saved.summary.pages) };
  emit();
  store.emit("elements:change", store.getCurrentPage());
}

function recordRemoteChanges(diff, by, at, conflicts = [], forMe = 0) {
  if (!diff.total && !conflicts.length) return Promise.resolve();
  diff.added.forEach((id) => remote.highlights.added.add(id));
  diff.modified.forEach((id) => { if (!remote.highlights.added.has(id)) remote.highlights.modified.add(id); });
  diff.commented.forEach((id) => remote.highlights.commented.add(id));

  const prev = remote.summary;
  const pages = new Map(prev ? prev.pages : []);
  diff.pages.forEach((v, id) => pages.set(id, { name: v.name, count: (pages.get(id)?.count || 0) + v.count }));
  remote.summary = {
    by: by || prev?.by || "Someone",
    at: at || Date.now(),
    added: (prev?.added || 0) + diff.added.size,
    modified: (prev?.modified || 0) + diff.modified.size,
    removed: (prev?.removed || 0) + diff.removed,
    newComments: (prev?.newComments || 0) + diff.newComments,
    updatedComments: (prev?.updatedComments || 0) + diff.updatedComments,
    forMe: (prev?.forMe || 0) + forMe,
    newPages: (prev?.newPages || 0) + diff.newPages,
    pages,
    conflicts: [...(prev?.conflicts || []), ...conflicts],
  };
  emit();
  store.emit("elements:change", store.getCurrentPage()); // redraw with highlights
  return state.projectId ? savePending(state.projectId) : Promise.resolve();
}

function suggestedFileName() {
  const title = (store.doc.meta.title || "Wireframe").replace(/[\\/:*?"<>|]+/g, "").trim() || "Wireframe";
  return `${title}${FILE_EXTENSION}`;
}

function setBase(content, mtime) {
  state.base = JSON.parse(JSON.stringify(content));
  state.baseKey = contentKey(content);
  state.mtime = mtime;
  saveSeenSnapshot(content.meta.id, state.base);
  if (state.ref) addRecentFile({ ref: state.ref, name: state.name, doc: state.base });
}

function projectOpened() {
  window.dispatchEvent(new CustomEvent("wfd:project-opened"));
}

function link(ref, name, content, mtime) {
  stopWatching();
  state.ref = ref;
  state.name = name;
  state.projectId = content.meta.id;
  setBase(content, mtime);
  rememberRef(content.meta.id, ref);
  state.unwatch = backend.watch(ref, () => syncNow());
  setStatus("synced");
  store.ensureCurrentMember(); // join the project's members (saved on the next sync)
  syncNow(); // catch anything saved between reading the file and starting to watch it
}

function stopWatching() {
  if (state.unwatch) state.unwatch();
  state.unwatch = null;
}

/** Forget the file for the open project (the local copy keeps working). */
export async function unlinkProjectFile() {
  const id = state.projectId;
  stopWatching();
  dismissRemoteChanges();
  Object.assign(state, { ref: null, name: "", projectId: null, base: null, baseKey: "", mtime: 0 });
  remote.conflictCopies = [];
  if (id) await forgetRef(id);
  setStatus("none");
}

// ---------------- open / save as ----------------

export async function openProjectFile() {
  if (!backend.supported) {
    showToast("Opening project files needs the desktop app, or Chrome / Edge", "error", 4000);
    return false;
  }
  try {
    const picked = await backend.open();
    if (!picked) return false;
    await openFromPicked(picked);
    return true;
  } catch (err) {
    if (err?.name !== "AbortError") { console.error(err); showToast(err.message || "Couldn't open that file", "error", 4000); }
    return false;
  }
}

async function openFromPicked({ ref, name, text, mtime }) {
  const { doc, savedBy, savedAt } = parseProject(text);
  const lastSeen = await loadSeenSnapshot(doc.meta.id);
  await store.forceSaveNow(); // keep the project we're leaving safe locally
  stopWatching();
  resetRemote();
  store.replaceDocument(doc);
  link(ref, name || backend.nameOf(ref), sharedContent(store.doc), mtime);
  projectOpened();
  showToast(`Opened "${name}"`, "success");

  await restorePending(doc.meta.id);
  if (lastSeen) {
    const current = sharedContent(store.doc);
    const diff = diffDocs(lastSeen, current);
    if (diff.total) recordRemoteChanges(diff, savedBy, savedAt, [], newItemsForMe(lastSeen, current, getIdentity()));
  }
  checkConflictCopies();
}

/**
 * Save (Ctrl+S): writes the open project to its .wfd file right away, or asks
 * where to save it the first time.
 */
export async function saveProjectFile() {
  if (!getFileState().linked) return saveProjectFileAs();
  if (state.status === "needs-permission") {
    await reconnectProjectFile();
    return state.status === "synced";
  }
  await store.forceSaveNow();
  await syncNow();
  if (state.status === "synced") showToast(`Saved to "${state.name}"`, "success");
  else showToast(state.error || `Couldn't save to "${state.name}"`, "error", 4000);
  return state.status === "synced";
}

export async function saveProjectFileAs() {
  if (!backend.supported) {
    showToast("Saving project files needs the desktop app, or Chrome / Edge", "error", 4000);
    return false;
  }
  try {
    const text = serializeProject(store.doc, getIdentity().name, getIdentity().email);
    const saved = await backend.saveAs(suggestedFileName(), text);
    if (!saved) return false;
    link(saved.ref, saved.name || backend.nameOf(saved.ref), sharedContent(store.doc), saved.mtime);
    showToast(`Saved as "${state.name}" — changes now save to this file automatically`, "success", 3500);
    return true;
  } catch (err) {
    if (err?.name !== "AbortError") { console.error(err); showToast("Couldn't save the project file", "error"); }
    return false;
  }
}

// ---------------- sync ----------------

/**
 * Brings the file and the open project together: pulls in anything someone
 * else saved (merging with our unsaved changes), then writes our changes if
 * there are any. Safe to call often — it does nothing when nothing changed.
 */
let syncChain = Promise.resolve();

export function syncNow() {
  if (!state.ref || state.projectId !== store.doc.meta.id) return Promise.resolve();
  // A sync is already running: queue one more pass and hand back the same
  // promise, so callers (Ctrl+S, closing the window) wait for the pass that
  // includes their latest change, not just the one already in flight.
  if (state.syncing) { state.pending = true; return syncChain; }
  syncChain = runSync();
  return syncChain;
}

async function runSync() {
  state.syncing = true;
  try {
    if (!(await backend.hasPermission(state.ref))) {
      setStatus("needs-permission");
      return;
    }
    if (state.status !== "synced") setStatus("syncing");

    const st = await backend.stat(state.ref);
    if (!st) throw new Error(`"${state.name}" can't be found — it may have been moved or renamed`);

    if (st.mtime !== state.mtime) await pullRemote();

    if (contentKey(store.doc) !== state.baseKey) {
      const { mtime } = await backend.write(state.ref, serializeProject(store.doc, getIdentity().name, getIdentity().email));
      setBase(sharedContent(store.doc), mtime);
    }
    setStatus("synced");
  } catch (err) {
    console.warn("Project file sync failed", err);
    setStatus("error", err.message || "Couldn't reach the project file");
  } finally {
    state.syncing = false;
  }
  if (state.pending && state.ref) {
    state.pending = false;
    await runSync();
  }
}

async function pullRemote() {
  const { text, mtime } = await backend.read(state.ref);
  const { doc: theirs, savedBy, savedAt } = parseProject(text);
  if (theirs.meta?.id !== state.projectId) throw new Error(`"${state.name}" now contains a different project`);

  if (contentKey(theirs) === state.baseKey) {
    state.mtime = mtime; // touched, but nothing actually changed
    return;
  }

  const diff = diffDocs(state.base, theirs);
  const forMe = newItemsForMe(state.base, theirs, getIdentity());
  const { doc: merged, conflicts } = mergeDocs(state.base, sharedContent(store.doc), theirs);
  if (contentKey(merged) !== contentKey(store.doc)) store.applyExternalDocument(merged);
  setBase(theirs, mtime);
  await recordRemoteChanges(diff, savedBy, savedAt, conflicts, forMe);
}

/** Re-asks for file access in the browser (needs a click). */
export async function reconnectProjectFile() {
  if (!state.ref) return;
  if (await backend.requestPermission(state.ref)) {
    await syncNow();
    if (state.status === "synced") showToast(`Reconnected to "${state.name}"`, "success");
  }
}

// ---------------- OneDrive conflict copies ----------------
// If two people save before OneDrive has synced, OneDrive keeps both by
// creating e.g. "Sales Dashboard-DESKTOP-AB12.wfd". Offer to merge it back in.

async function checkConflictCopies() {
  if (!state.ref) return;
  try {
    const copies = await backend.listConflictCopies(state.ref);
    remote.conflictCopies = [];
    for (const c of copies) {
      try {
        const { doc } = parseProject((await backend.read(c.ref)).text);
        if (doc.meta?.id === state.projectId) remote.conflictCopies.push({ ref: c.ref, name: c.name });
      } catch (err) { /* not one of ours */ }
    }
    emit();
  } catch (err) { /* listing isn't essential */ }
}

export async function mergeConflictCopy(copy) {
  try {
    const { doc: theirs, savedBy, savedAt } = parseProject((await backend.read(copy.ref)).text);
    const diff = diffDocs(state.base, theirs);
    const { doc: merged, conflicts } = mergeDocs(state.base, sharedContent(store.doc), theirs);
    store.applyExternalDocument(merged);
    recordRemoteChanges(diff, savedBy, savedAt, conflicts);
    await syncNow();
    await backend.trash(copy.ref);
    remote.conflictCopies = remote.conflictCopies.filter((c) => c !== copy);
    emit();
    showToast(`Merged "${copy.name}" and moved it to the Recycle Bin`, "success", 3500);
  } catch (err) {
    console.error(err);
    showToast(`Couldn't merge "${copy.name}"`, "error");
  }
}

export function ignoreConflictCopy(copy) {
  remote.conflictCopies = remote.conflictCopies.filter((c) => c !== copy);
  emit();
}

// ---------------- start screen actions ----------------

/** Opens a project from the recent list. Returns false if it couldn't be opened. */
export async function openRecentFile(entry) {
  try {
    if (!(await backend.hasPermission(entry.ref)) && !(await backend.requestPermission(entry.ref))) {
      showToast("Allow access to open this project", "error");
      return false;
    }
    const st = await backend.stat(entry.ref);
    if (!st) {
      await removeRecentFile(entry.projectId);
      showToast(`"${entry.name}" can't be found — it may have been moved, renamed or deleted. Use Open to find it.`, "error", 5000);
      return false;
    }
    const { text, mtime } = await backend.read(entry.ref);
    await openFromPicked({ ref: entry.ref, name: entry.name, text, mtime });
    return true;
  } catch (err) {
    console.error(err);
    showToast(err.message || `Couldn't open "${entry.name}"`, "error", 4000);
    return false;
  }
}

/** Starts a blank, untitled project (kept locally until it's saved as a file). */
export async function startNewProject() {
  await store.forceSaveNow();
  store.newDocument();
  await relinkForCurrentProject();
  projectOpened();
}

/** Reopens a project that was only ever kept on this computer. */
export async function openDraft(projectId) {
  await store.forceSaveNow();
  const ok = await store.openProject(projectId);
  if (!ok) return false;
  await relinkForCurrentProject();
  projectOpened();
  return true;
}

// ---------------- startup / project switching ----------------

/** Re-links whichever project is open now to its file, if it has one. */
export async function relinkForCurrentProject() {
  stopWatching();
  resetRemote();
  remote.conflictCopies = [];
  Object.assign(state, { ref: null, name: "", projectId: null, base: null, baseKey: "", mtime: 0 });
  setStatus("none");

  const projectId = store.doc.meta.id;
  const ref = await recallRef(projectId).catch(() => null);
  if (!ref || store.doc.meta.id !== projectId) return;

  state.ref = ref;
  state.name = backend.nameOf(ref);
  state.projectId = projectId;
  if (!(await backend.hasPermission(ref).catch(() => false))) {
    setStatus("needs-permission");
    return;
  }
  try {
    const { text } = await backend.read(ref);
    const { doc: fileDoc } = parseProject(text);
    if (fileDoc.meta?.id !== projectId) throw new Error("different project");
    // Use what we last saw as the base, then force a pull: our local edits
    // since then and everyone else's both survive, and theirs get highlighted.
    const lastSeen = (await loadSeenSnapshot(projectId)) || fileDoc;
    state.base = lastSeen;
    state.baseKey = contentKey(lastSeen);
    state.mtime = -1;
    state.unwatch = backend.watch(ref, () => syncNow());
    await restorePending(projectId);
    await syncNow();
    store.ensureCurrentMember();
    checkConflictCopies();
  } catch (err) {
    console.warn("Couldn't reopen the linked project file", err);
    setStatus("error", `Couldn't open "${state.name}"`);
  }
}

/**
 * Starts file syncing. If the app was launched by opening a .wfd file, opens
 * that project and resolves true; otherwise resolves false so the caller can
 * show the start screen.
 */
export async function initProjectFile() {
  store.on("persisted", () => syncNow());
  backend.onOpenFileRequest(async (picked) => {
    try {
      await openFromPicked(picked);
    } catch (err) {
      showToast(err.message || "Couldn't open that file", "error", 4000);
    }
  });
  const initial = await backend.initialFile().catch(() => null);
  if (!initial) return false;
  try {
    await openFromPicked(initial);
    return true;
  } catch (err) {
    showToast(err.message || "Couldn't open that file", "error", 4000);
    return false;
  }
}
