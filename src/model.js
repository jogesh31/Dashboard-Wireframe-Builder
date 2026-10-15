import { uid } from "./utils/uuid.js";

export const DOC_VERSION = 1;

export const DEFAULT_CANVAS = { width: 1280, height: 720 };

export function createEmptyDocument(title = "Untitled Wireframe") {
  const page = createPage("Page 1");
  return {
    version: DOC_VERSION,
    meta: {
      id: uid("doc"),
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    canvas: { ...DEFAULT_CANVAS },
    pages: [page],
    currentPageId: page.id,
    schema: { tables: [] },
    members: [], // everyone who has opened the project: { id: email, email, name, addedAt }
    settings: {
      zoom: 1,
      showGrid: true,
      snapToGrid: true,
      gridSize: 10,
      showRulers: true,
    },
  };
}

export function createPage(name) {
  return {
    id: uid("page"),
    name,
    background: "#ffffff",
    elements: [],
  };
}

export function nextZIndex(page) {
  if (!page.elements.length) return 1;
  return Math.max(...page.elements.map((e) => e.zIndex || 0)) + 1;
}

const BASE_STYLE = {
  background: "#ffffff",
  borderColor: "#e1dfdd",
  borderWidth: 1,
  borderStyle: "solid",
  borderRadius: 4,
  opacity: 100,
  fontFamily: "Segoe UI",
  fontSize: 13,
  fontWeight: "400",
  textAlign: "left",
  color: "#252423",
  shadow: "none",
};

export function createElement(type, def, x, y, page) {
  const w = def.defaultW || 200;
  const h = def.defaultH || 140;
  const base = {
    id: uid("el"),
    type,
    family: def.family,
    category: def.category,
    x: Math.round(x),
    y: Math.round(y),
    w,
    h,
    rotation: 0,
    zIndex: nextZIndex(page),
    name: def.label,
    locked: false,
    hidden: false,
    groupId: null,
    style: { ...BASE_STYLE, ...(def.style || {}) },
    content: { ...(def.content ? def.content : {}), title: def.content?.title ?? def.label },
    comments: [],
  };
  return base;
}

export function cloneElement(el, offset = 16) {
  return {
    ...structuredCloneSafe(el),
    id: uid("el"),
    x: el.x + offset,
    y: el.y + offset,
    comments: [],
  };
}

export function structuredCloneSafe(obj) {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}
