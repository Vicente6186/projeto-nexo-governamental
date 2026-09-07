const test = require("node:test");
const assert = require("node:assert/strict");
const { createRecoveryStore } = require("../src/admin/draft-recovery.cjs");
function memory() {
  const map = new Map();
  return {
    getItem: (k) => map.get(k),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] || null,
    map,
  };
}
test("recovery isolates users and keeps the original base version for conflict review", () => {
  const storage = memory();
  const store = createRecoveryStore(storage, () => 1788800000000);
  const draft = { title: "Texto ainda não salvo", body: "Conteúdo" };
  assert.equal(
    store.write("alice:article:1", draft, 4, { title: "Original" }),
    true,
  );
  assert.deepEqual(store.read("alice:article:1").value, draft);
  assert.equal(store.read("alice:article:1").version, 4);
  assert.deepEqual(store.read("alice:article:1").base, { title: "Original" });
  assert.equal(store.read("bob:article:1"), null);
  store.remove("alice:article:1");
  assert.equal(store.read("alice:article:1"), null);
});

test("separate tabs never overwrite or clear one another's unsaved edits", () => {
  const storage = memory();
  const now = () => 1788800000000;
  const a = createRecoveryStore(storage, now, { owner: "tab-a" });
  const b = createRecoveryStore(storage, now, { owner: "tab-b" });
  a.write("alice:site", { title: "Digitação A" }, 4, { title: "Base" });
  b.write("alice:site", { title: "Digitação B" }, 4, { title: "Base" });
  assert.equal(a.read("alice:site").value.title, "Digitação A");
  assert.equal(b.read("alice:site").value.title, "Digitação B");
  b.remove("alice:site");
  assert.equal(a.read("alice:site").value.title, "Digitação A");
  assert.equal(b.read("alice:site"), null);
  assert.equal(
    createRecoveryStore(storage, now, { owner: "tab-a" }).read("alice:site")
      .value.title,
    "Digitação A",
  );
});

test("new tabs offer orphaned copies but exclude live tabs and retain other users' isolation", () => {
  const storage = memory();
  const now = () => 1788800000000;
  createRecoveryStore(storage, now, { owner: "tab-a" }).write(
    "alice:article:1",
    { body: "Órfão" },
    5,
    { body: "Base" },
  );
  const newcomer = createRecoveryStore(storage, now, { owner: "tab-new" });
  assert.equal(
    newcomer.read("alice:article:1", { activeOwners: ["tab-a"] }),
    null,
  );
  assert.equal(newcomer.read("bob:article:1"), null);
  const before = JSON.stringify([...storage.map]);
  const orphan = newcomer.read("alice:article:1", { activeOwners: [] });
  assert.equal(orphan.value.body, "Órfão");
  assert.equal(orphan.owner, "tab-a");
  assert.equal(
    JSON.stringify([...storage.map]),
    before,
    "read does not mutate any recovery copy",
  );
  newcomer.remove("alice:article:1");
  assert.equal(newcomer.read("alice:article:1"), null);
  assert.equal(
    createRecoveryStore(storage, now, { owner: "tab-a" }).read(
      "alice:article:1",
    ).value.body,
    "Órfão",
  );
});

test("scoped recovery can read legacy copies without deleting them or leaking expired data", () => {
  const storage = memory();
  const instant = 1788800000000;
  createRecoveryStore(storage, () => instant).write(
    "alice:site",
    { title: "Legado" },
    2,
  );
  const scoped = createRecoveryStore(storage, () => instant + 1000, {
    owner: "new-tab",
  });
  assert.equal(scoped.read("alice:site").value.title, "Legado");
  scoped.remove("alice:site");
  assert.equal(scoped.read("alice:site"), null);
  assert.equal(
    createRecoveryStore(storage, () => instant + 1000).read("alice:site").value
      .title,
    "Legado",
  );
  assert.equal(
    createRecoveryStore(storage, () => instant + 8 * 86400000, {
      owner: "later-tab",
    }).read("alice:site"),
    null,
  );
});

test("reload prioritizes its previous document while a duplicate cannot overwrite that document", () => {
  const storage = memory();
  const now = 1788800000000;
  createRecoveryStore(storage, () => now, { owner: "original" }).write(
    "alice:site",
    { title: "Minha cópia" },
    4,
  );
  createRecoveryStore(storage, () => now + 500, { owner: "other" }).write(
    "alice:site",
    { title: "Outra aba" },
    4,
  );
  const reload = createRecoveryStore(storage, () => now + 1000, {
    owner: "new-document",
    previousOwner: "original",
  });
  assert.equal(reload.read("alice:site").value.title, "Minha cópia");
  assert.equal(
    reload.read("alice:site", { activeOwners: ["original", "other"] }),
    null,
  );
  reload.write("alice:site", { title: "Digitação nova" }, 4);
  assert.equal(
    createRecoveryStore(storage, () => now + 1000, { owner: "original" }).read(
      "alice:site",
    ).value.title,
    "Minha cópia",
  );
  reload.remove("alice:site");
  assert.equal(
    createRecoveryStore(storage, () => now + 2000, {
      owner: "another-document",
      previousOwner: "new-document",
    }).read("alice:site"),
    null,
    "dismissal is remembered across reload",
  );
});

test("expired version-two copies and dismissal markers are pruned without removing valid or unrelated data", () => {
  const storage = memory();
  const start = 1788800000000;
  const old = createRecoveryStore(storage, () => start, { owner: "old-tab" });
  old.write("alice:old", { title: "Expirada" }, 1);
  old.remove("alice:marker");
  storage.setItem("another-app", "Keep me");
  const current = createRecoveryStore(storage, () => start + 6 * 86400000, {
    owner: "current-tab",
  });
  current.write("alice:current", { title: "Atual" }, 2);
  const active = createRecoveryStore(storage, () => start + 8 * 86400000, {
    owner: "new-tab",
  });
  active.read("alice:current");
  assert.equal(
    [...storage.map.keys()].some((key) => key.endsWith(":old-tab")),
    false,
  );
  assert.equal(current.read("alice:current").value.title, "Atual");
  assert.equal(storage.getItem("another-app"), "Keep me");
});
test("expired, corrupt and unavailable recovery storage does not prevent editing", () => {
  const storage = memory();
  createRecoveryStore(storage, () => 1000).write("site", { title: "Old" }, 1);
  assert.equal(
    createRecoveryStore(storage, () => 8 * 86400000).read("site"),
    null,
  );
  storage.setItem("nexo-recovery:v1:site", "invalid json");
  assert.equal(createRecoveryStore(storage).read("site"), null);
  assert.equal(createRecoveryStore(null).write("site", {}, 1), false);
  assert.equal(
    createRecoveryStore({
      setItem() {
        throw new Error("Quota exceeded");
      },
    }).write("site", {}, 1),
    false,
  );
});
