export function showToast(message, type = "info", duration = 2200) {
  const host = document.getElementById("toast-host");
  if (!host) return;

  // Don't pile up duplicates — e.g. repeated clicks while a tool hint is showing
  // would otherwise stack the same message over and over.
  const existing = [...host.children].find((t) => t.dataset.msg === message);
  if (existing) {
    clearTimeout(existing._hideTimer);
    existing._hideTimer = setTimeout(() => fadeAndRemove(existing), duration);
    return;
  }

  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.dataset.msg = message;
  el.textContent = message;
  host.appendChild(el);
  el._hideTimer = setTimeout(() => fadeAndRemove(el), duration);
}

function fadeAndRemove(el) {
  el.style.transition = "opacity 0.2s";
  el.style.opacity = "0";
  setTimeout(() => el.remove(), 220);
}

/**
 * A toast that stays open and can be updated in place — for multi-step async
 * work like export, where the user needs to see progress rather than a single
 * fire-and-forget message.
 */
export function showProgressToast(message) {
  const host = document.getElementById("toast-host");
  const el = document.createElement("div");
  el.className = "toast progress";
  el.innerHTML = `<span class="toast-spinner"></span><span class="toast-text"></span>`;
  el.querySelector(".toast-text").textContent = message;
  host.appendChild(el);

  return {
    update(msg) {
      el.querySelector(".toast-text").textContent = msg;
    },
    done(finalMessage, type = "success", duration = 2000) {
      el.classList.remove("progress");
      el.classList.add(type);
      el.innerHTML = "";
      el.textContent = finalMessage;
      setTimeout(() => {
        el.style.transition = "opacity 0.2s";
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 220);
      }, duration);
    },
    close() {
      el.remove();
    },
  };
}
