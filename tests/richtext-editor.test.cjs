const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const babel = require("@babel/core");
const { JSDOM } = require("jsdom");

test("loading an existing article is not undoable; the first user edit undoes to its original body", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const globals = {};
  for (const key of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "Node",
    "DOMParser",
    "MutationObserver",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "innerHeight",
    "innerWidth",
  ]) {
    globals[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value:
        typeof dom.window[key] === "function" &&
        [
          "getComputedStyle",
          "requestAnimationFrame",
          "cancelAnimationFrame",
        ].includes(key)
          ? dom.window[key].bind(dom.window)
          : dom.window[key],
    });
  }
  const oldAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const oldJsx = require.extensions[".jsx"];
  const oldCss = require.extensions[".css"];
  require.extensions[".jsx"] = (module, filename) => {
    const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
      filename,
      babelrc: false,
      configFile: false,
      presets: [
        ["@babel/preset-env", { targets: { node: "current" } }],
        ["@babel/preset-react", { runtime: "automatic" }],
      ],
    });
    module._compile(code, filename);
  };
  require.extensions[".css"] = () => {};
  let root;
  const { act, createElement, useState } = require("react");
  try {
    const RichTextEditor = require(
      path.resolve(__dirname, "../src/admin/RichTextEditor.jsx"),
    ).default;
    const { createRoot } = require("react-dom/client");
    const original =
      "## Pesquisa e participação\n\nUm artigo **já escrito**, com informações que precisam ser preservadas.";
    const changes = [];
    let replaceBody;
    function Harness() {
      const [body, setBody] = useState(original);
      replaceBody = setBody;
      return createElement(RichTextEditor, {
        value: body,
        onChange: (value) => {
          changes.push(value);
          setBody(value);
        },
      });
    }
    root = createRoot(document.getElementById("root"));
    await act(async () => {
      root.render(createElement(Harness));
    });
    const textbox = document.querySelector('[data-blog-field="body"]');
    const editor = textbox.editor; // Tiptap exposes this specifically for editor testing.
    const loadedDocument = editor.getJSON();
    assert.match(textbox.textContent, /Pesquisa e participação/);
    assert.equal(changes.length, 0, "loading the body must not request a save");
    assert.equal(
      editor.can().undo(),
      false,
      "initial hydration must not create an undo-to-empty step",
    );
    assert.equal(
      document.querySelector('button[aria-label="Desfazer"]').disabled,
      true,
    );

    await act(async () => {
      editor.commands.insertContentAt(
        editor.state.doc.content.size - 1,
        " Uma frase nova.",
      );
    });
    assert.equal(editor.can().undo(), true);
    assert.equal(changes.length, 1);
    assert.match(changes[0], /Uma frase nova/);
    await act(async () => {
      editor.commands.undo();
    });
    assert.deepEqual(
      editor.getJSON(),
      loadedDocument,
      "undo restores all pre-existing text and formatting",
    );
    assert.equal(
      editor.can().undo(),
      false,
      "the original document cannot be undone into an empty body",
    );
    assert.match(changes.at(-1), /\*\*já escrito\*\*/);
    assert.doesNotMatch(changes.at(-1), /Uma frase nova/);
    assert.equal(
      changes.some((value) => !value.trim()),
      false,
      "no undo emits an empty body for autosave",
    );
    await act(async () => {
      editor.commands.insertContentAt(
        editor.state.doc.content.size - 1,
        " Edição anterior à recuperação.",
      );
    });
    await act(async () => {
      replaceBody("## Versão recuperada\n\nConteúdo de outra revisão.");
    });
    assert.equal(
      editor.can().undo(),
      false,
      "loading another revision must clear history belonging to the old body",
    );
    assert.equal(
      editor.can().redo(),
      false,
      "previous undo steps cannot reintroduce text into a restored revision",
    );
    const restoredDocument = editor.getJSON();
    await act(async () => {
      editor.commands.insertContentAt(
        editor.state.doc.content.size - 1,
        " Uma nova edição.",
      );
      editor.commands.undo();
    });
    assert.deepEqual(
      editor.getJSON(),
      restoredDocument,
      "the new revision still supports undo for subsequent user edits",
    );
  } finally {
    if (root) await act(async () => root.unmount());
    // useEditor defers destruction by one task to support React strict-mode remounts.
    await new Promise((resolve) => setTimeout(resolve, 25));
    if (oldJsx) require.extensions[".jsx"] = oldJsx;
    else delete require.extensions[".jsx"];
    if (oldCss) require.extensions[".css"] = oldCss;
    else delete require.extensions[".css"];
    globalThis.IS_REACT_ACT_ENVIRONMENT = oldAct;
    for (const [key, descriptor] of Object.entries(globals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
  }
});
