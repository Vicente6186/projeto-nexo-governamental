const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const babel = require("@babel/core");
const { JSDOM } = require("jsdom");
const React = require("react");

async function fixture(t, session, respond) {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const original = {};
  for (const key of [
    "window",
    "document",
    "MutationObserver",
    "IS_REACT_ACT_ENVIRONMENT",
  ]) {
    original[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key],
    });
  }
  const calls = [],
    accepted = [],
    closed = [];
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
        if (request === "./components") return compile("components");
        if (request === "./api")
          return {
            api: async (url, options) => {
              calls.push({ url, options });
              return respond(url, options);
            },
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
  const SessionRecovery = compile("SessionRecovery").default;
  t.after(async () => {
    await React.act(async () => root.unmount());
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
  });
  await React.act(async () => {
    root.render(
      React.createElement(SessionRecovery, {
        session,
        onSession: (value) => accepted.push(value),
        onClose: () => closed.push(true),
      }),
    );
  });
  return {
    calls,
    accepted,
    closed,
    document: dom.window.document,
    submit: async () => {
      const password = dom.window.document.querySelector(
        'input[type="password"]',
      );
      await React.act(async () => {
        Object.getOwnPropertyDescriptor(
          dom.window.HTMLInputElement.prototype,
          "value",
        ).set.call(password, "test-password");
        password.dispatchEvent(
          new dom.window.Event("input", { bubbles: true }),
        );
      });
      await React.act(async () => {
        dom.window.document
          .querySelector("form")
          .dispatchEvent(
            new dom.window.Event("submit", { bubbles: true, cancelable: true }),
          );
      });
    },
    click: async (button) => {
      await React.act(async () => button.click());
    },
  };
}

const account = {
  authenticated: true,
  localPreview: true,
  user: { id: "alice", email: "alice@example.org" },
};

test("session renewal keeps the original account and does not offer local preview to real users", async (t) => {
  const f = await fixture(t, account, () => account);
  assert.equal(f.document.querySelector('input[type="email"]').readOnly, true);
  assert.doesNotMatch(f.document.body.textContent, /Continuar na prévia local/);
  await f.submit();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, "/api/login");
  assert.equal(f.calls[0].options.body.email, account.user.email);
  assert.equal(f.accepted[0], account);
  assert.equal(f.closed.length, 1);
});

test("a different identity returned during renewal is logged out before the editor can adopt it", async (t) => {
  const f = await fixture(t, account, (url) =>
    url === "/api/logout"
      ? { authenticated: false }
      : { ...account, user: { id: "bob", email: "bob@example.org" } },
  );
  await f.submit();
  assert.deepEqual(
    f.calls.map(({ url }) => url),
    ["/api/login", "/api/logout"],
  );
  assert.deepEqual(f.accepted, []);
  assert.deepEqual(f.closed, []);
  assert.match(
    f.document.querySelector('[role="alert"]').textContent,
    /mesma conta/,
  );
});

test("a local preview session can only resume the local preview identity", async (t) => {
  const local = { ...account, user: { id: "local-preview" } };
  const f = await fixture(t, local, () => local);
  assert.equal(f.document.querySelector('input[type="email"]'), null);
  const button = [...f.document.querySelectorAll("button")].find((candidate) =>
    candidate.textContent.includes("Continuar na prévia local"),
  );
  await f.click(button);
  assert.equal(f.calls[0].url, "/api/local-session");
  assert.equal(f.accepted[0], local);
});
