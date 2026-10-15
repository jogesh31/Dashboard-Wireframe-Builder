import { store } from "../store.js";
import { showToast } from "../components/toast.js";
import { serializeProject, parseProject, FILE_EXTENSION } from "../wfd/format.js";
import { getIdentity } from "../wfd/identity.js";
import { relinkForCurrentProject } from "../wfd/projectFile.js";

function safeFileName(name) {
  return (name || "Wireframe").replace(/[\\/:*?"<>|]+/g, "").trim() || "Wireframe";
}

/** Downloads a one-off copy of the project. It isn't linked — later edits don't go into it. */
export function downloadProjectJSON() {
  const blob = new Blob([serializeProject(store.doc, getIdentity().name, getIdentity().email)], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFileName(store.doc.meta.title)}${FILE_EXTENSION}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Copy downloaded", "success");
}

/** Imports a project file as a local, unlinked copy (also reads old .wfd.json exports). */
export function loadProjectFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = async (e) => {
      try {
        const { doc } = parseProject(e.target.result);
        await store.forceSaveNow();
        store.replaceDocument(doc);
        await relinkForCurrentProject();
        showToast(`Imported "${doc.meta?.title || file.name}"`, "success");
        resolve(doc);
      } catch (err) {
        showToast(err.message || "Failed to open project", "error");
        reject(err);
      }
    };
    reader.readAsText(file);
  });
}
