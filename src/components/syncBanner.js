import { store } from "../store.js";
import { h, formatTime } from "../utils/dom.js";
import { getRemoteChanges, dismissRemoteChanges, mergeConflictCopy, ignoreConflictCopy, getFileState, syncNow, saveProjectFileAs, reconnectProjectFile } from "../wfd/projectFile.js";

let hostEl;

export function initSyncBanner() {
  hostEl = document.getElementById("sync-banner");
  window.addEventListener("wfd:file-change", render);
  render();
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function render() {
  hostEl.innerHTML = "";
  const { summary, conflictCopies } = getRemoteChanges();

  const file = getFileState();
  if (file.linked && file.status === "error") {
    hostEl.appendChild(
      h("div", { class: "sync-banner danger" }, [
        h("span", { class: "sync-banner-text" }, [
          h("strong", {}, "Your changes aren't reaching the project file. "),
          `${file.error}. They're kept safely on this computer until it's back.`,
        ]),
        h("button", { class: "btn sm", onclick: () => syncNow() }, "Try again"),
        h("button", { class: "btn sm primary", onclick: () => saveProjectFileAs() }, "Save as new file…"),
      ])
    );
  } else if (file.linked && file.status === "needs-permission") {
    hostEl.appendChild(
      h("div", { class: "sync-banner warn" }, [
        h("span", { class: "sync-banner-text" }, [h("strong", {}, "Allow access to keep saving. "), `The browser needs your permission again to save to "${file.name}".`]),
        h("button", { class: "btn sm primary", onclick: () => reconnectProjectFile() }, "Allow access"),
      ])
    );
  }

  conflictCopies.forEach((copy) => {
    const bar = h("div", { class: "sync-banner warn" }, [
      h("span", { class: "sync-banner-text" }, [
        h("strong", {}, "OneDrive kept a second copy: "),
        `"${copy.name}" — someone saved at the same time as you.`,
      ]),
      h("button", { class: "btn sm", onclick: () => ignoreConflictCopy(copy) }, "Ignore"),
      h("button", { class: "btn sm primary", onclick: () => mergeConflictCopy(copy) }, "Merge it in"),
    ]);
    hostEl.appendChild(bar);
  });

  if (!summary) return;

  const parts = [];
  if (summary.newPages) parts.push(plural(summary.newPages, "new page"));
  if (summary.added) parts.push(`${summary.added} added`);
  if (summary.modified) parts.push(`${summary.modified} changed`);
  if (summary.removed) parts.push(`${summary.removed} removed`);
  if (summary.newComments) parts.push(plural(summary.newComments, "new comment"));
  if (summary.updatedComments) parts.push(`${plural(summary.updatedComments, "comment")} updated`);

  const pageLinks = [...summary.pages.entries()].map(([pageId, p]) =>
    h("button", { class: "sync-page-link", "data-tip": "Go to this page", onclick: () => store.setCurrentPage(pageId) }, p.count ? `${p.name} (${p.count})` : p.name)
  );

  const bar = h("div", { class: "sync-banner" }, [
    h("span", { class: "sync-banner-text" }, [
      h("strong", {}, `Updated by ${summary.by}`),
      ` · ${formatTime(summary.at)}`,
      parts.length ? ` — ${parts.join(", ")}` : "",
      pageLinks.length ? h("span", { class: "sync-banner-pages" }, [" · see ", ...pageLinks]) : "",
    ]),
    h("span", { class: "sync-legend" }, [
      h("span", { class: "sync-dot added" }), "added",
      h("span", { class: "sync-dot modified" }), "changed",
      h("span", { class: "sync-dot commented" }), "new comment",
    ]),
    summary.forMe
      ? h("button", { class: "btn sm primary", onclick: () => window.dispatchEvent(new CustomEvent("wfd:show-my-comments")) }, `${plural(summary.forMe, "comment")} for you`)
      : null,
    h("button", { class: "btn sm", onclick: () => dismissRemoteChanges() }, "Mark as seen"),
  ]);
  hostEl.appendChild(bar);

  if (summary.conflicts.length) {
    const unique = [...new Set(summary.conflicts)];
    hostEl.appendChild(
      h("div", { class: "sync-banner warn" }, [
        h("span", { class: "sync-banner-text" }, [
          h("strong", {}, "You both edited the same thing: "),
          `${unique.slice(0, 4).join(", ")}${unique.length > 4 ? ` and ${unique.length - 4} more` : ""}. Your version was kept — check these.`,
        ]),
      ])
    );
  }
}
