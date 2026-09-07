const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { loadLatestPosts } = require("../src/js/blog-teaser-view.cjs");

function fixture(t) {
  const dom = new JSDOM(
    fs.readFileSync(path.join(__dirname, "../src/index.html"), "utf8"),
    {
      url: "https://nexo.example/",
    },
  );
  t.after(() => dom.window.close());
  return {
    window: dom.window,
    section: dom.window.document.querySelector("#blog-journal"),
    outlet: dom.window.document.querySelector("#journal-latest"),
  };
}
const post = (overrides = {}) => ({
  slug: "dialogos-no-nexo",
  title: "Diálogos no Nexo",
  publishedAt: "2026-09-07T02:00:00Z",
  coverImage: "",
  excerpt: "Resumo que não deve aparecer no teaser.",
  ...overrides,
});
const response = (posts) => async () => ({
  ok: true,
  json: async () => ({ posts }),
});

test("teaser presents only two recent titles, covers and Brazilian dates", async (t) => {
  const { section, outlet } = fixture(t);
  await loadLatestPosts(outlet, async (url, options) => {
    assert.equal(url, "/api/blog?sort=latest");
    assert.equal(options.credentials, "same-origin");
    return {
      ok: true,
      json: async () => ({
        posts: [
          post({
            title: "<img src=x onerror=alert(1)>",
            slug: "primeiro/artigo",
          }),
          post({ slug: "segundo", title: "Segunda publicação" }),
          post({ slug: "terceiro", title: "Terceira publicação" }),
        ],
      }),
    };
  });
  const cards = outlet.querySelectorAll(".journal-story");
  assert.equal(cards.length, 2);
  assert.equal(cards[0].getAttribute("href"), "/blog/primeiro%2Fartigo");
  assert.equal(
    cards[0].querySelector("h3").textContent,
    "<img src=x onerror=alert(1)>",
  );
  assert.equal(outlet.querySelectorAll("img").length, 0);
  assert.match(cards[0].querySelector("time").textContent, /^6 de set/);
  assert.equal(
    cards[0].querySelector("time").dateTime,
    "2026-09-07T02:00:00.000Z",
  );
  assert(!outlet.textContent.includes("Resumo"));
  assert(!outlet.textContent.includes("Terceira"));
  assert.equal(outlet.querySelector(".journal-empty"), null);
  assert.equal(
    section.querySelector(".journal-link").getAttribute("href"),
    "/blog/",
  );
});

test("empty blog has one compact message and retains its permanent link", async (t) => {
  const { section, outlet } = fixture(t);
  await loadLatestPosts(outlet, response([]));
  assert.equal(
    outlet.querySelector("p").textContent,
    "Novas publicações em breve.",
  );
  assert.equal(outlet.querySelectorAll(".journal-story, img").length, 0);
  assert.equal(section.querySelectorAll("a").length, 1);
  assert.equal(section.querySelector("h2").textContent, "Blog do Nexo");
});

test("failed and malformed responses preserve a usable fallback without claiming an empty blog", async (t) => {
  const failures = [
    async () => {
      throw new Error("Offline");
    },
    async () => ({ ok: false }),
    async () => ({
      ok: true,
      json: async () => {
        throw new Error("Invalid JSON");
      },
    }),
    async () => ({ ok: true, json: async () => ({ posts: null }) }),
    response([null, {}, { title: "", slug: "" }]),
  ];
  for (const fetchPosts of failures) {
    const { section, outlet } = fixture(t);
    await loadLatestPosts(outlet, fetchPosts);
    assert.equal(
      outlet.querySelector("p").textContent,
      "Acesse o blog para acompanhar.",
    );
    assert.equal(outlet.querySelectorAll(".journal-story").length, 0);
    assert.equal(section.querySelector("a").getAttribute("href"), "/blog/");
  }
});

test("cover failures restore the monogram and invalid dates stay out of the card", async (t) => {
  const { window, outlet } = fixture(t);
  await loadLatestPosts(
    outlet,
    response([
      post({
        coverImage: "/uploads/cover.webp",
        publishedAt: "invalid",
      }),
    ]),
  );
  const image = outlet.querySelector("img");
  const monogram = outlet.querySelector(".journal-monogram");
  assert.equal(image.src, "https://nexo.example/uploads/cover.webp");
  assert.equal(image.alt, "");
  image.dispatchEvent(new window.Event("load"));
  assert.equal(monogram.hidden, true);
  image.dispatchEvent(new window.Event("error"));
  assert.equal(outlet.querySelector("img"), null);
  assert.equal(monogram.hidden, false);
  assert.equal(outlet.querySelectorAll(".journal-story").length, 1);
  assert.equal(outlet.querySelector("time"), null);
});

test("unsafe cover protocols never become image sources", async (t) => {
  const { outlet } = fixture(t);
  await loadLatestPosts(
    outlet,
    response([
      post({ coverImage: "javascript:alert(1)" }),
      post({ slug: "second", coverImage: "data:image/svg+xml,<svg/>" }),
    ]),
  );
  assert.equal(outlet.querySelectorAll("img").length, 0);
  assert.equal(outlet.querySelectorAll(".journal-monogram").length, 2);
});

test("a stalled request returns to the fallback after its timeout", async (t) => {
  const { outlet } = fixture(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const loading = loadLatestPosts(
    outlet,
    (_, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("Timeout")), {
          once: true,
        });
      }),
  );
  assert.equal(
    outlet.querySelector("p").textContent,
    "Carregando publicações…",
  );
  t.mock.timers.tick(8000);
  await loading;
  assert.equal(
    outlet.querySelector("p").textContent,
    "Acesse o blog para acompanhar.",
  );
});
