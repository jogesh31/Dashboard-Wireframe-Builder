// Desktop shell for Wireframe Designer. Serves the app from its own files
// (no local web server), gives it native open/save dialogs and direct access
// to .wfd files — including watching a file in a OneDrive folder so changes
// other people save show up automatically.

const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const { pathToFileURL } = require("url");
const { execFile } = require("child_process");

const APP_ROOT = path.join(__dirname, "..");
const WATCH_INTERVAL_MS = 2000;
const WFD_FILTERS = [{ name: "Wireframe project", extensions: ["wfd"] }];

// WFD_USER_DATA=<folder> runs with a separate profile (recent list, drafts,
// single-instance lock) — used for testing alongside an open copy of the app.
if (process.env.WFD_USER_DATA) app.setPath("userData", process.env.WFD_USER_DATA);

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let mainWindow = null;
let pendingOpenPath = findWfdArg(process.argv);
let closeConfirmed = false;
const watchers = new Map(); // filePath -> listener

function findWfdArg(argv) {
  return argv.slice(1).find((a) => a.toLowerCase().endsWith(".wfd") && fs.existsSync(a)) || null;
}

async function readProject(filePath) {
  const [text, stat] = await Promise.all([fsp.readFile(filePath, "utf8"), fsp.stat(filePath)]);
  return { ref: filePath, name: path.basename(filePath), text, mtime: stat.mtimeMs };
}

function defaultSaveFolder() {
  return process.env.OneDriveCommercial || process.env.OneDrive || app.getPath("documents");
}

// ---------------- single instance + file association ----------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", async (_e, argv) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    const filePath = findWfdArg(argv);
    if (filePath) {
      try {
        mainWindow.webContents.send("wfd:open-file", await readProject(filePath));
      } catch (err) {
        dialog.showErrorBox("Couldn't open file", err.message);
      }
    }
  });
}

// ---------------- IPC ----------------

ipcMain.handle("wfd:open-dialog", async () => {
  const res = await dialog.showOpenDialog(mainWindow, { title: "Open project", filters: WFD_FILTERS, properties: ["openFile"], defaultPath: defaultSaveFolder() });
  if (res.canceled || !res.filePaths.length) return null;
  return readProject(res.filePaths[0]);
});

ipcMain.handle("wfd:save-dialog", async (_e, suggestedName, text) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: "Save project",
    filters: WFD_FILTERS,
    defaultPath: path.join(defaultSaveFolder(), suggestedName),
  });
  if (res.canceled || !res.filePath) return null;
  await fsp.writeFile(res.filePath, text, "utf8");
  const stat = await fsp.stat(res.filePath);
  return { ref: res.filePath, name: path.basename(res.filePath), mtime: stat.mtimeMs };
});

ipcMain.handle("wfd:read", async (_e, filePath) => {
  const { text, mtime } = await readProject(filePath);
  return { text, mtime };
});

ipcMain.handle("wfd:write", async (_e, filePath, text) => {
  await fsp.writeFile(filePath, text, "utf8");
  const stat = await fsp.stat(filePath);
  return { mtime: stat.mtimeMs };
});

ipcMain.handle("wfd:stat", async (_e, filePath) => {
  try {
    const stat = await fsp.stat(filePath);
    return { mtime: stat.mtimeMs };
  } catch (err) {
    return null;
  }
});

// fs.watchFile polls the file's modified time, which works reliably for
// files OneDrive replaces in place (fs.watch can miss those).
ipcMain.on("wfd:watch", (event, filePath) => {
  if (watchers.has(filePath)) return;
  const listener = (curr, prev) => {
    if (curr.mtimeMs !== prev.mtimeMs && !event.sender.isDestroyed()) {
      event.sender.send("wfd:file-changed", { ref: filePath, mtime: curr.mtimeMs });
    }
  };
  fs.watchFile(filePath, { interval: WATCH_INTERVAL_MS }, listener);
  watchers.set(filePath, listener);
});

ipcMain.on("wfd:unwatch", (_e, filePath) => {
  const listener = watchers.get(filePath);
  if (listener) fs.unwatchFile(filePath, listener);
  watchers.delete(filePath);
});

// OneDrive names conflict copies "<name>-<COMPUTERNAME>.wfd" (sometimes with a
// trailing number). The renderer checks each candidate is the same project.
ipcMain.handle("wfd:list-conflict-copies", async (_e, filePath) => {
  const dir = path.dirname(filePath);
  const stem = path.basename(filePath, path.extname(filePath)).toLowerCase();
  const own = path.basename(filePath).toLowerCase();
  const entries = await fsp.readdir(dir).catch(() => []);
  return entries
    .filter((n) => n.toLowerCase().endsWith(".wfd") && n.toLowerCase() !== own && n.toLowerCase().startsWith(`${stem}-`))
    .map((n) => ({ ref: path.join(dir, n), name: n }));
});

ipcMain.handle("wfd:trash", async (_e, filePath) => {
  await shell.trashItem(filePath);
});

ipcMain.handle("wfd:get-initial-file", async () => {
  const filePath = pendingOpenPath;
  pendingOpenPath = null;
  if (!filePath) return null;
  try {
    return await readProject(filePath);
  } catch (err) {
    return null;
  }
});

