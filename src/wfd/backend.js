// File access for .wfd projects. Two implementations behind one interface:
//  - native:  the installed desktop app (Electron preload exposes window.wfdNative);
//             refs are file paths, changes are watched by the OS.
//  - browser: Chrome/Edge File System Access API; refs are file handles,
//             changes are detected by polling the file's modified time.
// A "ref" is whatever identifies the file for that backend; it's remembered
// per project in IndexedDB so the project reopens linked to its file.

import { saveLinkedFileHandle, loadLinkedFileHandle, clearLinkedFileHandle } from "../persistence.js";
import { FILE_EXTENSION } from "./format.js";

const native = typeof window !== "undefined" ? window.wfdNative : null;

const PICKER_TYPES = [{ description: "Wireframe project", accept: { "application/octet-stream": [FILE_EXTENSION] } }];
const BROWSER_POLL_MS = 4000;

const nativeBackend = {
  kind: "native",
  supported: true,
  async open() {
    return native.openDialog();
  },
  async saveAs(suggestedName, text) {
    return native.saveDialog(suggestedName, text);
  },
  async read(ref) {
    return native.read(ref);
  },
  async write(ref, text) {
    return native.write(ref, text);
  },
  async stat(ref) {
    return native.stat(ref);
  },
  async hasPermission() {
    return true;
  },
  async requestPermission() {
    return true;
  },
  watch(ref, onChange) {
    return native.watch(ref, onChange);
  },
  async listConflictCopies(ref) {
    return native.listConflictCopies(ref);
  },
  async trash(ref) {
    return native.trash(ref);
  },
  nameOf(ref) {
    return String(ref).split(/[\\/]/).pop();
  },
  onOpenFileRequest(cb) {
    native.onOpenFile(cb);
  },
  async initialFile() {
    return native.getInitialFile();
  },
};

const browserBackend = {
  kind: "browser",
  supported: typeof window !== "undefined" && typeof window.showOpenFilePicker === "function",
  async open() {
    const [handle] = await window.showOpenFilePicker({ types: PICKER_TYPES, excludeAcceptAllOption: false });
    const file = await handle.getFile();
    return { ref: handle, name: handle.name, text: await file.text(), mtime: file.lastModified };
  },
  async saveAs(suggestedName, text) {
    const handle = await window.showSaveFilePicker({ types: PICKER_TYPES, suggestedName });
    const { mtime } = await this.write(handle, text);
    return { ref: handle, name: handle.name, mtime };
  },
  async read(handle) {
    const file = await handle.getFile();
    return { text: await file.text(), mtime: file.lastModified };
  },
  async write(handle, text) {
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    const file = await handle.getFile();
    return { mtime: file.lastModified };
  },
  async stat(handle) {
    try {
      const file = await handle.getFile();
      return { mtime: file.lastModified };
    } catch (err) {
      return null;
    }
  },
  async hasPermission(handle) {
    return (await handle.queryPermission({ mode: "readwrite" })) === "granted";
  },
  async requestPermission(handle) {
    return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
  },
  watch(handle, onChange) {
    let last = null;
    const timer = setInterval(async () => {
      try {
        if ((await handle.queryPermission({ mode: "read" })) !== "granted") return;
        const file = await handle.getFile();
        // Report on the first tick too: a save that landed between linking and
        // this first check would otherwise become the baseline and be missed.
        // (The caller compares against what it last synced, so this is cheap.)
        if (file.lastModified !== last) onChange({ mtime: file.lastModified });
        last = file.lastModified;
      } catch (err) { /* file briefly locked by OneDrive — try again next tick */ }
    }, BROWSER_POLL_MS);
    return () => clearInterval(timer);
  },
  async listConflictCopies() {
    return []; // the browser can't list the folder the file lives in
  },
  async trash() {},
  nameOf(handle) {
    return handle.name;
  },
  onOpenFileRequest() {},
  async initialFile() {
    return null;
  },
};

export const backend = native ? nativeBackend : browserBackend;

export function rememberRef(projectId, ref) {
  return saveLinkedFileHandle(projectId, ref);
}

export function recallRef(projectId) {
  return loadLinkedFileHandle(projectId);
}

export function forgetRef(projectId) {
  return clearLinkedFileHandle(projectId);
}
