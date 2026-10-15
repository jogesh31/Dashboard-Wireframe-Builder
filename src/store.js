import { EventEmitter } from "./utils/events.js";
import { debounce } from "./utils/dom.js";
import { createEmptyDocument, createPage, createElement, cloneElement, nextZIndex, structuredCloneSafe } from "./model.js";
import { getVisualDef } from "./visualLibrary.js";
import { bounds, findNonOverlappingPosition, clampToBounds } from "./utils/geometry.js";
import { saveProject, loadStartupDocument, listProjects, loadProject, deleteProject, setLastActiveProjectId } from "./persistence.js";
import { uid } from "./utils/uuid.js";
import { getIdentity } from "./wfd/identity.js";
import { planGenerateLayout, generateStartY } from "./generateLayout.js";
import { normalizeComment, extractMentions, knownPeople, rememberPeople } from "./wfd/comments.js";

const HISTORY_LIMIT = 80;

class Store extends EventEmitter {
  constructor() {
    super();
    this.doc = createEmptyDocument();
    this.selection = [];
    this.ui = {
      tool: "select",
      leftTab: "pages",
      rightTab: "properties",
      clipboard: null,
      autosaveState: "saved", // saved | saving
      draggingLibraryType: null,
    };
    this._undoStack = [];
    this._redoStack = [];
    this._autosaveDebounced = debounce(() => this._persist(), 900);
    this._historyDebounceTimer = null;
    this._pendingHistorySnapshot = null;
    this._ready = false;
  }

  async init() {
    const loaded = await loadStartupDocument().catch(() => null);
    if (loaded && loaded.pages && loaded.pages.length) {
      this.doc = migrateDoc(loaded);
    }
    this._ready = true;
    this.emit("doc:change", this.doc);
    this.emit("pages:change", this.doc);
    this.emit("page:switch", this.getCurrentPage());
    this.emit("schema:change", this.doc.schema);
    this.emit("selection:change", this.selection);
  }

  // ---------------- persistence ----------------
  _touch() {
    this.doc.meta.updatedAt = Date.now();
    this.ui.autosaveState = "saving";
    this.emit("ui:change", this.ui);
    this._autosaveDebounced();
  }

  async _persist() {
    await saveProject(this.doc);
    this.ui.autosaveState = "saved";
    this.emit("ui:change", this.ui);
    this.emit("persisted", this.doc);
  }

  async forceSaveNow() {
    await this._persist();
  }

  async listProjects() {
    return listProjects();
  }

  async openProject(id) {
    const doc = await loadProject(id);
    if (!doc) return false;
    this.replaceDocument(doc);
    await setLastActiveProjectId(id);
    return true;
  }

  async deleteProjectById(id) {
    await deleteProject(id);
    if (id === this.doc.meta.id) {
      this.newDocument();
    }
    this.emit("projects:change");
  }

  // ---------------- history ----------------
  _snapshot() {
    return structuredCloneSafe({ doc: this.doc, selection: this.selection });
  }

  pushHistory() {
    this._undoStack.push(this._snapshot());
    if (this._undoStack.length > HISTORY_LIMIT) this._undoStack.shift();
    this._redoStack = [];
    this.emit("history:change", this.historyState());
  }

  historyState() {
    return { canUndo: this._undoStack.length > 0, canRedo: this._redoStack.length > 0 };
  }

  undo() {
    if (!this._undoStack.length) return;
    this._redoStack.push(this._snapshot());
    const prev = this._undoStack.pop();
    this.doc = prev.doc;
    this.selection = prev.selection.filter((id) => this._elementExists(id));
    this._touch();
    this.emit("doc:change", this.doc);
    this.emit("pages:change", this.doc);
    this.emit("page:switch", this.getCurrentPage());
    this.emit("elements:change", this.getCurrentPage());
    this.emit("selection:change", this.selection);
    this.emit("history:change", this.historyState());
  }

  redo() {
    if (!this._redoStack.length) return;
    this._undoStack.push(this._snapshot());
    const next = this._redoStack.pop();
    this.doc = next.doc;
    this.selection = next.selection.filter((id) => this._elementExists(id));
    this._touch();
    this.emit("doc:change", this.doc);
    this.emit("pages:change", this.doc);
    this.emit("page:switch", this.getCurrentPage());
    this.emit("elements:change", this.getCurrentPage());
    this.emit("selection:change", this.selection);
    this.emit("history:change", this.historyState());
  }

  _elementExists(id) {
    return this.doc.pages.some((p) => p.elements.some((e) => e.id === id));
  }

  // ---------------- pages ----------------
  getCurrentPage() {
    return this.doc.pages.find((p) => p.id === this.doc.currentPageId) || this.doc.pages[0];
  }

