export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs || {})) {
    if (val === null || val === undefined || val === false) continue;
    if (key === "class") el.className = val;
    else if (key === "html") el.innerHTML = val;
    else if (key.startsWith("on") && typeof val === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (key === "dataset") {
      Object.entries(val).forEach(([k, v]) => (el.dataset[k] = v));
    } else if (val === true) {
      el.setAttribute(key, "");
    } else {
      el.setAttribute(key, val);
    }
  }
  const kids = Array.isArray(children) ? children : [children];
  kids.forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    if (typeof child === "string" || typeof child === "number") {
      el.appendChild(document.createTextNode(String(child)));
    } else {
      el.appendChild(child);
    }
  });
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function svgIcon(pathData, viewBox = "0 0 24 24") {
  return `<svg viewBox="${viewBox}" fill="none" xmlns="http://www.w3.org/2000/svg">${pathData}</svg>`;
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function debounce(fn, wait) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${time}`;
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
