const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const babel = require("@babel/core");
const { JSDOM } = require("jsdom");
const { emptyPost } = require("../shared/blog.cjs");

test("autosave preserves newer edits and ignores errors belonging to another article", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost/admin/#blog/post-1",
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
    "MutationObserver",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ]) {
    globals[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: ["requestAnimationFrame", "cancelAnimationFrame"].includes(key)
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
  const modulePaths = [
    "api.js",
    "useDraftRecovery.js",
    "RichTextEditor.jsx",
  ].map((name) => path.resolve(__dirname, "../src/admin", name));
  const previousModules = modulePaths.map((name) => require.cache[name]);
  let root;
  const { act, createElement } = require("react");
  let pending;
  const post = {
    id: "post-1",
    version: 1,
    archived: false,
    published: null,
    updatedAt: "2026-09-07T12:00:00Z",
    draft: {
      ...emptyPost(),
      title: "Título inicial",
      slug: "titulo-inicial",
      tags: ["Pesquisa"],
    },
  };
  const otherPost = {
    ...post,
    id: "post-2",
    draft: { ...post.draft, title: "Outro artigo", slug: "outro-artigo" },
  };
  require.cache[modulePaths[0]] = {
    exports: {
      api: async (url, options = {}) => {
        if (options.method === "PUT")
          return new Promise((resolve, reject) => {
            pending = { resolve, reject, body: options.body };
          });
        return { post: url.endsWith("/post-2") ? otherPost : post };
      },
    },
  };
  require.cache[modulePaths[1]] = {
    exports: {
      useDraftRecovery: () => ({
        recovery: null,
        available: true,
        persist() {},
        restore() {},
        discard() {},
      }),
    },
  };
  require.cache[modulePaths[2]] = {
    exports: { __esModule: true, default: () => null },
  };
  try {
    const BlogWorkspace = require("../src/admin/BlogWorkspace.jsx").default;
    const { createRoot } = require("react-dom/client");
    root = createRoot(document.getElementById("root"));
    await act(async () => {
      root.render(
        createElement(BlogWorkspace, {
          route: "blog/post-1",
          session: { user: { id: "editor" } },
        }),
      );
    });
    async function input(field, value) {
      const element = document.querySelector(`[data-blog-field="${field}"]`);
      const prototype =
        element.tagName === "TEXTAREA"
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      await act(async () => {
        Object.getOwnPropertyDescriptor(prototype, "value").set.call(
          element,
          value,
        );
        element.dispatchEvent(new window.Event("input", { bubbles: true }));
      });
    }
    await input("title", "Título alterado");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1600));
    });
    assert.ok(pending, "the first edit starts an autosave");
    await input("slug", "endereco-escolhido");
    await input("tags", "Pesquisa, ");
    await act(async () => {
      pending.resolve({
        post: { ...post, version: 2, draft: pending.body.post },
      });
    });
    assert.equal(
      document.querySelector('[data-blog-field="tags"]').value,
      "Pesquisa, ",
      "a response must preserve the comma being used to type another tag",
    );
    await input("title", "Título final");
    assert.equal(
      document.querySelector('[data-blog-field="slug"]').value,
      "endereco-escolhido",
      "editing the title must not overwrite the URL chosen while saving",
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1600));
    });
    const previousArticleSave = pending;
    await act(async () => {
      root.render(
        createElement(BlogWorkspace, {
          route: "blog/post-2",
          session: { user: { id: "editor" } },
        }),
      );
    });
    assert.equal(
      document.querySelector('[data-blog-field="title"]').value,
      "Outro artigo",
    );
    await act(async () => {
      previousArticleSave.reject(
        Object.assign(new Error("Este artigo foi atualizado."), {
          status: 409,
          code: "VERSION_CONFLICT",
        }),
      );
    });
    assert.equal(
      !!document.querySelector('[role="dialog"]'),
      false,
      "an old article's delayed conflict must not block the newly opened article",
    );
    assert.equal(
      document.querySelector('[data-blog-field="title"]').value,
      "Outro artigo",
      "the newly opened article remains available for editing",
    );
    await input("title", "Edição antes de reabrir");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1600));
    });
    const previousVisitSave = pending;
    for (const route of ["blog/post-1", "blog/post-2"])
      await act(async () => {
        root.render(
          createElement(BlogWorkspace, {
            route,
            session: { user: { id: "editor" } },
          }),
        );
      });
    await act(async () => {
      previousVisitSave.resolve({
        post: {
          ...otherPost,
          version: 2,
          draft: previousVisitSave.body.post,
        },
      });
    });
    assert.equal(
      document.querySelector('[data-blog-field="title"]').value,
      "Outro artigo",
    );
    assert.match(
      document.querySelector(".blog-save-status").textContent,
      /Rascunho salvo/,
      "a response from an earlier visit cannot turn a freshly loaded revision into an unsaved edit",
    );
  } finally {
    if (root) await act(async () => root.unmount());
    modulePaths.forEach((name, index) => {
      if (previousModules[index]) require.cache[name] = previousModules[index];
      else delete require.cache[name];
    });
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
