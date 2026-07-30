# Dashboard Wireframe Designer

A browser-based wireframing tool for BI dashboards. Managers lay out dashboard pages with a full Power BI-style visual catalog (charts, filters, cards, tables, maps, containers); analysts use the wireframe + attached comments + uploaded data schema as the build blueprint.

No Node.js/npm required — this is a dependency-free ES-modules app. A couple of small libraries (CSV/Excel parsing, PDF/JPG export) are vendored locally in `vendor/`.

## Running it

Browsers block ES module imports over `file://`, so it needs to be served over HTTP:

1. Double-click `serve.ps1` (or run `powershell -ExecutionPolicy Bypass -File serve.ps1` from this folder). It starts a local static server on port 5500.
2. Open **http://localhost:5500** in Chrome/Edge.
3. Leave the PowerShell window open while you work; close it to stop the server.

Everything autosaves continuously to the browser's IndexedDB (per-browser-profile). Use **File > Save Project As…** to export a portable `.wfd.json` file, and **File > Open Project…** to reopen one on another machine.

## Feature map

| Area | Where |
|---|---|
| Canvas engine (drag/resize/rotate/snap/guides/zoom/pan) | `src/components/canvas.js`, `canvasElement.js` |
| Pages (add/duplicate/rename/reorder) | `src/components/pagesPanel.js` |
| Visual library (65 chart/filter/container types) | `src/visualLibrary.js`, `visualIcons.js`, `visualRenderers.js` |
| Properties / Layers / Comments / Schema panels | `src/components/*Panel.js` |
| Undo/redo, grouping, alignment, comments, schema | `src/store.js` |
| Schema upload + type detection (CSV/XLSX/JSON) | `src/schema/` |
| Export (PDF/JPG) & Save/Open project | `src/export/` |
| Autosave (IndexedDB) | `src/persistence.js` |

## Notes

- Canvas visuals are intentionally wireframe placeholders (title/subtitle/axis/legend + a representative glyph), not live charts — this is a layout blueprinting tool, not a BI engine.
- Keyboard: `Delete` remove, `Ctrl+D` duplicate, `Ctrl+Z`/`Ctrl+Y` undo/redo, `Ctrl+G`/`Ctrl+Shift+G` group/ungroup, arrows nudge (Shift = 10px), `Ctrl+A` select all, `Space`-drag or middle-mouse to pan, `Ctrl`+wheel to zoom.