  getPage(id) {
    return this.doc.pages.find((p) => p.id === id);
  }

  setCurrentPage(pageId) {
    if (this.doc.currentPageId === pageId) return;
    this.doc.currentPageId = pageId;
    this.selection = [];
    this._touch();
    this.emit("page:switch", this.getCurrentPage());
    this.emit("pages:change", this.doc);
    this.emit("selection:change", this.selection);
  }

  addPage(afterPageId) {
    this.pushHistory();
    const page = createPage(`Page ${this.doc.pages.length + 1}`);
    const idx = afterPageId ? this.doc.pages.findIndex((p) => p.id === afterPageId) : this.doc.pages.length - 1;
    this.doc.pages.splice(idx + 1, 0, page);
    this.doc.currentPageId = page.id;
    this.selection = [];
    this._touch();
    this.emit("pages:change", this.doc);
    this.emit("page:switch", this.getCurrentPage());
    this.emit("selection:change", this.selection);
    return page;
  }

  deletePage(pageId) {
    if (this.doc.pages.length <= 1) return false;
    this.pushHistory();
    const idx = this.doc.pages.findIndex((p) => p.id === pageId);
    this.doc.pages.splice(idx, 1);
    if (this.doc.currentPageId === pageId) {
      const newIdx = Math.max(0, idx - 1);
      this.doc.currentPageId = this.doc.pages[newIdx].id;
      this.selection = [];
    }
    this._touch();
    this.emit("pages:change", this.doc);
    this.emit("page:switch", this.getCurrentPage());
    this.emit("selection:change", this.selection);
    return true;
  }

  duplicatePage(pageId) {
    this.pushHistory();
    const page = this.getPage(pageId);
    if (!page) return;
    const clone = structuredCloneSafe(page);
    clone.id = uid("page");
    clone.name = `${page.name} Copy`;
    // Same as duplicating a single visual: the copy starts without the
    // original's review comments, and grouped visuals stay grouped together
    // (with a new group id, so they don't join the original page's group).
    const groupIdMap = new Map();
    clone.elements.forEach((e) => {
      e.id = uid("el");
      e.comments = [];
      if (e.groupId) {
        if (!groupIdMap.has(e.groupId)) groupIdMap.set(e.groupId, uid("group"));
        e.groupId = groupIdMap.get(e.groupId);
      }
    });
    const idx = this.doc.pages.findIndex((p) => p.id === pageId);
    this.doc.pages.splice(idx + 1, 0, clone);
    this.doc.currentPageId = clone.id;
    this.selection = [];
    this._touch();
    this.emit("pages:change", this.doc);
    this.emit("page:switch", this.getCurrentPage());
    this.emit("selection:change", this.selection);
    return clone;
  }

  renamePage(pageId, name) {
    const page = this.getPage(pageId);
    if (!page || !name.trim()) return;
    this.pushHistory();
    page.name = name.trim();
    this._touch();
    this.emit("pages:change", this.doc);
  }

  reorderPages(orderedIds) {
    this.pushHistory();
    const map = new Map(this.doc.pages.map((p) => [p.id, p]));
    this.doc.pages = orderedIds.map((id) => map.get(id)).filter(Boolean);
    this._touch();
    this.emit("pages:change", this.doc);
  }

