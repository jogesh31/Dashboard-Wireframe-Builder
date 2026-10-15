# Dashboard Wireframe Builder

A Windows desktop app for designing Power BI–style dashboard wireframes with your team and clients — realistic Power BI visuals, review comments, the logic behind every visual, and one `.wfd` project file you share through OneDrive. No server, no sign-in, no tokens.

## Download and install

1. Download **[Wireframe.Designer.Setup.1.0.0.exe](https://github.com/jogesh31/Dashboard-Wireframe-Builder/releases/latest/download/Wireframe.Designer.Setup.1.0.0.exe)** (one file) — or pick it from **[Releases](https://github.com/jogesh31/Dashboard-Wireframe-Builder/releases/latest)**.
2. Double-click it and follow the setup. It installs for the current user — **no admin rights needed** — and adds a desktop shortcut and Start menu entry.
3. Windows may show **"Windows protected your PC"** because the installer isn't code-signed: click **More info ▸ Run anyway**.
4. Open **Wireframe Designer**, confirm your name and work email (picked up from the Office / OneDrive account on your PC), and start a new project.

Works on Windows 10 and 11. Double-clicking any `.wfd` file opens it in the app. To update, run a newer Setup over the old one; to remove it, use **Settings ▸ Apps ▸ Wireframe Designer ▸ Uninstall**.

## What it does

- **Power BI–style visuals** — 50+ charts, cards/KPIs, tables/matrices, maps and slicers drawn with Power BI's default theme, real axes, legends and data labels. Change any visual's type from the button on it.
- **Generate visuals** — add headers, filters, KPIs and visuals in one go, choose how many go in each row (or a pattern like `3,2,1`), and see a live preview of the page before creating them.
- **Logic & description per visual** — the **fx** button on each visual holds its formulas / DAX (Logic tab) and a plain-language Description, with a status (Draft → Confirmed by client → Built). Hover the button to preview both.
- **Review comments** — status (Open / In progress / Done), type, assignee by email, replies, @mentions, and filters such as "For me". Teammates' new comments for you are flagged when their changes arrive.
- **One shared project file** — each wireframe is a single `.wfd` file. Save it in a shared OneDrive folder; everyone's changes are merged (never overwritten) and highlighted, and OneDrive conflict copies are merged back in.
- **Export** — page as JPG, multi-page PDF (optionally with comment sticky notes), or copy to Google Slides.
- **Data schema upload** — CSV / Excel / JSON; field names feed the generator and the visuals.

## Sharing with your team

1. **File ▸ Save** (Ctrl+S) the project into a shared OneDrive folder — it saves to that file automatically from then on.
2. Teammates and clients install the app and open the same `.wfd` file.
3. Changes made by others appear within seconds with an "Updated by …" banner and highlights; **Mark as seen** clears them.

Who can open a project is controlled by the OneDrive folder's sharing. Names and emails label work and power assignments / @mentions; they aren't a security check.

## Building the installer (developers)

Requires [Node.js LTS](https://nodejs.org) on the machine that builds it.

```
npm install
npm start        # run the desktop app without installing
npm run dist     # creates dist\Wireframe Designer Setup <version>.exe
```

You can also run the browser version without installing anything: `powershell -ExecutionPolicy Bypass -File serve.ps1`, then open http://localhost:5500 in Chrome or Edge.

## Project layout

| Area | Where |
|---|---|
| Desktop shell (window, file access, OneDrive watching, account detection) | `electron/` |
| Canvas, selection, zoom / fit, visual buttons | `src/components/canvas.js`, `canvasElement.js` |
| Power BI–style visual rendering | `src/pbiVisuals.js`, `src/visualRenderers.js` |
| Visual catalog and icons | `src/visualLibrary.js`, `src/visualIcons.js` |
| Generate visuals + row layout | `src/components/generateModal.js`, `src/generateLayout.js` |
| Logic & description | `src/components/specModal.js` |
| Comments, people, @mentions | `src/components/commentsPanel.js`, `src/wfd/comments.js` |
| `.wfd` format, 3-way merge, change diff | `src/wfd/format.js` |
| Project file sync, recent files, identity | `src/wfd/` |
| Document model, undo/redo | `src/store.js`, `src/model.js` |
| Export (PDF / JPG / Slides) | `src/export/` |

Keyboard: `Ctrl+S` save, `Ctrl+Shift+S` save as, `Ctrl+O` open, `Delete` remove, `Ctrl+D` duplicate, `Ctrl+Z` / `Ctrl+Y` undo / redo, `Ctrl+G` / `Ctrl+Shift+G` group / ungroup, arrows nudge (Shift = 10px), `Ctrl+0` fit to screen, `Ctrl`+wheel zoom, `Space`-drag to pan.
