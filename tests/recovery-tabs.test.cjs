const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
const source = readFileSync(
  path.join(__dirname, "../src/admin/recovery-tabs.js"),
  "utf8",
).replace("export function recoveryTabContext", "function recoveryTabContext");

function browser() {
  const channels = new Set();
  class BroadcastChannel {
    constructor(name) {
      this.name = name;
      channels.add(this);
    }
    postMessage(data) {
      for (const other of channels)
        if (other !== this && other.name === this.name)
          queueMicrotask(() => other.onmessage?.({ data }));
    }
    close() {
      channels.delete(this);
    }
  }
  const tab = (copiedStorage = []) => {
    const map = new Map(copiedStorage);
    const listeners = new Map();
    const window = {
      sessionStorage: {
        getItem: (key) => map.get(key),
        setItem: (key, value) => map.set(key, value),
      },
      addEventListener: (name, callback) =>
        listeners.set(name, [...(listeners.get(name) || []), callback]),
    };
    const create = new Function(
      "window",
      "BroadcastChannel",
      "globalThis",
      `${source}\nreturn recoveryTabContext;`,
    )(window, BroadcastChannel, { crypto: { randomUUID } });
    return {
      create,
      map,
      dispatch: (name) =>
        listeners.get(name)?.forEach((callback) => callback()),
    };
  };
  return { tab };
}

test("tab handshakes isolate duplicated storage, preserve reload pointers and release closed owners", async () => {
  const { tab } = browser();
  const first = tab();
  const a = await first.create();
  assert.equal(
    await first.create(),
    a,
    "hooks in one tab share the same coordinator",
  );
  const duplicate = tab(first.map);
  const b = await duplicate.create();
  assert.notEqual(
    a.owner,
    b.owner,
    "a duplicated tab cannot own the original tab's recovery slot",
  );
  assert.deepEqual(await b.activeOwners(), [a.owner]);
  first.dispatch("pagehide");
  assert.deepEqual(
    await b.activeOwners(),
    [],
    "closed tabs stop claiming their recovery copies",
  );
  duplicate.dispatch("pagehide");
  const reloaded = tab(duplicate.map);
  const c = await reloaded.create();
  assert.notEqual(c.owner, b.owner, "every document owns an independent slot");
  assert.equal(
    c.previousOwner,
    b.owner,
    "reload remembers this tab's own copy",
  );
  reloaded.dispatch("pagehide");
});