  /**
   * Bulk-creates a mix of visual types in one action, as one undo step.
   * `sections` = [{ key, items: [{ type, label }], layout: { perRow, pattern } }]
   * (a plain array of item arrays still works, laid out automatically).
   * Placement comes from planGenerateLayout — rows span the page with equal
   * gutters, items in a row share one height, and each section starts on a
   * new row below the previous one. `label`, if given, becomes that visual's
   * title / field name. The page grows taller if needed so nothing is clipped.
   */
  generateElements(sections) {
    const normalized = sections.map((s, i) => (Array.isArray(s) ? { key: `s${i}`, items: s, layout: { perRow: "auto" } } : s));
    if (!normalized.some((s) => s.items.length)) return [];
    const page = this.getCurrentPage();
    this.pushHistory();

    const plan = planGenerateLayout(normalized, {
      canvasWidth: this.doc.canvas.width,
      canvasHeight: this.doc.canvas.height,
      startY: generateStartY(page),
    });

    const totalPerType = {};
    plan.boxes.forEach(({ type }) => { totalPerType[type] = (totalPerType[type] || 0) + 1; });
    const seenPerType = {};
    const labelFieldByFamily = { chart: "title", cardstat: "title", table: "title", map: "title", filter: "category", text: "text", button: "text", sectionHeader: "text", groupContainer: "text" };

    const created = [];
    plan.boxes.forEach(({ type, label, def, x, y, w, h }) => {
      seenPerType[type] = (seenPerType[type] || 0) + 1;
      const suffix = totalPerType[type] > 1 ? ` ${seenPerType[type]}` : "";
      const el = createElement(type, def, x, y, page);
      el.w = w;
      el.h = h;
      el.name = `${def.label}${suffix}`;
      const labelField = labelFieldByFamily[def.family];
      const customLabel = label && label.trim();
      if (labelField) {
        if (customLabel) el.content[labelField] = customLabel;
        else if (el.content[labelField] && suffix) el.content[labelField] = `${el.content[labelField]}${suffix}`;
      }
      el.zIndex = nextZIndex(page);
      page.elements.push(el);
      created.push(el);
    });

    if (plan.neededHeight > this.doc.canvas.height) {
      this.doc.canvas.height = plan.neededHeight;
    }

    // Belt-and-braces: guarantee nothing generated can ever sit outside the page,
    // regardless of any rounding edge case in the layout math above.
    const finalW = this.doc.canvas.width;
    const finalH = this.doc.canvas.height;
    created.forEach((el) => {
      el.x = Math.max(0, Math.min(el.x, finalW - el.w));
      el.y = Math.max(0, Math.min(el.y, finalH - el.h));
    });

    this._touch();
    this.emit("elements:change", page);
    this.emit("settings:change", this.doc.settings);
    this.setSelection(created.map((e) => e.id));
    return created;
  }

  // ---------------- elements ----------------
  addElementFromLibrary(type, x, y, pageId) {
    const def = getVisualDef(type);
    if (!def) return null;
    const page = pageId ? this.getPage(pageId) : this.getCurrentPage();
    this.pushHistory();
    const wanted = { x: x - def.defaultW / 2, y: y - def.defaultH / 2 };
    const placed = findNonOverlappingPosition(page.elements, wanted.x, wanted.y, def.defaultW, def.defaultH, this.doc.canvas.width, this.doc.canvas.height);
    const el = createElement(type, def, placed.x, placed.y, page);
    page.elements.push(el);
    this._clampElementToCanvas(el); // dropped near an edge — keep it fully on the page
    this._touch();
    this.emit("elements:change", page);
    this.setSelection([el.id]);
    return el;
  }

  /**
   * Drops a pasted (Ctrl+V) screenshot/image onto the canvas as a normal,
   * fully draggable/resizable image element, sized from its natural aspect
   * ratio (capped so a giant screenshot doesn't dwarf the page).
   */
  addPastedImage(dataUrl, naturalW, naturalH, pageId) {
    const page = pageId ? this.getPage(pageId) : this.getCurrentPage();
    this.pushHistory();

    const maxDim = 480;
    let w = naturalW || 320;
    let h = naturalH || 200;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    w = Math.max(60, w);
    h = Math.max(60, h);

    const imageDef = getVisualDef("image");
    const centerX = this.doc.canvas.width / 2 - w / 2;
    const centerY = this.doc.canvas.height / 2 - h / 2;
    const placed = findNonOverlappingPosition(page.elements, centerX, centerY, w, h, this.doc.canvas.width, this.doc.canvas.height);

    const el = createElement("image", { ...imageDef, defaultW: w, defaultH: h }, placed.x, placed.y, page);
    el.name = "Pasted Image";
    el.content.imageSrc = dataUrl;
    el.content.imageLabel = "Pasted image";
    page.elements.push(el);
    this._clampElementToCanvas(el);
    this._touch();
    this.emit("elements:change", page);
    this.setSelection([el.id]);
    return el;
  }

  /**
   * Turns a visual into another visual type (e.g. column chart → line chart)
   * in place: same position, size, comments and group. Anything the user
   * customised carries over — a renamed title, axis / legend / field names,
   * colours — while the new type's own defaults fill in the rest.
   */
  changeElementType(id, newType) {
    const found = this.findElementAnyPage(id);
    const newDef = getVisualDef(newType);
    if (!found || !newDef || found.el.type === newType) return false;
    const el = found.el;
    const oldDef = getVisualDef(el.type) || { label: el.type, content: {}, style: {} };
    this.pushHistory();

    const fresh = createElement(newType, newDef, el.x, el.y, found.page);
    const customised = (key) => el.content?.[key] !== undefined && el.content[key] !== "" && el.content[key] !== oldDef.content?.[key];
    const carry = ["title", "subtitle", "axisX", "axisY", "legend", "category", "value", "notes", "rows", "linkedColumns"];
    const content = { ...fresh.content };
    carry.forEach((key) => { if (customised(key)) content[key] = el.content[key]; });

    // Keep style choices that differ from the old type's defaults (colours, border…);
    // type-specific defaults like a card's big value font come from the new type.
    const oldDefaultStyle = { ...createElement(el.type, oldDef, 0, 0, { elements: [] }).style };
    const style = { ...fresh.style };
    Object.keys(el.style || {}).forEach((key) => { if (el.style[key] !== oldDefaultStyle[key]) style[key] = el.style[key]; });

    const keepName = el.name && !el.name.startsWith(oldDef.label);
    Object.assign(el, {
      type: newType,
      family: newDef.family,
      category: newDef.category,
      name: keepName ? el.name : el.name.replace(oldDef.label, newDef.label),
      content,
      style,
    });
    this._touch();
    if (found.page.id === this.doc.currentPageId) this.emit("elements:change", found.page);
    this.emit("selection:change", this.selection);
    return true;
  }

