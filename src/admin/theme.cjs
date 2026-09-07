const THEME_STORAGE_KEY = "nexo-studio-theme";
const THEME_MODES = ["light", "dark", "system"];
const THEME_COLORS = { light: "#f5f6fa", dark: "#0e1124" };

function normalizePreference(value) {
  return THEME_MODES.includes(value) ? value : "dark";
}

/** Keeps the saved preference separate from the actual system appearance. */
function createThemeStore(browser) {
  let media;
  try {
    media = browser?.matchMedia?.("(prefers-color-scheme: dark)");
  } catch {
    // Embedded browsers can deny access to media queries.
  }

  function readPreference() {
    try {
      return normalizePreference(
        browser?.localStorage?.getItem(THEME_STORAGE_KEY),
      );
    } catch {
      return "dark";
    }
  }

  const listeners = new Set();
  let snapshot;
  let detach;

  function apply(preference) {
    const resolved =
      preference === "system"
        ? media?.matches
          ? "dark"
          : "light"
        : preference;
    const document = browser?.document;
    if (document?.documentElement) {
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", THEME_COLORS[resolved]);
    }
    if (snapshot?.preference === preference && snapshot?.resolved === resolved)
      return;
    snapshot = Object.freeze({ preference, resolved });
    listeners.forEach((listener) => listener());
  }

  function onSystemChange() {
    if (snapshot.preference === "system") apply("system");
  }

  function onStorage(event) {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    try {
      if (event.storageArea && event.storageArea !== browser.localStorage)
        return;
    } catch {
      // The event can still provide a valid preference when storage is restricted.
    }
    apply(normalizePreference(event.key === null ? null : event.newValue));
  }

  function connect() {
    browser?.addEventListener?.("storage", onStorage);
    if (media?.addEventListener)
      media.addEventListener("change", onSystemChange);
    else media?.addListener?.(onSystemChange);
    onSystemChange();
    return () => {
      browser?.removeEventListener?.("storage", onStorage);
      if (media?.removeEventListener)
        media.removeEventListener("change", onSystemChange);
      else media?.removeListener?.(onSystemChange);
    };
  }

  // Runs when the entry module loads, before React creates the first screen.
  apply(readPreference());

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) detach = connect();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          detach?.();
          detach = undefined;
        }
      };
    },
    setPreference(value) {
      const preference = normalizePreference(value);
      try {
        browser?.localStorage?.setItem(THEME_STORAGE_KEY, preference);
      } catch {
        // Appearance still works for this session if storage is unavailable.
      }
      apply(preference);
    },
  };
}

const themeStore = createThemeStore(
  typeof window === "undefined" ? undefined : window,
);

module.exports = { THEME_STORAGE_KEY, createThemeStore, themeStore };
