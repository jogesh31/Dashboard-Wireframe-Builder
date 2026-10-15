// The only bridge between the app page and the computer: a small, fixed set
// of file operations for .wfd projects. The page has no other Node access.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("wfdNative", {
  openDialog: () => ipcRenderer.invoke("wfd:open-dialog"),
  saveDialog: (suggestedName, text) => ipcRenderer.invoke("wfd:save-dialog", suggestedName, text),
  read: (ref) => ipcRenderer.invoke("wfd:read", ref),
  write: (ref, text) => ipcRenderer.invoke("wfd:write", ref, text),
  stat: (ref) => ipcRenderer.invoke("wfd:stat", ref),
  listConflictCopies: (ref) => ipcRenderer.invoke("wfd:list-conflict-copies", ref),
  trash: (ref) => ipcRenderer.invoke("wfd:trash", ref),
  getInitialFile: () => ipcRenderer.invoke("wfd:get-initial-file"),
  detectIdentities: () => ipcRenderer.invoke("wfd:detect-identities"),

  watch(ref, onChange) {
    const listener = (_e, info) => {
      if (info.ref === ref) onChange(info);
    };
    ipcRenderer.on("wfd:file-changed", listener);
    ipcRenderer.send("wfd:watch", ref);
    return () => {
      ipcRenderer.removeListener("wfd:file-changed", listener);
      ipcRenderer.send("wfd:unwatch", ref);
    };
  },

  onOpenFile(cb) {
    ipcRenderer.on("wfd:open-file", (_e, picked) => cb(picked));
  },
  onBeforeClose(cb) {
    ipcRenderer.on("wfd:before-close", () => cb());
  },
  readyToClose: () => ipcRenderer.send("wfd:ready-to-close"),
});