  /**
   * Saves a visual's specification: { description, logic: { question, measures:
   * [{ name, formula, format }], dimensions, filters, source, interactions,
   * formatting, notes }, status: "draft" | "confirmed" | "built" }.
   */
  updateElementSpec(id, spec) {
    const found = this.findElementAnyPage(id);
    if (!found) return;
    this.pushHistory();
    const me = getIdentity();
    found.el.spec = { ...spec, updatedAt: Date.now(), updatedBy: me.name || "", updatedByEmail: me.email || "" };
    this._touch();
    if (found.page.id === this.doc.currentPageId) this.emit("elements:change", found.page);
  }

  getElement(id, page) {
    const p = page || this.getCurrentPage();
    return p.elements.find((e) => e.id === id);
  }

  findElementAnyPage(id) {
    for (const p of this.doc.pages) {
      const e = p.elements.find((x) => x.id === id);
      if (e) return { el: e, page: p };
    }
    return null;
  }

  updateElement(id, patch, opts = {}) {
    const { pushHistory: doPush = true } = opts;
    const page = this.getCurrentPage();
    const el = this.getElement(id, page);
    if (!el) return;
    if (doPush) this.pushHistory();
    Object.assign(el, patch);
    this._clampElementToCanvas(el);
    this._touch();
    this.emit("elements:change", page);
    if (this.selection.includes(id)) this.emit("selection:change", this.selection);
  }

  _clampElementToCanvas(el) {
    const { width, height } = this.doc.canvas;
    const c = clampToBounds(el.x, el.y, el.w, el.h, width, height);
    el.x = c.x;
    el.y = c.y;
    el.w = c.w;
    el.h = c.h;
  }

  updateElementContent(id, contentPatch, opts = {}) {
    const page = this.getCurrentPage();
    const el = this.getElement(id, page);
    if (!el) return;
    if (opts.pushHistory !== false) this.pushHistory();
    el.content = { ...el.content, ...contentPatch };
    this._touch();
    this.emit("elements:change", page);
    this.emit("selection:change", this.selection);
  }

  updateElementStyle(id, stylePatch, opts = {}) {
    const page = this.getCurrentPage();
    const el = this.getElement(id, page);
    if (!el) return;
    if (opts.pushHistory !== false) this.pushHistory();
    el.style = { ...el.style, ...stylePatch };
    this._touch();
    this.emit("elements:change", page);
    this.emit("selection:change", this.selection);
  }

  batchUpdateStyle(ids, stylePatch, opts = {}) {
    const page = this.getCurrentPage();
    if (opts.pushHistory !== false) this.pushHistory();
    ids.forEach((id) => {
      const el = this.getElement(id, page);
      if (el) el.style = { ...el.style, ...stylePatch };
    });
    this._touch();
    this.emit("elements:change", page);
    this.emit("selection:change", this.selection);
  }

  batchUpdateContent(ids, contentPatch, opts = {}) {
    const page = this.getCurrentPage();
    if (opts.pushHistory !== false) this.pushHistory();
    ids.forEach((id) => {
      const el = this.getElement(id, page);
      if (el) el.content = { ...el.content, ...contentPatch };
    });
    this._touch();
    this.emit("elements:change", page);
    this.emit("selection:change", this.selection);
  }

  batchUpdateElements(updates, opts = {}) {
    // updates: [{id, patch}]
    const page = this.getCurrentPage();
    if (opts.pushHistory !== false) this.pushHistory();
    updates.forEach(({ id, patch }) => {
      const el = this.getElement(id, page);
      if (el) {
        Object.assign(el, patch);
        this._clampElementToCanvas(el);
      }
    });
    this._touch();
    this.emit("elements:change", page);
  }

