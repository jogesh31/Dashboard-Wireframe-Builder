import { store } from "../store.js";
import { saveLinkedFileHandle, loadLinkedFileHandle, clearLinkedFileHandle } from "../persistence.js";
import { showToast } from "../components/toast.js";

let linkedHandle = null;
let linkedProjectId = null;
let lastKnownModified = 0;
let pollTimer = null;

const PICKER_OPTS = {
  types: [{ description: "Wireframe project", accept: { "application/json": [".json"] } }],
  suggestedName: "wireframe-project.json",
};

export function isFileSystemAccessSupported() {
  return typeof window.showSaveFilePicker === "function" && typeof window.showOpenFilePicker === "function";
}

function docToText() {
  return JSON.stringify(store.doc, null, 2);
}

async function writeHandle(handle, text) {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function ensurePermission(handle, mode = "readwrite") {
  const opts = { mode };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  return (await handle.requestPermission(opts)) === "granted";
}

function linkStatusChanged() {
  window.dispatchEvent(new CustomEvent("wfd:shared-file-change"));
}

async function link(handle) {
  linkedHandle = handle;
  linkedProjectId = store.doc.meta.id;
  await saveLinkedFileHandle(linkedProjectId, handle);
  const file = await handle.getFile();
  lastKnownModified = file.lastModified;
  startPolling();
  linkStatusChanged();
}

export async function createSharedFile() {
  if (!isFileSystemAccessSupported()) {
    showToast("Your browser doesn't support linking to a file — try Chrome or Edge", "error");
    return false;
  }
  try {
    const handle = await window.showSaveFilePicker(PICKER_OPTS);
    await writeHandle(handle, docToText());
    await link(handle);
    showToast(`Linked to "${handle.name}" — this now saves here automatically`, "success");
    return true;
  } catch (err) {
    if (err.name !== "AbortError") { console.error(err); showToast("Couldn't create the shared file", "error"); }
    return false;
  }
}

export async function openSharedFile() {
  if (!isFileSystemAccessSupported()) {
    showToast("Your browser doesn't support linking to a file — try Chrome or Edge", "error");
    return false;
  }
  try {
    const [handle] = await window.showOpenFilePicker(PICKER_OPTS);
    const file = await handle.getFile();
    const doc = JSON.parse(await file.text());
    if (!doc || !doc.pages) throw new Error("This doesn't look like a wireframe project file");
    store.replaceDocument(doc);
    await link(handle);
    showToast(`Opened "${handle.name}" and linked to it`, "success");
    return true;
  } catch (err) {
    if (err.name !== "AbortError") { console.error(err); showToast(err.message || "Couldn't open that file", "error"); }
    return false;
  }
}

export async function reloadFromLinkedFile(silent = false) {
  if (!linkedHandle) return false;
  try {
    if (!(await ensurePermission(linkedHandle, "read"))) {
      showToast("Permission needed — click again and allow access to reload", "error");
      return false;
    }
    const file = await linkedHandle.getFile();
    const doc = JSON.parse(await file.text());
    store.replaceDocument(doc);
    linkedProjectId = store.doc.meta.id;
    lastKnownModified = file.lastModified;
    if (!silent) showToast(`Reloaded latest changes from "${linkedHandle.name}"`, "success");
    return true;
  } catch (err) {
    console.error(err);
    showToast("Couldn't reload the shared file", "error");
    return false;
  }
}

// Piggybacks on the existing debounced autosave — every time the document is
// persisted locally, also write it to the linked file if we still have
// permission (checked silently, never prompts) so a collaborator picking up
// the same file sees the change without any extra step on this end.
store.on("persisted", async () => {
  if (!linkedHandle || linkedProjectId !== store.doc.meta.id) return;
  try {
    if ((await linkedHandle.queryPermission({ mode: "readwrite" })) !== "granted") return;
    await writeHandle(linkedHandle, docToText());
    const file = await linkedHandle.getFile();
    lastKnownModified = file.lastModified;
  } catch (err) {
    console.warn("Auto-write to linked file failed", err);
  }
});

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (!linkedHandle) return;
    try {
      if ((await linkedHandle.queryPermission({ mode: "read" })) !== "granted") return;
      const file = await linkedHandle.getFile();
      if (file.lastModified > lastKnownModified) {
        lastKnownModified = file.lastModified;
        showToast(`"${linkedHandle.name}" has new changes — File ▸ Reload from Shared File to pull them in`, "info", 6000);
      }
    } catch (err) { /* file may be temporarily locked by the syncing app — ignore and retry next tick */ }
  }, 45000);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

export async function unlinkFile() {
  const idToClear = linkedProjectId;
  linkedHandle = null;
  linkedProjectId = null;
  stopPolling();
  if (idToClear) await clearLinkedFileHandle(idToClear);
  linkStatusChanged();
}

export function isLinked() {
  return !!linkedHandle && linkedProjectId === store.doc.meta.id;
}

export function getLinkedFileName() {
  return isLinked() ? linkedHandle.name : null;
}

/**
 * Silently resumes the link for whichever project is open right now (called
 * on boot and whenever the active project changes) — never prompts for
 * permission; if it was revoked, Reload/relink re-requests it. Guards against
 * the project changing again while this is still in flight.
 */
export async function restoreLinkForCurrentProject() {
  stopPolling();
  linkedHandle = null;
  linkedProjectId = null;
  const targetId = store.doc.meta.id;
  const handle = await loadLinkedFileHandle(targetId).catch(() => null);
  if (store.doc.meta.id !== targetId) return; // project changed again while we were looking this up
  if (!handle) { linkStatusChanged(); return; }
  try {
    if ((await handle.queryPermission({ mode: "read" })) === "granted") {
      const file = await handle.getFile();
      if (store.doc.meta.id !== targetId) return;
      linkedHandle = handle;
      linkedProjectId = targetId;
      lastKnownModified = file.lastModified;
      startPolling();
    } else {
      // Permission not currently granted — still show it as linked so the
      // user can see the filename and re-grant via Reload, rather than
      // silently forgetting the link.
      linkedHandle = handle;
      linkedProjectId = targetId;
    }
  } catch (err) {
    linkedHandle = null;
    linkedProjectId = null;
  }
  linkStatusChanged();
}
