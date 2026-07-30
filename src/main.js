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
import { restoreLinkForCurrentProject } from "./export/sharedFile.js";
import { showToast } from "./components/toast.js";

async function boot() {
  await store.init();

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
  restoreLinkForCurrentProject();

  window.addEventListener("beforeunload", () => {
    store.forceSaveNow();
  });

  const hadExisting = store.doc.pages.some((p) => p.elements.length > 0) || store.doc.pages.length > 1;
  if (hadExisting) {
    showToast("Restored your previous session", "success");
  }
}

boot();
