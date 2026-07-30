import { EventEmitter } from "./utils/events.js";
import { debounce } from "./utils/dom.js";
import { createEmptyDocument, createPage, createElement, cloneElement, nextZIndex, structuredCloneSafe } from "./model.js";
import { getVisualDef } from "./visualLibrary.js";
import { bounds, findNonOverlappingPosition, clampToBounds } from "./utils/geometry.js";
import { saveProject, loadStartupDocument, listProjects, loadProject, deleteProject, setLastActiveProjectId } from "./persistence.js";
import { uid } from "./utils/uuid.js";

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
    clone.elements.forEach((e) => {
      e.id = uid("el");
      e.comments = e.comments || [];
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
   * Bulk-creates a mix of visual types in one action, as one undo step. `groups`
   * is an array of arrays of `{ type, label }` — each inner array is one
   * category "band" (e.g. all the Filters rows the user configured). Within a
   * band, rows are split into a fixed number of equal-width columns (items are
   * actually resized to fit, not just spaced out) so a row of N visuals always
   * reads as a clean N-column grid instead of native-sized boxes with random
   * gaps between them; sparse rows are centered rather than left-stuck with
   * dead space on the right. `label`, if given, becomes that instance's
   * visible title/field name instead of the generic default. Each band starts
   * fresh below the previous one, and the page grows taller automatically if
   * the generated content doesn't fit, so nothing is ever clipped.
   */
  generateElements(groups) {
    const flat = groups.flat();
    if (!flat.length) return [];
    const page = this.getCurrentPage();
    this.pushHistory();

    const margin = 40;
    const gutter = 20;
    const bandGap = 30;
    const minColWidth = 160;
    const maxColWidth = 420;
    const canvasW = this.doc.canvas.width;
    const availableW = Math.max(1, canvasW - margin * 2);

    const visibleEls = page.elements.filter((e) => !e.hidden);
    let cursorY = visibleEls.length ? Math.max(...visibleEls.map((e) => e.y + e.h)) + bandGap : margin;

    const totalPerType = {};
    flat.forEach(({ type }) => { totalPerType[type] = (totalPerType[type] || 0) + 1; });
    const seenPerType = {};
    const labelFieldByFamily = { chart: "title", cardstat: "title", table: "title", map: "title", filter: "category", text: "text", button: "text", sectionHeader: "text", groupContainer: "text" };

    const created = [];
    groups.forEach((group) => {
      const items = group.map((g) => ({ ...g, def: getVisualDef(g.type) })).filter((g) => g.def);
      if (!items.length) return;

      const maxCols = Math.max(1, Math.floor((availableW + gutter) / (minColWidth + gutter)));
      const cols = Math.min(items.length, maxCols);
      const rows = [];
      for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));

      rows.forEach((rowItems) => {
        const n = rowItems.length;
        const colWidth = Math.min((availableW - (n - 1) * gutter) / n, maxColWidth);
        const rowSpan = colWidth * n + gutter * (n - 1);
        let cursorX = margin + Math.max(0, (availableW - rowSpan) / 2);
        let rowMaxH = 0;

        rowItems.forEach(({ type, label, def }) => {
          seenPerType[type] = (seenPerType[type] || 0) + 1;
          const suffix = totalPerType[type] > 1 ? ` ${seenPerType[type]}` : "";
          const el = createElement(type, def, cursorX, cursorY, page);
          el.w = Math.round(colWidth);
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
          cursorX += colWidth + gutter;
          rowMaxH = Math.max(rowMaxH, def.defaultH);
        });
        cursorY += rowMaxH + gutter;
      });
      cursorY += bandGap - gutter;
    });

    const contentBottom = cursorY - bandGap; // cursorY is one bandGap past the last row placed
    const neededHeight = Math.ceil((contentBottom + margin) / 10) * 10;
    if (neededHeight > this.doc.canvas.height) {
      this.doc.canvas.height = neededHeight;
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
    ids.forEach((id) => {
      const el = this.getElement(id, page);
      if (!el) return;
      const clone = cloneElement(el);
      clone.zIndex = nextZIndex(page);
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
  addComment(elId, text, author = "You") {
    const page = this.getCurrentPage();
    const el = this.getElement(elId, page);
    if (!el || !text.trim()) return;
    this.pushHistory();
    el.comments = el.comments || [];
    el.comments.push({ id: uid("cm"), text: text.trim(), author, createdAt: Date.now(), updatedAt: Date.now(), resolved: false });
    this._touch();
    this.emit("elements:change", page);
    this.emit("comments:change", { elId });
  }

  editComment(elId, commentId, text) {
    const page = this.getCurrentPage();
    const el = this.getElement(elId, page);
    const cm = el?.comments?.find((c) => c.id === commentId);
    if (!cm) return;
    this.pushHistory();
    cm.text = text;
    cm.updatedAt = Date.now();
    this._touch();
    this.emit("elements:change", page);
    this.emit("comments:change", { elId });
  }

  toggleResolveComment(elId, commentId) {
    const page = this.getCurrentPage();
    const el = this.getElement(elId, page);
    const cm = el?.comments?.find((c) => c.id === commentId);
    if (!cm) return;
    this.pushHistory();
    cm.resolved = !cm.resolved;
    this._touch();
    this.emit("elements:change", page);
    this.emit("comments:change", { elId });
  }

  deleteComment(elId, commentId) {
    const page = this.getCurrentPage();
    const el = this.getElement(elId, page);
    if (!el) return;
    this.pushHistory();
    el.comments = (el.comments || []).filter((c) => c.id !== commentId);
    this._touch();
    this.emit("elements:change", page);
    this.emit("comments:change", { elId });
  }

  getAllComments() {
    const page = this.getCurrentPage();
    const out = [];
    page.elements.forEach((el) => {
      (el.comments || []).forEach((c) => out.push({ ...c, elId: el.id, elName: el.name }));
    });
    return out.sort((a, b) => b.createdAt - a.createdAt);
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
        comments: [], groupId: null, locked: false, hidden: false, rotation: 0, ...e,
      })),
    })),
    currentPageId: doc.currentPageId || (doc.pages && doc.pages[0]?.id) || base.currentPageId,
    schema: doc.schema && doc.schema.tables ? doc.schema : { tables: [] },
    settings: { ...base.settings, ...doc.settings },
  };
}

export const store = new Store();
