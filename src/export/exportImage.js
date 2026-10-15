import { store } from "../store.js";
import { showToast, showProgressToast } from "../components/toast.js";
import { escapeHtml } from "../utils/dom.js";
import { isOpen, statusOf, typeLabel } from "../wfd/comments.js";

function slugify(name) {
  return (name || "wireframe").trim().replace(/[^a-z0-9\-_ ]/gi, "").replace(/\s+/g, "-").toLowerCase() || "wireframe";
}

function nextFrame() {
  // Uses setTimeout rather than requestAnimationFrame: rAF is throttled/suspended
  // by browsers when the tab isn't visible/focused, which would hang export indefinitely.
  return new Promise((resolve) => setTimeout(resolve, 60));
}

async function withExportMode(includeComments, fn) {
  const originalZoom = store.doc.settings.zoom;
  const originalPage = store.doc.currentPageId;
  const originalSelection = [...store.selection];

  store.clearSelection();
  store.setZoom(1);
  document.body.classList.add("exporting");
  // Comment badges are always hidden in export renders now — the sticky notes
  // (added below, when requested) replace them with the actual readable text.
  document.body.classList.add("hide-comments");
  await nextFrame();

  try {
    return await fn();
  } finally {
    document.body.classList.remove("exporting", "hide-comments");
    store.setZoom(originalZoom);
    store.setCurrentPage(originalPage);
    store.setSelection(originalSelection);
  }
}

// Drops a visible sticky note next to each commented visual — same idea as the
// on-canvas comment popover, but flattened into the page so it shows up in the
// exported image/PDF instead of just leaving an unreadable badge icon.
function addStickyNotes(page) {
  const canvasEl = document.getElementById("page-canvas");
  const { width: canvasW, height: canvasH } = store.doc.canvas;
  const noteWidth = 210;
  const notes = [];

  // Only open / in-progress comments go on the export — done ones are counted.
  page.elements
    .filter((el) => !el.hidden && el.comments && el.comments.some(isOpen))
    .forEach((el) => {
      const open = el.comments.filter(isOpen).sort((a, b) => b.createdAt - a.createdAt);
      const done = el.comments.length - open.length;
      const shown = open.slice(0, 3);
      const tags = (c) => [typeLabel(c.type), statusOf(c) === "in-progress" ? "In progress" : "", c.assignee ? `→ ${c.assignee}` : ""].filter(Boolean).join(" · ");

      const note = document.createElement("div");
      note.className = "export-sticky-note";
      note.style.width = `${noteWidth}px`;
      note.innerHTML = `
        <div class="esn-header">🗒 ${open.length} open comment${open.length === 1 ? "" : "s"} — ${escapeHtml(el.name || el.type)}</div>
        ${shown.map((c) => `<div class="esn-item">${tags(c) ? `<div class="esn-tags">${escapeHtml(tags(c))}</div>` : ""}<span class="esn-author">${escapeHtml(c.author)}:</span> ${escapeHtml(c.text)}${c.replies?.length ? ` <span class="esn-more">(${c.replies.length} repl${c.replies.length === 1 ? "y" : "ies"})</span>` : ""}</div>`).join("")}
        ${open.length > shown.length || done ? `<div class="esn-more">${open.length > shown.length ? `+${open.length - shown.length} more open` : ""}${open.length > shown.length && done ? " · " : ""}${done ? `${done} done` : ""}</div>` : ""}
      `;
      // Off-canvas first so we can measure its natural height before placing it.
      note.style.left = "-9999px";
      note.style.top = "0px";
      canvasEl.appendChild(note);
      const noteHeight = note.offsetHeight;

      let left = el.x + el.w + 14;
      if (left + noteWidth > canvasW - 4) left = el.x - noteWidth - 14;
      left = Math.max(4, Math.min(left, canvasW - noteWidth - 4));
      let top = Math.max(4, Math.min(el.y, canvasH - noteHeight - 4));

      note.style.left = `${left}px`;
      note.style.top = `${top}px`;
      notes.push(note);
    });

  return notes;
}

function removeStickyNotes(notes) {
  notes.forEach((n) => n.remove());
}

async function capturePageCanvas(page, withNotes) {
  const target = document.getElementById("page-canvas");
  if (typeof html2canvas !== "function") {
    throw new Error("Export library didn't load — check your connection and reload the page");
  }
  const notes = withNotes ? addStickyNotes(page) : [];
  let timer;
  try {
    // Never let one stuck page hang the whole export (and leave the editor in
    // export mode) — fail with a clear message instead.
    return await Promise.race([
      html2canvas(target, {
        backgroundColor: store.getCurrentPage().background || "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
        imageTimeout: 10000,
      }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`page "${page.name}" took too long to render`)), 60000); }),
    ]);
  } finally {
    clearTimeout(timer);
    removeStickyNotes(notes);
  }
}

