import { store } from "../store.js";
import { showToast } from "../components/toast.js";

function slugify(name) {
  return (name || "wireframe").trim().replace(/[^a-z0-9\-_ ]/gi, "").replace(/\s+/g, "-").toLowerCase() || "wireframe";
}

export function downloadProjectJSON() {
  const json = JSON.stringify(store.doc, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(store.doc.meta.title)}.wfd.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Project saved to file", "success");
}

export function loadProjectFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = (e) => {
      try {
        const doc = JSON.parse(e.target.result);
        if (!doc || !doc.pages) throw new Error("This doesn't look like a valid wireframe project file");
        store.replaceDocument(doc);
        showToast(`Opened "${doc.meta?.title || file.name}"`, "success");
        resolve(doc);
      } catch (err) {
        showToast(err.message || "Failed to open project", "error");
        reject(err);
      }
    };
    reader.readAsText(file);
  });
}