  deleteElements(ids) {
    const page = this.getCurrentPage();
    const idSet = new Set(ids);
    if (!page.elements.some((e) => idSet.has(e.id))) return;
    this.pushHistory();
    page.elements = page.elements.filter((e) => !idSet.has(e.id));
    this.selection = this.selection.filter((id) => !idSet.has(id));
    this._touch();
    this.emit("elements:change", page);
    this.emit("selection:change", this.selection);
  }

  duplicateElements(ids) {
    const page = this.getCurrentPage();
    this.pushHistory();
    const clones = [];
    const groupIdMap = new Map(); // copies of a group form their own new group
    ids.forEach((id) => {
      const el = this.getElement(id, page);
      if (!el) return;
      const clone = cloneElement(el);
      if (clone.groupId) {
        if (!groupIdMap.has(clone.groupId)) groupIdMap.set(clone.groupId, uid("group"));
        clone.groupId = groupIdMap.get(clone.groupId);
      }
      clone.zIndex = nextZIndex(page);
      this._clampElementToCanvas(clone);
      page.elements.push(clone);
      clones.push(clone);
    });
    this._touch();
    this.emit("elements:change", page);
    this.setSelection(clones.map((c) => c.id));
    return clones;
  }

  // z-order
  reorderZ(ids, direction) {
    // direction: 'front' | 'back' | 'forward' | 'backward'
    const page = this.getCurrentPage();
    this.pushHistory();
    const sorted = [...page.elements].sort((a, b) => a.zIndex - b.zIndex);
    const idSet = new Set(ids);
    if (direction === "front") {
      let z = sorted.length ? Math.max(...sorted.map((e) => e.zIndex)) + 1 : 1;
      sorted.filter((e) => idSet.has(e.id)).forEach((e) => (e.zIndex = z++));
    } else if (direction === "back") {
      let z = sorted.length ? Math.min(...sorted.map((e) => e.zIndex)) - 1 : 0;
      sorted.filter((e) => idSet.has(e.id)).reverse().forEach((e) => (e.zIndex = z--));
    } else if (direction === "forward") {
      for (let i = sorted.length - 2; i >= 0; i--) {
        if (idSet.has(sorted[i].id) && !idSet.has(sorted[i + 1].id)) {
          const tmp = sorted[i].zIndex;
          sorted[i].zIndex = sorted[i + 1].zIndex;
          sorted[i + 1].zIndex = tmp;
          [sorted[i], sorted[i + 1]] = [sorted[i + 1], sorted[i]];
        }
      }
    } else if (direction === "backward") {
      for (let i = 1; i < sorted.length; i++) {
        if (idSet.has(sorted[i].id) && !idSet.has(sorted[i - 1].id)) {
          const tmp = sorted[i].zIndex;
          sorted[i].zIndex = sorted[i - 1].zIndex;
          sorted[i - 1].zIndex = tmp;
          [sorted[i], sorted[i - 1]] = [sorted[i - 1], sorted[i]];
        }
      }
    }
    this._touch();
    this.emit("elements:change", page);
  }

  // ---------------- grouping ----------------
  groupElements(ids) {
    if (ids.length < 2) return;
    const page = this.getCurrentPage();
    this.pushHistory();
    const groupId = uid("group");
    ids.forEach((id) => {
      const el = this.getElement(id, page);
      if (el) el.groupId = groupId;
    });
    this._touch();
    this.emit("elements:change", page);
    this.emit("selection:change", this.selection);
  }

  ungroupElements(ids) {
    const page = this.getCurrentPage();
    this.pushHistory();
    const groupIds = new Set(ids.map((id) => this.getElement(id, page)?.groupId).filter(Boolean));
    page.elements.forEach((el) => {
      if (groupIds.has(el.groupId)) el.groupId = null;
    });
    this._touch();
    this.emit("elements:change", page);
    this.emit("selection:change", this.selection);
  }

  getGroupMemberIds(groupId) {
    return this.getCurrentPage().elements.filter((e) => e.groupId === groupId).map((e) => e.id);
  }

