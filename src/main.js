import { store } from "./store.js";
import { initCanvas } from "./components/canvas.js";
import { initPagesPanel } from "./components/pagesPanel.js";
import { initLibraryPanel } from "./components/libraryPanel.js";
import { initSidebarTabs } from "./components/sidebarTabs.js";
import { initToolbar } from "./components/toolbar.js";
import { initMenuBar } from "./components/menuBar.js";
import { initStatusBar } from "./components/statusBar.js";
import { initPropertiesPanel } from "./components/propertiesPanel.js";
import { initLayersPanel } from "./components/layersPanel.js";
import { initCommentsPanel } from "./components/commentsPanel.js";
import { initSchemaPanel } from "./components/schemaPanel.js";
import { initSidebarResize } from "./components/sidebarResize.js";
import { initSyncBanner } from "./components/syncBanner.js";
import { showStartScreen } from "./components/startScreen.js";
import { initProjectFile, openProjectFile, saveProjectFile, saveProjectFileAs, syncNow, getFileState } from "./wfd/projectFile.js";
import { ensureIdentity } from "./wfd/identity.js";
import { showToast } from "./components/toast.js";
import { initTooltips } from "./utils/tooltip.js";

async function boot() {
  await store.init();

  initTooltips();
  initSidebarTabs();
  initSidebarResize();
  initPagesPanel();
  initLibraryPanel();
  initCanvas();
  initToolbar();
  initMenuBar();
  initStatusBar();
  initPropertiesPanel();
  initLayersPanel();
  initCommentsPanel();
  initSchemaPanel();
  initSyncBanner();

  await ensureIdentity();
  // Changing your name/email updates your entry in the open project's members.
  window.addEventListener("wfd:identity-change", () => {
    if (getFileState().linked) store.ensureCurrentMember();
    store.emit("comments:change", {});
  });
  const openedFromFile = await initProjectFile();
  if (!openedFromFile) showStartScreen();

  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === "s") {
      e.preventDefault();
      if (e.shiftKey) saveProjectFileAs();
      else saveProjectFile();
    } else if (key === "o") {
      e.preventDefault();
      openProjectFile();
    }
  });

  window.addEventListener("beforeunload", () => {
    store.forceSaveNow();
  });

  // Desktop app: finish writing the project file before the window closes.
  if (window.wfdNative) {
    window.wfdNative.onBeforeClose(async () => {
      try {
        await store.forceSaveNow();
        await syncNow();
      } finally {
        window.wfdNative.readyToClose();
      }
    });
  }

}

boot();