// ---------------- who is using this PC (no sign-in, no tokens) ----------------
// Reads the accounts Office and OneDrive already have signed in on this
// computer, so people are identified by their email without typing it.
// Work/school accounts come first, then personal ones.

function regQuery(key) {
  return new Promise((resolve) => {
    execFile("reg", ["query", key, "/s"], { windowsHide: true, timeout: 5000 }, (err, stdout) => resolve(err ? "" : stdout));
  });
}

// Parses `reg query /s` output into { keyPath: { valueName: value } }.
function parseReg(text) {
  const out = {};
  let current = null;
  text.split(/\r?\n/).forEach((line) => {
    if (/^HKEY_/.test(line)) { current = out[line.trim()] = {}; return; }
    const m = line.match(/^\s{4}(.+?)\s{4}REG_\w+\s{4}(.*)$/);
    if (m && current) current[m[1]] = m[2].trim();
  });
  return out;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function detectIdentities() {
  const found = [];
  const add = (email, name, work, source) => {
    if (!email || !EMAIL.test(email)) return;
    if (found.some((f) => f.email.toLowerCase() === email.toLowerCase())) return;
    found.push({ email, name: name || "", work, source });
  };

  const office = parseReg(await regQuery("HKCU\\Software\\Microsoft\\Office\\16.0\\Common\\Identity\\Identities"));
  Object.values(office).forEach((v) => {
    // First + last name reads better than FriendlyName, which is often a username.
    const name = [v.FirstName, v.LastName].filter(Boolean).join(" ") || v.FriendlyName;
    // IdP is a DWORD ("0x4"): 4 = work/school (Entra ID), 1 = personal Microsoft account.
    const work = parseInt(v.IdP, 16) === 4 || /orgid|aad/i.test(v.IdP || "");
    add(v.EmailAddress || v.SigninName, name, work, "Office");
  });

  const onedrive = parseReg(await regQuery("HKCU\\Software\\Microsoft\\OneDrive\\Accounts"));
  Object.entries(onedrive).forEach(([key, v]) => {
    const work = /\\Business\d*$/i.test(key);
    add(v.UserEmail, v.UserName || v.DisplayName, work, "OneDrive");
  });

  // Work accounts first; among those, real company domains before *.onmicrosoft.com test tenants.
  const rank = (f) => (f.work ? 2 : 0) + (/\.onmicrosoft\.com$/i.test(f.email) ? 0 : 1);
  return found.sort((a, b) => rank(b) - rank(a));
}

ipcMain.handle("wfd:detect-identities", () => detectIdentities().catch(() => []));

ipcMain.on("wfd:ready-to-close", () => {
  closeConfirmed = true;
  if (mainWindow) mainWindow.close();
});

// ---------------- window ----------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: "Wireframe Designer",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Links (e.g. the LinkedIn credit) open in the user's browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("app://")) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  // Exports (PDF / JPG / project copy) arrive as downloads: ask where to save
  // them with a proper title and file type instead of Chromium's bare dialog.
  mainWindow.webContents.session.on("will-download", (_e, item) => {
    const name = item.getFilename();
    const ext = path.extname(name).slice(1).toLowerCase();
    const kinds = { pdf: "PDF document", jpg: "JPEG image", jpeg: "JPEG image", png: "PNG image", wfd: "Wireframe project" };
    item.setSaveDialogOptions({
      title: "Save export",
      defaultPath: path.join(app.getPath("downloads"), name),
      filters: kinds[ext] ? [{ name: kinds[ext], extensions: [ext] }] : [],
    });
  });

  // Give the page a moment to write the project file before closing.
  mainWindow.on("close", (e) => {
    if (closeConfirmed) return;
    e.preventDefault();
    mainWindow.webContents.send("wfd:before-close");
    setTimeout(() => {
      closeConfirmed = true;
      if (mainWindow) mainWindow.close();
    }, 4000);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // WFD_DEBUG=1 prints the page's console and load errors to the terminal.
  if (process.env.WFD_DEBUG) {
    mainWindow.webContents.on("console-message", (e) => console.log(`[page:${e.level}] ${e.message}`));
    mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => console.log(`[load failed] ${code} ${desc} ${url}`));
    mainWindow.webContents.on("did-finish-load", () => console.log(`[loaded] ${mainWindow.webContents.getTitle()}`));
  }

  mainWindow.loadURL("app://wireframe/index.html");
}

app.whenReady().then(() => {
  protocol.handle("app", async (request) => {
    const { pathname } = new URL(request.url);
    const relative = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
    const filePath = path.normalize(path.join(APP_ROOT, relative));
    if (!filePath.startsWith(APP_ROOT + path.sep)) return new Response("Not found", { status: 404 });
    // Never let Chromium cache app files, or an updated install could keep
    // running scripts from the previous version.
    const res = await net.fetch(pathToFileURL(filePath).toString());
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(res.body, { status: res.status, headers });
  });
  createWindow();
});

app.on("window-all-closed", () => {
  watchers.forEach((listener, filePath) => fs.unwatchFile(filePath, listener));
  app.quit();
});
