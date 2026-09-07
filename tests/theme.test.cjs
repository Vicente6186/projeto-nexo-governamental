const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const {
  createThemeStore,
  THEME_STORAGE_KEY,
} = require("../src/admin/theme.cjs");

function environment({
  preference,
  dark = false,
  blockedStorage = false,
} = {}) {
  const dom = new JSDOM(
    '<html><head><meta name="theme-color"></head><body></body></html>',
    {
      url: "https://nexo.example/admin/",
    },
  );
  const browser = dom.window;
  if (preference !== undefined)
    browser.localStorage.setItem(THEME_STORAGE_KEY, preference);
  if (blockedStorage) {
    Object.defineProperty(browser, "localStorage", {
      get() {
        throw new Error("Storage blocked");
      },
    });
  }
  const media = new browser.EventTarget();
  media.matches = dark;
  browser.matchMedia = () => media;
  const store = createThemeStore(browser);
  return {
    browser,
    store,
    system(value) {
      media.matches = value;
      media.dispatchEvent(new browser.Event("change"));
    },
    storage(value, key = THEME_STORAGE_KEY) {
      browser.dispatchEvent(
        new browser.StorageEvent("storage", { key, newValue: value }),
      );
    },
    dispose: () => browser.close(),
  };
}

test("saved appearance is applied to page and native controls before subscription", (t) => {
  const env = environment({ preference: "dark" });
  t.after(env.dispose);
  assert.deepEqual(env.store.getSnapshot(), {
    preference: "dark",
    resolved: "dark",
  });
  assert.equal(env.browser.document.documentElement.dataset.theme, "dark");
  assert.equal(env.browser.document.documentElement.style.colorScheme, "dark");
  assert.equal(
    env.browser.document.querySelector('meta[name="theme-color"]').content,
    "#0e1124",
  );

  env.store.setPreference("light");
  assert.equal(env.browser.localStorage.getItem(THEME_STORAGE_KEY), "light");
  assert.equal(env.browser.document.documentElement.style.colorScheme, "light");
});

test("system appearance follows the device only while the system preference is selected", (t) => {
  const env = environment({ dark: true });
  t.after(env.dispose);
  const changes = [];
  const unsubscribe = env.store.subscribe(() =>
    changes.push(env.store.getSnapshot()),
  );
  t.after(unsubscribe);
  assert.deepEqual(env.store.getSnapshot(), {
    preference: "system",
    resolved: "dark",
  });
  env.system(false);
  assert.deepEqual(env.store.getSnapshot(), {
    preference: "system",
    resolved: "light",
  });
  env.store.setPreference("dark");
  env.system(true);
  env.system(false);
  assert.deepEqual(env.store.getSnapshot(), {
    preference: "dark",
    resolved: "dark",
  });
  env.store.setPreference("system");
  assert.deepEqual(env.store.getSnapshot(), {
    preference: "system",
    resolved: "light",
  });
  assert.equal(env.browser.localStorage.getItem(THEME_STORAGE_KEY), "system");
  assert.equal(changes.length, 3);
});

test("a preference changed in another tab updates the page, and clearing storage restores system", (t) => {
  const env = environment({ preference: "light", dark: true });
  t.after(env.dispose);
  t.after(env.store.subscribe(() => {}));
  env.storage("dark");
  assert.equal(env.browser.document.documentElement.dataset.theme, "dark");
  assert.deepEqual(env.store.getSnapshot(), {
    preference: "dark",
    resolved: "dark",
  });
  env.storage("light", "unrelated-setting");
  assert.equal(env.store.getSnapshot().preference, "dark");
  env.storage(null, null);
  assert.deepEqual(env.store.getSnapshot(), {
    preference: "system",
    resolved: "dark",
  });
});

test("restricted storage and missing media queries leave appearance usable for the session", (t) => {
  const env = environment({ blockedStorage: true, dark: true });
  t.after(env.dispose);
  assert.equal(env.store.getSnapshot().resolved, "dark");
  assert.doesNotThrow(() => env.store.setPreference("light"));
  assert.equal(env.browser.document.documentElement.dataset.theme, "light");

  delete env.browser.matchMedia;
  const noMediaStore = createThemeStore(env.browser);
  assert.deepEqual(noMediaStore.getSnapshot(), {
    preference: "system",
    resolved: "light",
  });
  assert.doesNotThrow(() => noMediaStore.setPreference("dark"));
  assert.equal(env.browser.document.documentElement.style.colorScheme, "dark");
});

test("unknown saved preferences fall back to system and listeners stop after unmount", (t) => {
  const env = environment({ preference: "obsolete", dark: true });
  t.after(env.dispose);
  assert.equal(env.store.getSnapshot().preference, "system");
  let notifications = 0;
  const unsubscribe = env.store.subscribe(() => notifications++);
  unsubscribe();
  env.system(false);
  env.storage("light");
  assert.equal(notifications, 0);
  assert.equal(env.store.getSnapshot().resolved, "dark");
});
