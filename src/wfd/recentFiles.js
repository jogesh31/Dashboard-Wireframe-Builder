// The "Recent projects" list on the start screen: the .wfd files this user
// opened or saved, newest first, with a small preview of the first page.
// Kept on this computer only.

import { getMetaValue, putMetaValue } from "../persistence.js";

const KEY = "recent-files";
const MAX = 12;

export async function getRecentFiles() {
  const list = await getMetaValue(KEY);
  return Array.isArray(list) ? list : [];
}

export async function addRecentFile({ ref, name, doc }) {
  const list = (await getRecentFiles()).filter((r) => r.projectId !== doc.meta.id);
  const first = doc.pages[0];
  list.unshift({
    ref,
    name,
    projectId: doc.meta.id,
    title: doc.meta.title,
    pageCount: doc.pages.length,
    canvas: doc.canvas,
    thumbnailPage: first ? { background: first.background, elements: first.elements.map(({ x, y, w, h, hidden, style }) => ({ x, y, w, h, hidden, style: { background: style?.background, borderRadius: style?.borderRadius } })) } : null,
    openedAt: Date.now(),
  });
  await putMetaValue(KEY, list.slice(0, MAX));
}

/** One-time fill for projects that were linked to a file before this list existed. */
export async function seedRecentFiles(entries) {
  const sorted = entries.slice().sort((a, b) => b.openedAt - a.openedAt).slice(0, MAX);
  await putMetaValue(KEY, sorted);
  return sorted;
}

export async function removeRecentFile(projectId) {
  await putMetaValue(KEY, (await getRecentFiles()).filter((r) => r.projectId !== projectId));
}
