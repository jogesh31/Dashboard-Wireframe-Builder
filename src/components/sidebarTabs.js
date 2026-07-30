import { store } from "../store.js";

export function initSidebarTabs() {
  wireTabs("left-tabs", {
    pages: "pages-panel",
    library: "library-panel",
  }, (tab) => store.setLeftTab(tab));

  wireTabs("right-tabs", {
    properties: "properties-panel",
    layers: "layers-panel",
    comments: "comments-panel",
    schema: "schema-panel",
  }, (tab) => store.setRightTab(tab));
}

function wireTabs(tabsId, panelMap, onSelect) {
  const tabsEl = document.getElementById(tabsId);
  const tabs = [...tabsEl.querySelectorAll(".tab")];
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const key = tab.dataset.tab;
      tabs.forEach((t) => t.classList.toggle("active", t === tab));
      Object.entries(panelMap).forEach(([k, panelId]) => {
        document.getElementById(panelId).classList.toggle("hidden", k !== key);
      });
      onSelect(key);
    });
  });
}

export function activateRightTab(key) {
  const tabsEl = document.getElementById("right-tabs");
  const tab = [...tabsEl.querySelectorAll(".tab")].find((t) => t.dataset.tab === key);
  if (tab) tab.click();
}

export function activateLeftTab(key) {
  const tabsEl = document.getElementById("left-tabs");
  const tab = [...tabsEl.querySelectorAll(".tab")].find((t) => t.dataset.tab === key);
  if (tab) tab.click();
}