  // ---------------- alignment ----------------
  alignElements(ids, mode) {
    const page = this.getCurrentPage();
    const els = ids.map((id) => this.getElement(id, page)).filter(Boolean);
    if (els.length < 2) return;
    this.pushHistory();
    const bs = els.map((e) => ({ el: e, b: bounds(e) }));
    const minLeft = Math.min(...bs.map((x) => x.b.left));
    const maxRight = Math.max(...bs.map((x) => x.b.right));
    const minTop = Math.min(...bs.map((x) => x.b.top));
    const maxBottom = Math.max(...bs.map((x) => x.b.bottom));
    const centerX = (minLeft + maxRight) / 2;
    const centerY = (minTop + maxBottom) / 2;

    bs.forEach(({ el, b }) => {
      switch (mode) {
        case "left": el.x = minLeft; break;
        case "right": el.x = maxRight - b.width; break;
        case "center": el.x = centerX - b.width / 2; break;
        case "top": el.y = minTop; break;
        case "bottom": el.y = maxBottom - b.height; break;
        case "middle": el.y = centerY - b.height / 2; break;
        case "equal-width": el.w = els[0].w; break;
        case "equal-height": el.h = els[0].h; break;
      }
    });

    if (mode === "distribute-h") {
      const sorted = bs.slice().sort((a, b2) => a.b.left - b2.b.left);
      const totalWidth = sorted.reduce((s, x) => s + x.b.width, 0);
      const gap = (maxRight - minLeft - totalWidth) / (sorted.length - 1);
      let cursor = minLeft;
      sorted.forEach(({ el, b }) => {
        el.x = cursor;
        cursor += b.width + gap;
      });
    } else if (mode === "distribute-v") {
      const sorted = bs.slice().sort((a, b2) => a.b.top - b2.b.top);
      const totalHeight = sorted.reduce((s, x) => s + x.b.height, 0);
      const gap = (maxBottom - minTop - totalHeight) / (sorted.length - 1);
      let cursor = minTop;
      sorted.forEach(({ el, b }) => {
        el.y = cursor;
        cursor += b.height + gap;
      });
    }

    this._touch();
    this.emit("elements:change", page);
    this.emit("selection:change", this.selection);
  }

  // ---------------- comments ----------------
  // Comment actions find the visual on any page, so the "All pages" review
  // list can change status / reply without switching pages first.

  _commentChanged(page, elId) {
    this._touch();
    if (page.id === this.doc.currentPageId) this.emit("elements:change", page);
    this.emit("comments:change", { elId });
  }

  _people() {
    return knownPeople(this.doc, getIdentity());
  }

  _mentionFields(text) {
    const people = extractMentions(text, this._people());
    rememberPeople(people);
    return { mentions: people.map((p) => p.name), mentionEmails: people.map((p) => p.email).filter(Boolean) };
  }

  /**
   * `input`: { text, type, assignee } where assignee is a person
   * ({ name, email }) or empty. A plain string still works as the text.
   */
  addComment(elId, input) {
    const { text = "", type = "", assignee = null } = typeof input === "string" ? { text: input } : input || {};
    const found = this.findElementAnyPage(elId);
    if (!found || !text.trim()) return null;
    this.pushHistory();
    const now = Date.now();
    const me = getIdentity();
    const comment = normalizeComment({
      id: uid("cm"),
      text: text.trim(),
      author: me.name || "You",
      authorEmail: me.email,
      createdAt: now,
      updatedAt: now,
      status: "open",
      type,
      assignee: assignee?.name || "",
      assigneeEmail: assignee?.email || "",
      ...this._mentionFields(text),
    });
    if (assignee?.name) this._addMember(assignee);
    found.el.comments = [...(found.el.comments || []), comment];
    this._commentChanged(found.page, elId);
    return comment;
  }

  /** `patch` may include text, status, type, and assignee ({ name, email } or null to clear). */
  updateComment(elId, commentId, patch) {
    const found = this.findElementAnyPage(elId);
    const cm = found?.el.comments?.find((c) => c.id === commentId);
    if (!cm) return;
    this.pushHistory();
    if (patch.text !== undefined) {
      cm.text = patch.text.trim();
      Object.assign(cm, this._mentionFields(cm.text));
    }
    if (patch.status !== undefined) {
      cm.status = patch.status;
      cm.resolved = patch.status === "done";
    }
    if (patch.type !== undefined) cm.type = patch.type;
    if (patch.assignee !== undefined) {
      cm.assignee = patch.assignee?.name || "";
      cm.assigneeEmail = patch.assignee?.email || "";
      if (patch.assignee?.name) {
        rememberPeople([patch.assignee]);
        this._addMember(patch.assignee);
      }
    }
    cm.updatedAt = Date.now();
    this._commentChanged(found.page, elId);
  }

  addReply(elId, commentId, text) {
    const found = this.findElementAnyPage(elId);
    const cm = found?.el.comments?.find((c) => c.id === commentId);
    if (!cm || !text.trim()) return;
    this.pushHistory();
    const me = getIdentity();
    const reply = { id: uid("rp"), text: text.trim(), author: me.name || "You", authorEmail: me.email, createdAt: Date.now(), ...this._mentionFields(text) };
    cm.replies = [...(cm.replies || []), reply];
    cm.updatedAt = Date.now();
    this._commentChanged(found.page, elId);
  }

  // ---------------- project members ----------------
  // Everyone who has opened the project (plus people assigned work by email),
  // kept in the file so the whole team gets the same people to assign / @mention.

