const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const babel = require("@babel/core");
const { JSDOM } = require("jsdom");
const React = require("react");
const { createRecoveryStore } = require("../src/admin/draft-recovery.cjs");

async function fixture(t) {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost/",
  });
  const original = {};
  for (const key of ["window", "document", "IS_REACT_ACT_ENVIRONMENT"]) {
    original[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key],
    });
  }
  const probes = [];
  const filename = path.resolve(__dirname, "../src/admin/useDraftRecovery.js");
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    filename,
    babelrc: false,
    configFile: false,
    presets: [["@babel/preset-env", { targets: { node: "current" } }]],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(
    (name) => {
      if (name === "./recovery-tabs")
        return {
          recoveryTabContext: async () => ({
            owner: "hook-owner",
            previousOwner: "previous-owner",
            activeOwners: () => new Promise((resolve) => probes.push(resolve)),
          }),
        };
      if (name === "./draft-recovery.cjs") return { createRecoveryStore };
      return require(name);
    },
    module,
    module.exports,
  );
  const { createRoot } = require("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root"));
  let result;
  function Harness({ options }) {
    result = module.exports.useDraftRecovery(options);
    return null;
  }
  t.after(async () => {
    await React.act(async () => root.unmount());
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
  });
  return {
    get result() {
      return result;
    },
    storage: dom.window.localStorage,
    render: async (props) => {
      await React.act(async () =>
        root.render(React.createElement(Harness, { options: props })),
      );
    },
    settle: async () => {
      assert.equal(probes.length, 1);
      await React.act(async () => probes.shift()([]));
    },
  };
}

test("changing articles flushes the last edit before the recovery debounce", async (t) => {
  const f = await fixture(t);
  const first = {
    key: "alice:article:1",
    value: { title: "Original" },
    base: { title: "Original" },
    version: 3,
    dirty: false,
  };
  await f.render(first);
  await f.settle();
  await f.render({
    ...first,
    value: { title: "Última digitação" },
    dirty: true,
  });
  await f.render({ ...first, key: "alice:article:2" });
  const store = createRecoveryStore(f.storage, Date.now, {
    owner: "hook-owner",
  });
  assert.equal(store.read(first.key).value.title, "Última digitação");
  assert.equal(store.read(first.key).version, 3);
  assert.deepEqual(store.read(first.key).base, first.base);
  await f.settle();
});

test("reloading an article preserves edits when readiness changes before the debounce", async (t) => {
  const f = await fixture(t);
  const props = {
    key: "alice:article:1",
    value: { title: "Original" },
    version: 3,
    dirty: false,
    ready: true,
  };
  await f.render(props);
  await f.settle();
  await f.render({
    ...props,
    value: { title: "Edição pendente" },
    dirty: true,
  });
  await f.render({ ...props, ready: false, value: null });
  await f.render(props);
  await f.settle();
  assert.equal(f.result.recovery.value.title, "Edição pendente");
});

test("an offered recovery cannot be restored or discarded under a different article key", async (t) => {
  const f = await fixture(t);
  const oldStore = createRecoveryStore(f.storage, Date.now, {
    owner: "previous-owner",
  });
  oldStore.write("alice:article:1", { title: "Cópia do primeiro artigo" }, 3);
  const props = {
    key: "alice:article:1",
    value: { title: "Original" },
    version: 3,
    dirty: false,
  };
  await f.render(props);
  await f.settle();
  assert.equal(f.result.recovery.value.title, "Cópia do primeiro artigo");
  await f.render({ ...props, key: "alice:article:2" });
  assert.equal(
    f.result.recovery,
    null,
    "the prior banner disappears before the next probe resolves",
  );
  assert.equal(
    f.result.restore(),
    null,
    "the next editor cannot receive the prior article",
  );
  await React.act(async () => f.result.discard());
  assert.equal(
    oldStore.read(props.key).value.title,
    "Cópia do primeiro artigo",
  );
  await f.settle();
  assert.equal(f.result.recovery, null);
});