export async function exportCurrentPageJPG(includeComments = false) {
  const progress = showProgressToast("Preparing export…");
  try {
    const page = store.getCurrentPage();
    const canvas = await withExportMode(includeComments, () => capturePageCanvas(page, includeComments));
    progress.update("Saving JPG…");
    const url = canvas.toDataURL("image/jpeg", 0.92);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(store.doc.meta.title)}-${slugify(page.name)}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    progress.done("Page exported as JPG", "success");
  } catch (err) {
    console.error(err);
    progress.done(`JPG export failed: ${err.message || "unknown error"}`, "error", 4000);
  }
}

export async function exportPagesPDF(includeComments = false, pageIds = null) {
  const pagesToExport = pageIds ? store.doc.pages.filter((p) => pageIds.includes(p.id)) : store.doc.pages;
  const total = pagesToExport.length;
  if (!total) {
    showToast("Pick at least one page to export", "error");
    return;
  }
  const progress = showProgressToast(`Preparing export of ${total} page${total === 1 ? "" : "s"}…`);
  try {
    if (!window.jspdf || typeof window.jspdf.jsPDF !== "function") {
      throw new Error("Export library didn't load — check your connection and reload the page");
    }
    const { jsPDF } = window.jspdf;
    const { width, height } = store.doc.canvas;
    const orientation = width >= height ? "landscape" : "portrait";
    let pdf = null;

    await withExportMode(includeComments, async () => {
      for (let i = 0; i < pagesToExport.length; i++) {
        const page = pagesToExport[i];
        progress.update(`Rendering page ${i + 1} of ${total}: "${page.name}"…`);
        store.setCurrentPage(page.id);
        await nextFrame();
        const canvas = await capturePageCanvas(page, includeComments);
        const imgData = canvas.toDataURL("image/jpeg", 0.92);
        if (!pdf) {
          pdf = new jsPDF({ orientation, unit: "px", format: [width, height], compress: true });
        } else {
          pdf.addPage([width, height], orientation);
        }
        pdf.addImage(imgData, "JPEG", 0, 0, width, height);
      }
    });

    progress.update("Saving PDF…");
    pdf.save(`${slugify(store.doc.meta.title)}.pdf`);
    progress.done(`Exported ${total}-page PDF`, "success");
  } catch (err) {
    console.error(err);
    progress.done(`PDF export failed: ${err.message || "unknown error"}`, "error", 4000);
  }
}

// Kept for compatibility — exports every page.
export async function exportAllPagesPDF(includeComments = false) {
  return exportPagesPDF(includeComments, null);
}

export function isClipboardImageSupported() {
  return !!(navigator.clipboard && typeof navigator.clipboard.write === "function" && typeof ClipboardItem !== "undefined");
}

// Copies a page straight to the system clipboard as a PNG so it can be pasted
// (Ctrl+V) directly into Google Slides, Docs, etc. — no save dialog, no file to drag in.
export async function copyPageToClipboard(includeComments = false, pageId = null) {
  if (!isClipboardImageSupported()) {
    showToast("Copying images isn't supported in this browser — use Chrome or Edge", "error", 4000);
    return false;
  }
  const progress = showProgressToast("Copying page…");
  const targetPage = pageId ? store.doc.pages.find((p) => p.id === pageId) : store.getCurrentPage();
  if (!targetPage) {
    progress.done("Copy failed: page not found", "error", 4000);
    return false;
  }

  // Rendering the page (html2canvas) takes long enough that by the time it
  // finishes, the browser may have expired the click's "user activation" —
  // clipboard.write() then silently fails and the OS clipboard is left
  // untouched (pasting whatever was copied before). To avoid that, we hand
  // clipboard.write() a *pending* Promise<Blob> and call it immediately,
  // synchronously, inside the gesture — before any awaiting happens.
  const blobPromise = (async () => {
    const canvas = await withExportMode(includeComments, async () => {
      store.setCurrentPage(targetPage.id);
      await nextFrame();
      return capturePageCanvas(targetPage, includeComments);
    });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not render image");
    return blob;
  })();

  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]);
    progress.done(`"${targetPage.name}" copied — switch to Slides and press Ctrl+V`, "success", 3000);
    return true;
  } catch (err) {
    console.error(err);
    progress.done(`Copy failed: ${err.message || "unknown error"} — try again, then paste right away`, "error", 4500);
    return false;
  }
}
