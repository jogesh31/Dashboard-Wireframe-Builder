// Shows a dropdown as a fixed layer on <body>, positioned under its trigger.
// The toolbar scrolls horizontally, which clips anything that hangs below it,
// so its menus can't live inside it.

export function attachFloatingMenu(trigger, dropdown, { align = "right" } = {}) {
  dropdown.classList.add("floating-menu", "hidden");
  let isOpen = false;

  const position = () => {
    const r = trigger.getBoundingClientRect();
    const w = dropdown.offsetWidth;
    const h = dropdown.offsetHeight;
    let left = align === "right" ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    dropdown.style.left = `${Math.round(left)}px`;
    dropdown.style.top = `${Math.round(top)}px`;
  };

  const onOutside = (e) => {
    if (!dropdown.contains(e.target) && !trigger.contains(e.target)) close();
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };

  function open() {
    if (isOpen) return;
    isOpen = true;
    document.body.appendChild(dropdown);
    dropdown.classList.remove("hidden");
    position();
    trigger.classList.add("open");
    setTimeout(() => {
      document.addEventListener("mousedown", onOutside, true);
      document.addEventListener("keydown", onKey);
      window.addEventListener("resize", close);
    }, 0);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    dropdown.classList.add("hidden");
    trigger.classList.remove("open");
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", close);
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isOpen) close();
    else open();
  });

  return { open, close, isOpen: () => isOpen };
}