  _addMember(person) {
    if (!person?.email) return false;
    const email = person.email.toLowerCase();
    this.doc.members = this.doc.members || [];
    const existing = this.doc.members.find((m) => m.id === email);
    if (existing) {
      if (person.name && existing.name !== person.name && person.self) {
        existing.name = person.name; // people can correct their own name
        return true;
      }
      return false;
    }
    this.doc.members.push({ id: email, email, name: person.name || email, addedAt: Date.now() });
    return true;
  }

  /** Adds this user to the project's members (once). */
  ensureCurrentMember() {
    const me = getIdentity();
    if (!me.email) return;
    if (this._addMember({ ...me, self: true })) {
      this._touch();
      this.emit("members:change", this.doc.members);
    }
  }

  addMemberByEmail(person) {
    if (this._addMember(person)) {
      this._touch();
      this.emit("members:change", this.doc.members);
      return true;
    }
    return false;
  }

  removeMember(email) {
    const before = (this.doc.members || []).length;
    this.doc.members = (this.doc.members || []).filter((m) => m.id !== email.toLowerCase());
    if (this.doc.members.length !== before) {
      this._touch();
      this.emit("members:change", this.doc.members);
    }
  }

  deleteReply(elId, commentId, replyId) {
    const found = this.findElementAnyPage(elId);
    const cm = found?.el.comments?.find((c) => c.id === commentId);
    if (!cm) return;
    this.pushHistory();
    cm.replies = (cm.replies || []).filter((r) => r.id !== replyId);
    cm.updatedAt = Date.now();
    this._commentChanged(found.page, elId);
  }

  deleteComment(elId, commentId) {
    const found = this.findElementAnyPage(elId);
    if (!found) return;
    this.pushHistory();
    found.el.comments = (found.el.comments || []).filter((c) => c.id !== commentId);
    this._commentChanged(found.page, elId);
  }

  /** Every comment with where it lives, newest activity first. `scope`: "page" | "all". */
  getAllComments(scope = "page") {
    const pages = scope === "all" ? this.doc.pages : [this.getCurrentPage()];
    const out = [];
    pages.forEach((page) =>
      page.elements.forEach((el) =>
        (el.comments || []).forEach((c) => out.push({ comment: c, elId: el.id, elName: el.name || el.type, pageId: page.id, pageName: page.name }))
      )
    );
    const activity = (c) => Math.max(c.updatedAt || 0, c.createdAt || 0, ...(c.replies || []).map((r) => r.createdAt || 0));
    return out.sort((a, b) => activity(b.comment) - activity(a.comment));
  }

  // ---------------- selection ----------------
  setSelection(ids) {
    this.selection = [...new Set(ids)];
    this.emit("selection:change", this.selection);
  }

  toggleSelection(id) {
    if (this.selection.includes(id)) this.selection = this.selection.filter((x) => x !== id);
    else this.selection = [...this.selection, id];
    this.emit("selection:change", this.selection);
  }

  clearSelection() {
    if (!this.selection.length) return;
    this.selection = [];
    this.emit("selection:change", this.selection);
  }

  getSelectedElements() {
    const page = this.getCurrentPage();
    return this.selection.map((id) => this.getElement(id, page)).filter(Boolean);
  }

  // ---------------- schema ----------------
  setSchema(schema) {
    this.pushHistory();
    this.doc.schema = schema;
    this._touch();
    this.emit("schema:change", this.doc.schema);
  }

  addSchemaTable(table) {
    this.pushHistory();
    this.doc.schema.tables = this.doc.schema.tables.filter((t) => t.name !== table.name);
    this.doc.schema.tables.push(table);
    this._touch();
    this.emit("schema:change", this.doc.schema);
  }

  removeSchemaTable(name) {
    this.pushHistory();
    this.doc.schema.tables = this.doc.schema.tables.filter((t) => t.name !== name);
    this._touch();
    this.emit("schema:change", this.doc.schema);
  }

  // ---------------- ui / settings ----------------
  setTool(tool) {
    this.ui.tool = tool;
    this.emit("ui:change", this.ui);
  }

  setRightTab(tab) {
    this.ui.rightTab = tab;
    this.emit("ui:change", this.ui);
  }

  setLeftTab(tab) {
    this.ui.leftTab = tab;
    this.emit("ui:change", this.ui);
  }

  setZoom(z) {
    this.doc.settings.zoom = Math.max(0.1, Math.min(4, z));
    this.emit("settings:change", this.doc.settings);
  }

  toggleGrid(force) {
    this.doc.settings.showGrid = force !== undefined ? force : !this.doc.settings.showGrid;
    this._touch();
    this.emit("settings:change", this.doc.settings);
  }

