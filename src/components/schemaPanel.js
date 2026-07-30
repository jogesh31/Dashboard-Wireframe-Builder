import { store } from "../store.js";
import { UI } from "../uiIcons.js";
import { h, escapeHtml } from "../utils/dom.js";
import { parseSchemaFile } from "../schema/parsers.js";
import { showToast } from "./toast.js";
import { clientToPageCoords } from "./canvasElement.js";

let panelEl;

const TYPE_LABEL = { integer: "Integer", decimal: "Decimal", text: "Text", date: "Date", boolean: "Boolean" };

export function initSchemaPanel() {
  panelEl = document.getElementById("schema-panel");
  store.on("schema:change", render);
  wireFileInput();
  render();
}

function wireFileInput() {
  const fileInput = document.getElementById("file-input-schema");
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    fileInput.value = "";
    if (file) await handleFile(file);
  });
}

async function handleFile(file) {
  try {
    const result = await parseSchemaFile(file);
    result.tables.forEach((t) => store.addSchemaTable(t));
    showToast(`Detected ${result.tables.length} table${result.tables.length > 1 ? "s" : ""} from ${file.name}`, "success");
  } catch (err) {
    console.error(err);
    showToast(err.message || "Failed to parse file", "error");
  }
}

function render() {
  panelEl.innerHTML = "";

  const zone = h("div", { class: "schema-upload-zone" }, [
    h("div", { html: UI.upload }),
    h("div", {}, "Upload CSV, Excel (.xlsx) or JSON"),
    h("div", { class: "hint" }, "Columns, types & tables are detected automatically"),
  ]);
  zone.addEventListener("click", () => document.getElementById("file-input-schema").click());
  ["dragenter", "dragover"].forEach((evt) =>
    zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.add("dragover"); })
  );
  ["dragleave", "drop"].forEach((evt) =>
    zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.remove("dragover"); })
  );
  zone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  panelEl.appendChild(zone);

  const tables = store.doc.schema.tables || [];
  if (!tables.length) {
    panelEl.appendChild(h("div", { class: "empty-state" }, "No schema uploaded yet. Once you upload a data file, detected tables and columns will appear here."));
    return;
  }

  tables.forEach((table) => panelEl.appendChild(renderTable(table)));
}

function renderTable(table) {
  const wrap = h("div", { class: "schema-table" });
  wrap.innerHTML = `
    <div class="schema-table-header">
      <span>${escapeHtml(table.name)} <span class="row-count">${table.rowCount ?? ""} rows</span></span>
      <div class="row" style="gap:4px">
        <button class="icon-btn" data-action="insert" data-tip="Insert as Table visual">${UI.table}</button>
        <button class="icon-btn" data-action="remove" data-tip="Remove table">${UI.trash}</button>
      </div>
    </div>`;
  table.columns.forEach((col) => {
    const row = h("div", { class: "schema-col-row", draggable: "true" });
    row.innerHTML = `<span class="schema-col-name">${escapeHtml(col.name)}</span><span class="type-pill ${col.type}">${TYPE_LABEL[col.type] || col.type}</span>`;
    row.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/wfd-schema-field", JSON.stringify({ table: table.name, column: col.name, type: col.type }));
    });
    wrap.appendChild(row);
  });

  wrap.querySelector('[data-action="remove"]').addEventListener("click", () => {
    if (confirm(`Remove table "${table.name}" from schema?`)) store.removeSchemaTable(table.name);
  });
  wrap.querySelector('[data-action="insert"]').addEventListener("click", () => {
    const pageEl = document.getElementById("page-canvas");
    const rect = pageEl.getBoundingClientRect();
    const pt = clientToPageCoords(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const el = store.addElementFromLibrary("table", pt.x, pt.y);
    if (el) {
      store.updateElementContent(el.id, {
        title: table.name,
        linkedTable: table.name,
        linkedColumns: table.columns.slice(0, 6).map((c) => c.name),
      });
      showToast(`Inserted Table visual for "${table.name}"`);
    }
  });

  return wrap;
}
