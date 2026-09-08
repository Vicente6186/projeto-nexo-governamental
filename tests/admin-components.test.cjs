const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const babel = require("@babel/core");
const { JSDOM } = require("jsdom");
const React = require("react");

async function fixture(t) {
  const dom = new JSDOM(
    '<button id="trigger">Abrir</button><div id="root"></div>',
    {
      url: "http://localhost/admin/",
      pretendToBeVisual: true,
    },
  );
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
  // jsdom has no layout. Keep hidden controls out of the simulated tab order.
  dom.window.HTMLElement.prototype.getClientRects = function () {
    return this.closest("[hidden]") ? [] : [{ width: 100, height: 20 }];
  };
  const filename = path.resolve(__dirname, "../src/admin/components.jsx");
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
    require,
    module,
    module.exports,
  );
  const { createRoot } = require("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root"));
  dom.window.document.getElementById("trigger").focus();
  t.after(async () => {
    await React.act(async () => root.unmount());
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
  });
  return {
    document: dom.window.document,
    render: async (children) =>
      React.act(async () =>
        root.render(
          React.createElement(
            module.exports.Modal,
            { title: "Revisar", onClose() {} },
            children,
          ),
        ),
      ),
    tab: async (shiftKey = false) =>
      React.act(async () => {
        dom.window.document.activeElement.dispatchEvent(
          new dom.window.KeyboardEvent("keydown", {
            key: "Tab",
            shiftKey,
            bubbles: true,
            cancelable: true,
          }),
        );
      }),
  };
}

test("modal focus skips controls disabled by a fieldset and hidden form steps", async (t) => {
  const f = await fixture(t);
  await f.render(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "fieldset",
        { disabled: true },
        React.createElement("input", { id: "disabled-input" }),
        React.createElement("button", { id: "disabled-button" }, "Aguarde"),
      ),
      React.createElement(
        "section",
        { hidden: true },
        React.createElement("input", { id: "hidden-input" }),
      ),
      React.createElement("input", { id: "editable-input" }),
      React.createElement("button", { id: "continue-button" }, "Continuar"),
    ),
  );
  assert.equal(f.document.activeElement.id, "editable-input");
  const close = f.document.querySelector('[aria-label="Fechar janela"]');
  close.focus();
  await f.tab();
  assert.equal(f.document.activeElement.id, "editable-input");
  await f.tab();
  assert.equal(f.document.activeElement.id, "continue-button");
  await f.tab();
  assert.equal(f.document.activeElement, close);
  await f.tab(true);
  assert.equal(f.document.activeElement.id, "continue-button");
});