  toggleSnap(force) {
    this.doc.settings.snapToGrid = force !== undefined ? force : !this.doc.settings.snapToGrid;
    this._touch();
    this.emit("settings:change", this.doc.settings);
  }

  toggleRulers(force) {
    this.doc.settings.showRulers = force !== undefined ? force : !this.doc.settings.showRulers;
    this._touch();
    this.emit("settings:change", this.doc.settings);
  }

  setGridSize(size) {
    this.doc.settings.gridSize = size;
    this._touch();
    this.emit("settings:change", this.doc.settings);
  }

  setCanvasSize(width, height) {
    this.pushHistory();
    this.doc.canvas.width = Math.max(200, width);
    this.doc.canvas.height = Math.max(200, height);
    // A smaller page could strand existing elements outside it — pull them back in.
    this.doc.pages.forEach((page) => page.elements.forEach((el) => this._clampElementToCanvas(el)));
    this._touch();
    this.emit("settings:change", this.doc.settings);
    this.emit("elements:change", this.getCurrentPage());
  }

  setPageBackground(pageId, color) {
    const page = this.getPage(pageId);
    if (!page) return;
    this.pushHistory();
    page.background = color;
    this._touch();
    this.emit("settings:change", this.doc.settings);
    this.emit("pages:change", this.doc);
  }

  renameDocument(title) {
    this.doc.meta.title = title || "Untitled Wireframe";
    this._touch();
    this.emit("doc:meta:change", this.doc.meta);
  }

  // ---------------- new/replace document ----------------
  newDocument() {
    this.doc = createEmptyDocument();
    this.selection = [];
    this._undoStack = [];
    this._redoStack = [];
    this._touch();
    this.emit("doc:change", this.doc);
    this.emit("pages:change", this.doc);
    this.emit("page:switch", this.getCurrentPage());
    this.emit("schema:change", this.doc.schema);
    this.emit("selection:change", this.selection);
    this.emit("history:change", this.historyState());
  }

  /**
   * Swaps in a newer version of the same project that came from the shared
   * file (someone else's changes merged with ours). Keeps this user's page,
   * view settings and selection. Undo history is cleared so undo can't
   * silently revert another person's work.
   */
  applyExternalDocument(doc) {
    const currentPageId = this.doc.currentPageId;
    const settings = this.doc.settings;
    this.doc = migrateDoc({ ...doc, currentPageId, settings });
    if (!this.getPage(currentPageId)) this.doc.currentPageId = this.doc.pages[0].id;
    this.selection = this.selection.filter((id) => this._elementExists(id));
    this._undoStack = [];
    this._redoStack = [];
    this._touch();
    this.emit("doc:change", this.doc);
    this.emit("doc:meta:change", this.doc.meta);
    this.emit("pages:change", this.doc);
    this.emit("page:switch", this.getCurrentPage());
    this.emit("elements:change", this.getCurrentPage());
    this.emit("schema:change", this.doc.schema);
    this.emit("settings:change", this.doc.settings);
    this.emit("selection:change", this.selection);
    this.emit("history:change", this.historyState());
  }

  replaceDocument(doc) {
    this.doc = migrateDoc(doc);
    this.selection = [];
    this._undoStack = [];
    this._redoStack = [];
    this._touch();
    this.emit("doc:change", this.doc);
    this.emit("pages:change", this.doc);
    this.emit("page:switch", this.getCurrentPage());
    this.emit("schema:change", this.doc.schema);
    this.emit("selection:change", this.selection);
    this.emit("history:change", this.historyState());
  }
}

function migrateDoc(doc) {
  // Defensive defaults in case an older/partial doc is loaded.
  const base = createEmptyDocument();
  return {
    version: doc.version || base.version,
    meta: { ...base.meta, ...doc.meta },
    canvas: { ...base.canvas, ...doc.canvas },
    pages: (doc.pages && doc.pages.length ? doc.pages : base.pages).map((p) => ({
      id: p.id, name: p.name, background: p.background || "#ffffff",
      elements: (p.elements || []).map((e) => ({
        groupId: null, locked: false, hidden: false, rotation: 0, ...e,
        comments: (e.comments || []).map(normalizeComment),
      })),
    })),
    currentPageId: doc.currentPageId || (doc.pages && doc.pages[0]?.id) || base.currentPageId,
    schema: doc.schema && doc.schema.tables ? doc.schema : { tables: [] },
    members: Array.isArray(doc.members) ? doc.members.filter((m) => m && m.email).map((m) => ({ ...m, id: m.email.toLowerCase() })) : [],
    settings: { ...base.settings, ...doc.settings },
  };
}

export const store = new Store();
