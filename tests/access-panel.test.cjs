const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const babel = require("@babel/core");
const { JSDOM } = require("jsdom");
const React = require("react");

async function fixture(t) {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost/admin/",
    pretendToBeVisual: true,
  });
  const original = {};
  for (const key of [
    "window",
    "document",
    "MutationObserver",
    "requestAnimationFrame",
    "IS_REACT_ACT_ENVIRONMENT",
  ]) {
    original[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value:
        key === "IS_REACT_ACT_ENVIRONMENT"
          ? true
          : key === "requestAnimationFrame"
            ? dom.window[key].bind(dom.window)
            : dom.window[key],
    });
  }
  const calls = [],
    accepted = [],
    expired = [];
  function compile(name) {
    const filename = path.resolve(__dirname, `../src/admin/${name}.jsx`);
    const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
      filename,
      babelrc: false,
      configFile: false,
      presets: [
        ["@babel/preset-env", { targets: { node: "current" } }],
        ["@babel/preset-react", { runtime: "automatic" }],
      ],
    });
    const module = { exports: {} };
    new Function("require", "module", "exports", code)(
      (request) => {
        if (request.endsWith(".css")) return {};
        if (["./components", "./FormSteps"].includes(request))
          return compile(request.slice(2));
        if (request === "./api")
          return {
            api: (url, options = {}) =>
              new Promise((resolve, reject) => {
                calls.push({ url, options, resolve, reject });
              }),
          };
        return require(request);
      },
      module,
      module.exports,
    );
    return module.exports;
  }
  const { createRoot } = require("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root"));
  const AccessPanel = compile("AccessPanel").default;
  const unmount = async () => {
    await React.act(async () => root.unmount());
  };
  t.after(async () => {
    await unmount();
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
  });
  await React.act(async () => {
    root.render(
      React.createElement(AccessPanel, {
        session: {
          user: { id: "alice", name: "Alice", role: "admin" },
        },
        onClose() {},
        onSession: (value) => accepted.push(value),
        onExpired: () => expired.push(true),
      }),
    );
  });
  return {
    calls,
    accepted,
    expired,
    document: dom.window.document,
    unmount,
    async click(label) {
      const button = [...dom.window.document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent.trim().startsWith(label),
      );
      assert.ok(button, `Button exists: ${label}`);
      await React.act(async () => button.click());
    },
    async fill(id, value) {
      const input = dom.window.document.getElementById(id);
      await React.act(async () => {
        Object.getOwnPropertyDescriptor(
          dom.window.HTMLInputElement.prototype,
          "value",
        ).set.call(input, value);
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
    },
    async submitPassword() {
      await React.act(async () => {
        dom.window.document
          .querySelector("form")
          .dispatchEvent(
            new dom.window.Event("submit", { bubbles: true, cancelable: true }),
          );
      });
    },
  };
}

test("an older team response cannot replace a newer list after navigating away and back", async (t) => {
  const f = await fixture(t);
  await f.click("Gerenciar equipe");
  await f.click("Meu acesso");
  await f.click("Gerenciar equipe");
  assert.equal(f.calls.length, 2);
  await React.act(async () => {
    f.calls[1].resolve({
      users: [
        { id: "new", name: "Equipe atual", active: true, role: "editor" },
      ],
    });
  });
  await React.act(async () => {
    f.calls[0].resolve({
      users: [
        { id: "old", name: "Equipe antiga", active: true, role: "editor" },
      ],
    });
  });
  assert.match(f.document.body.textContent, /Equipe atual/);
  assert.doesNotMatch(f.document.body.textContent, /Equipe antiga/);
  assert.equal(f.calls[0].options.signal.aborted, true);
});

test("leaving the team cancels its query and ignores a late session error", async (t) => {
  const f = await fixture(t);
  await f.click("Gerenciar equipe");
  await f.click("Meu acesso");
  await React.act(async () => {
    f.calls[0].reject(
      Object.assign(new Error("Sessão antiga"), { status: 401 }),
    );
  });
  assert.equal(f.calls[0].options.signal.aborted, true);
  assert.deepEqual(f.expired, []);
  assert.equal(f.document.querySelector('[role="alert"]'), null);
});

test("password submission blocks team requests and cannot restore a session after the panel unmounts", async (t) => {
  const f = await fixture(t);
  await f.fill("access-currentPassword", "old-password");
  await f.fill("access-newPassword", "new-password-123");
  await f.fill("access-confirmPassword", "new-password-123");
  await f.submitPassword();
  await f.click("Gerenciar equipe");
  assert.deepEqual(
    f.calls.map((call) => call.url),
    ["/api/admin/password"],
  );
  await f.unmount();
  await React.act(async () => {
    f.calls[0].resolve({ user: { id: "alice" }, authenticated: true });
  });
  assert.deepEqual(f.accepted, []);
});
