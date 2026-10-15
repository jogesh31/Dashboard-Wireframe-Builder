const DB_NAME = "wireframe-designer-db";
const DB_VERSION = 3;
const PROJECTS_STORE = "projects";
const META_STORE = "meta";
const LEGACY_STORE = "autosave";
const LEGACY_KEY = "current-document";
const LAST_ACTIVE_KEY = "last-active-project-id";
const FILE_HANDLES_STORE = "fileHandles";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LEGACY_STORE)) {
        db.createObjectStore(LEGACY_STORE);
      }
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        db.createObjectStore(PROJECTS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
      if (!db.objectStoreNames.contains(FILE_HANDLES_STORE)) {
        db.createObjectStore(FILE_HANDLES_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise = null;
function getDb() {
  if (!dbPromise) dbPromise = openDb().catch((err) => {
    console.warn("IndexedDB unavailable", err);
    dbPromise = null;
    return null;
  });
  return dbPromise;
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------------- multi-project API ----------------

export async function saveProject(doc) {
  const db = await getDb();
  const entry = {
    id: doc.meta.id,
    title: doc.meta.title,
    updatedAt: doc.meta.updatedAt || Date.now(),
    createdAt: doc.meta.createdAt || Date.now(),
    pageCount: doc.pages.length,
    thumbnailPage: doc.pages[0] ? { elements: doc.pages[0].elements, background: doc.pages[0].background } : null,
    canvas: doc.canvas,
    doc,
  };
  if (db) {
    try {
      await reqToPromise(tx(db, PROJECTS_STORE, "readwrite").put(entry));
      await reqToPromise(tx(db, META_STORE, "readwrite").put(doc.meta.id, LAST_ACTIVE_KEY));
      return true;
    } catch (err) {
      console.warn("IndexedDB project save failed", err);
    }
  }
  try {
    const all = JSON.parse(localStorage.getItem("wfd-projects") || "{}");
    all[doc.meta.id] = entry;
    localStorage.setItem("wfd-projects", JSON.stringify(all));
    localStorage.setItem("wfd-last-active", doc.meta.id);
    return true;
  } catch (err) {
    console.error("Autosave failed completely", err);
    return false;
  }
}

export async function loadProject(id) {
  const db = await getDb();
  if (db) {
    try {
      const entry = await reqToPromise(tx(db, PROJECTS_STORE, "readonly").get(id));
      if (entry) return entry.doc;
    } catch (err) {
      console.warn("IndexedDB project load failed", err);
    }
  }
  const all = JSON.parse(localStorage.getItem("wfd-projects") || "{}");
  return all[id]?.doc || null;
}

export async function listProjects() {
  const db = await getDb();
  let entries = [];
  if (db) {
    try {
      entries = await reqToPromise(tx(db, PROJECTS_STORE, "readonly").getAll());
    } catch (err) {
      console.warn("IndexedDB list failed", err);
    }
  }
  if (!entries.length) {
    const all = JSON.parse(localStorage.getItem("wfd-projects") || "{}");
    entries = Object.values(all);
  }
  return entries
    .map((e) => ({ id: e.id, title: e.title, updatedAt: e.updatedAt, createdAt: e.createdAt, pageCount: e.pageCount, thumbnailPage: e.thumbnailPage, canvas: e.canvas }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(id) {
  const db = await getDb();
  if (db) {
    try {
      await reqToPromise(tx(db, PROJECTS_STORE, "readwrite").delete(id));
    } catch (err) { /* ignore */ }
  }
  try {
    const all = JSON.parse(localStorage.getItem("wfd-projects") || "{}");
    delete all[id];
    localStorage.setItem("wfd-projects", JSON.stringify(all));
  } catch (err) { /* ignore */ }
}

export async function getLastActiveProjectId() {
  const db = await getDb();
  if (db) {
    try {
      const id = await reqToPromise(tx(db, META_STORE, "readonly").get(LAST_ACTIVE_KEY));
      if (id) return id;
    } catch (err) { /* ignore */ }
  }
  return localStorage.getItem("wfd-last-active");
}

export async function setLastActiveProjectId(id) {
  const db = await getDb();
  if (db) {
    try {
      await reqToPromise(tx(db, META_STORE, "readwrite").put(id, LAST_ACTIVE_KEY));
      return;
    } catch (err) { /* ignore */ }
  }
  localStorage.setItem("wfd-last-active", id);
}

// ---------------- linked shared-file handle (File System Access API) ----------------
// Lets a project stay "linked" to a file on disk (e.g. inside a synced OneDrive/
// Google Drive folder) across sessions, so autosave can also write straight to
// it and the user can pull in a collaborator's changes without re-picking the file.

export async function saveLinkedFileHandle(projectId, handle) {
  const db = await getDb();
  if (!db) return false;
  try {
    await reqToPromise(tx(db, FILE_HANDLES_STORE, "readwrite").put(handle, projectId));
    return true;
  } catch (err) {
    console.warn("Could not remember the linked file", err);
    return false;
  }
}

export async function loadLinkedFileHandle(projectId) {
  const db = await getDb();
  if (!db) return null;
  try {
    return (await reqToPromise(tx(db, FILE_HANDLES_STORE, "readonly").get(projectId))) || null;
  } catch (err) {
    return null;
  }
}

export async function clearLinkedFileHandle(projectId) {
  const db = await getDb();
  if (!db) return;
  try {
    await reqToPromise(tx(db, FILE_HANDLES_STORE, "readwrite").delete(projectId));
  } catch (err) { /* ignore */ }
}

// ---------------- last-seen snapshot of a project file ----------------
// The shared content as this user last saw it, kept only on this computer, so
// reopening a project can highlight what other people changed in between.

export async function saveSeenSnapshot(projectId, content) {
  const db = await getDb();
  if (!db) return;
  try {
    await reqToPromise(tx(db, META_STORE, "readwrite").put(content, `seen:${projectId}`));
  } catch (err) { /* ignore — only affects change highlighting */ }
}

export async function loadSeenSnapshot(projectId) {
  const db = await getDb();
  if (!db) return null;
  try {
    return (await reqToPromise(tx(db, META_STORE, "readonly").get(`seen:${projectId}`))) || null;
  } catch (err) {
    return null;
  }
}

// ---------------- small key/value settings ----------------

export async function getMetaValue(key) {
  const db = await getDb();
  if (!db) return null;
  try {
    return (await reqToPromise(tx(db, META_STORE, "readonly").get(key))) ?? null;
  } catch (err) {
    return null;
  }
}

export async function putMetaValue(key, value) {
  const db = await getDb();
  if (!db) return;
  try {
    await reqToPromise(tx(db, META_STORE, "readwrite").put(value, key));
  } catch (err) { /* ignore */ }
}

// ---------------- legacy single-slot migration ----------------

async function loadLegacyDocument() {
  try {
    const db = await getDb();
    if (db) {
      const json = await reqToPromise(tx(db, LEGACY_STORE, "readonly").get(LEGACY_KEY));
      if (json) return JSON.parse(json);
    }
  } catch (err) { /* ignore */ }
  const raw = localStorage.getItem(LEGACY_KEY);
  return raw ? JSON.parse(raw) : null;
}

async function clearLegacyDocument() {
  try {
    const db = await getDb();
    if (db) await reqToPromise(tx(db, LEGACY_STORE, "readwrite").delete(LEGACY_KEY));
  } catch (err) { /* ignore */ }
  localStorage.removeItem(LEGACY_KEY);
}

/**
 * Loads the document to open on startup: the last-active project if one exists,
 * otherwise migrates an old single-slot autosave (from before multi-project
 * support) into the new store, otherwise null (caller creates a blank doc).
 */
export async function loadStartupDocument() {
  const lastId = await getLastActiveProjectId();
  if (lastId) {
    const doc = await loadProject(lastId);
    if (doc) return doc;
  }
  const legacy = await loadLegacyDocument();
  if (legacy) {
    await saveProject(legacy);
    await clearLegacyDocument();
    return legacy;
  }
  const projects = await listProjects();
  if (projects.length) {
    return loadProject(projects[0].id);
  }
  return null;
}
