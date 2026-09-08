const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { JSDOM } = require("jsdom");
const { DEFAULT_CONTENT } = require("../shared/content.cjs");
const {
  renderContent,
  loadContent,
  selectionState,
  safeUrl,
} = require("../src/js/cms.js");
const html = readFileSync(resolve(__dirname, "../src/index.html"), "utf8");
const copy = () => structuredClone(DEFAULT_CONTENT);
const setup = (url = "https://nexo.example/") => new JSDOM(html, { url });

test("published content updates sections, metadata, navigation and contact recipient together", () => {
  const { window } = setup();
  const content = copy();
  content.site.name = "Nexo atualizado";
  content.site.description = "Descrição para buscadores";
  content.site.email = "equipe@example.org";
  content.site.instagramHandle = "@novo.nexo";
  content.site.instagramUrl = "https://www.instagram.com/novo.nexo/";
  content.site.footerTitle = "Novo rodapé";
  content.sections.find((section) => section.id === "about").title =
    "Nossa comunidade";
  content.sections.find((section) => section.id === "about").label =
    "Comunidade";
  content.sections.find((section) => section.id === "objective").title =
    "Conectamos\npessoas.";
  content.sections.find((section) => section.id === "objective").extra.detail =
    "Novo detalhe";
  content.sections.find((section) => section.id === "more").visible = false;
  assert.equal(renderContent(window.document, content), true);
  assert.equal(window.document.title, "Nexo atualizado");
  assert.equal(
    window.document.querySelector('meta[name="description"]').content,
    "Descrição para buscadores",
  );
  assert.equal(
    window.document.querySelector("#contact-form").dataset.recipient,
    "equipe@example.org",
  );
  assert.equal(
    window.document.querySelector(".contact-address a").getAttribute("href"),
    "mailto:equipe@example.org",
  );
  assert.equal(
    window.document.querySelector(".instagram-profile").href,
    "https://www.instagram.com/novo.nexo/",
  );
  assert.equal(
    window.document.querySelector(".instagram-profile-handle").textContent,
    "@novo.nexo",
  );
  assert.equal(
    window.document.querySelector("footer h3").textContent,
    "Novo rodapé",
  );
  assert.equal(
    window.document.querySelector("#about-title").textContent,
    "Nossa comunidade",
  );
  assert.ok(
    window.document.querySelector("#about-title img"),
    "Decorative image is preserved",
  );
  assert.equal(
    window.document.querySelector("#objective-title span").textContent,
    "pessoas.",
  );
  assert.equal(
    window.document.querySelector(".objective-detail").textContent,
    "Novo detalhe",
  );
  assert.equal(
    window.document.querySelector('footer a[href="#about"]').textContent,
    "Comunidade",
  );
  assert.equal(window.document.querySelector("#more").hidden, true);
  assert.equal(
    window.document.querySelector('footer a[href="#more"]').hidden,
    true,
  );
  const structured = JSON.parse(
    window.document.querySelector('script[type="application/ld+json"]')
      .textContent,
  );
  assert.equal(structured.name, content.site.name);
  assert.deepEqual(structured.sameAs, [content.site.instagramUrl]);
});

test("contact links preserve valid reserved characters in the mailbox", (t) => {
  const { window } = setup();
  t.after(() => window.close());
  const content = copy();
  content.site.email = "equipe#nexo%contato@example.org";
  renderContent(window.document, content);
  const anchor = window.document.querySelector(".contact-address a");
  const form = window.document.querySelector("#contact-form");
  const destination = new URL(anchor.href);
  assert.equal(decodeURIComponent(destination.pathname), content.site.email);
  assert.equal(destination.hash, "");
  assert.equal(destination.search, "");
  assert.equal(anchor.textContent, content.site.email);
  assert.equal(form.action, anchor.href);
  assert.equal(form.dataset.recipient, content.site.email);
});

test("content strings stay literal and unsafe URLs cannot become executable links or images", () => {
  const { window } = setup();
  const content = copy();
  const about = content.sections.find((section) => section.id === "about");
  about.title = "<img src=x onerror=alert(1)>";
  about.items[0].url = "javascript:alert(1)";
  about.items[0].image = "data:image/svg+xml,<svg onload=alert(1) />";
  content.selection.status = "open";
  content.selection.applicationUrl = "javascript:alert(1)";
  content.selection.noticeUrl = "data:text/html,hello";
  content.site.instagramUrl = "javascript:alert(1)";
  renderContent(window.document, content);
  assert.match(
    window.document.querySelector("#about-title").textContent,
    /^<img src=x onerror=alert\(1\)>$/,
  );
  assert.equal(
    window.document.querySelectorAll("[onerror], [onload]").length,
    0,
  );
  assert.equal(window.document.querySelector("#about-list a"), null);
  assert.equal(
    window.document.querySelector("#about-list img").getAttribute("src"),
    null,
  );
  assert.equal(
    window.document.querySelector(".instagram-profile").getAttribute("href"),
    null,
  );
  assert.equal(window.document.querySelector(".cms-application-button"), null);
  assert.equal(
    window.document.querySelector("#selective-process-content a").hidden,
    true,
  );
  assert.equal(safeUrl("//evil.example/path"), "");
  assert.equal(safeUrl("/assets/../private.png", true), "");
  assert.equal(safeUrl("/uploads/333f-cba.pdf"), "/uploads/333f-cba.pdf");
  assert.equal(
    safeUrl("/uploads/333f-cba.webp", true),
    "/uploads/333f-cba.webp",
  );
  assert.equal(safeUrl("/uploads/333f-cba.pdf", true), "");
});

test("hero photo can change without losing default responsive sources or legacy content", () => {
  const { window } = setup();
  const content = copy();
  const introduction = content.sections.find(
    (section) => section.id === "introduction",
  );
  const image = window.document.querySelector("#introduction-image img");
  const source = window.document.querySelector("#introduction-image source");
  const originalSrc = image.getAttribute("src");
  const originalSrcset = source.getAttribute("srcset");
  renderContent(window.document, content);
  assert.equal(image.getAttribute("src"), originalSrc);
  assert.equal(source.getAttribute("srcset"), originalSrcset);
  introduction.extra = {};
  renderContent(window.document, content);
  assert.equal(image.getAttribute("src"), originalSrc);
  assert.equal(
    window.document.querySelector("#introduction-image source"),
    source,
  );
  introduction.extra.imageAlt = "Fachada histórica da Faculdade de Direito";
  renderContent(window.document, content);
  assert.equal(image.alt, introduction.extra.imageAlt);
  assert.equal(source.getAttribute("srcset"), originalSrcset);
  introduction.extra.image = "/uploads/nova-foto.webp";
  renderContent(window.document, content);
  assert.equal(image.getAttribute("src"), "/uploads/nova-foto.webp");
  assert.equal(image.alt, introduction.extra.imageAlt);
  assert.equal(
    window.document.querySelector("#introduction-image source"),
    null,
  );
});

test("clearing the hero image removes the published photo and can be reversed", (t) => {
  const { window } = setup();
  t.after(() => window.close());
  const content = copy();
  const introduction = content.sections.find(
    (section) => section.id === "introduction",
  );
  introduction.extra.image = "";
  renderContent(window.document, content);
  const image = window.document.querySelector("#introduction-image img");
  assert.equal(image.hidden, true);
  assert.equal(image.getAttribute("src"), null);
  assert.equal(
    window.document.querySelector("#introduction-image source"),
    null,
  );

  introduction.extra.image = "/uploads/replacement.webp";
  introduction.extra.imageAlt = "Nova fachada";
  renderContent(window.document, content);
  assert.equal(image.hidden, false);
  assert.equal(image.getAttribute("src"), introduction.extra.image);
  assert.equal(image.alt, "Nova fachada");
});

test("objective diagram describes its visible labels when optional fields are absent", (t) => {
  const { window } = setup();
  t.after(() => window.close());
  const content = copy();
  const objective = content.sections.find(
    (section) => section.id === "objective",
  );
  objective.extra = { civilLabel: "Nossa comunidade" };
  renderContent(window.document, content);
  assert.equal(
    window.document.querySelector(".objective-map").getAttribute("aria-label"),
    "Nossa comunidade: Executivo, Legislativo, Judiciário. República Federativa do Brasil",
  );

  objective.extra.executiveLabel = "";
  objective.extra.republicLabel = "";
  renderContent(window.document, content);
  assert.equal(
    window.document.querySelector(".objective-map").getAttribute("aria-label"),
    "Nossa comunidade: Legislativo, Judiciário",
  );
});

test("selection links honor explicit status, opening date and closing date in São Paulo", () => {
  const selection = {
    ...DEFAULT_CONTENT.selection,
    status: "open",
    opensAt: "2026-09-10",
    closesAt: "2026-09-12",
    applicationUrl: "https://example.org/apply",
  };
  assert.equal(
    selectionState(selection, Date.parse("2026-09-10T02:59:59Z")),
    "upcoming",
  );
  assert.equal(
    selectionState(selection, Date.parse("2026-09-10T03:00:00Z")),
    "open",
  );
  assert.equal(
    selectionState(selection, Date.parse("2026-09-13T02:59:59Z")),
    "open",
  );
  assert.equal(
    selectionState(selection, Date.parse("2026-09-13T03:00:00Z")),
    "closed",
  );
  assert.equal(
    selectionState(
      { ...selection, status: "closed" },
      Date.parse("2026-09-11T12:00:00Z"),
    ),
    "closed",
  );
  assert.equal(selectionState({ ...selection, opensAt: "invalid" }), "closed");
  assert.equal(
    selectionState({ ...selection, opensAt: "2026-09-20" }),
    "closed",
  );
  const { window } = setup();
  const content = copy();
  content.selection = selection;
  renderContent(window.document, content, {
    now: Date.parse("2026-09-10T02:59:59Z"),
  });
  assert.equal(
    window.document
      .querySelector(".cms-application-button")
      .getAttribute("href"),
    null,
  );
  assert.equal(
    window.document
      .querySelector(".cms-application-button")
      .getAttribute("aria-disabled"),
    "true",
  );
  renderContent(window.document, content, {
    now: Date.parse("2026-09-11T12:00:00Z"),
  });
  assert.equal(
    window.document.querySelector(".cms-application-button").href,
    "https://example.org/apply",
  );
  assert.equal(
    window.document
      .querySelector(".cms-application-button")
      .getAttribute("aria-disabled"),
    null,
  );
  assert.equal(
    window.document.querySelector(".cms-selection-status").textContent,
    "Inscrições abertas",
  );
  renderContent(window.document, content, {
    now: Date.parse("2026-09-13T03:00:00Z"),
  });
  assert.equal(
    window.document
      .querySelector(".cms-application-button")
      .getAttribute("href"),
    null,
  );
});

test("structured selection stages replace the historical image and can be cleared", () => {
  const { window } = setup();
  const content = copy();
  content.selection.edition = "Nova edição";
  content.selection.description = "Descrição atualizada";
  content.selection.stages = [
    {
      id: "first",
      title: "Inscrições",
      date: "2026-09-10",
      description: "Consulte o edital.",
    },
  ];
  renderContent(window.document, content);
  assert.equal(
    window.document.querySelector("#selective-process-schedule img").hidden,
    true,
  );
  assert.equal(
    window.document.querySelector(".cms-selection-stages h4").textContent,
    "Inscrições",
  );
  assert.equal(
    window.document.querySelector(".cms-stage-date").textContent,
    "10 de setembro de 2026",
  );
  assert.equal(
    window.document.querySelector(".cms-selection-edition").textContent,
    "Nova edição",
  );
  assert.equal(
    window.document.querySelector(".cms-selection-description").textContent,
    "Descrição atualizada",
  );
  content.selection.stages = [];
  renderContent(window.document, content);
  assert.equal(window.document.querySelector(".cms-selection-stages"), null);
  assert.equal(
    window.document.querySelector("#selective-process-schedule img").hidden,
    false,
  );
});

test("a cleared published schedule hides its empty heading and reappears with new stages", (t) => {
  const { window } = setup();
  t.after(() => window.close());
  const content = copy();
  content.selection.scheduleImage = "";
  renderContent(window.document, content);
  const schedule = window.document.querySelector("#selective-process-schedule");
  assert.equal(schedule.hidden, true);

  content.selection.stages = [
    { id: "new", title: "Inscrições", date: "2026-09-10", description: "" },
  ];
  renderContent(window.document, content);
  assert.equal(schedule.hidden, false);
  assert.equal(schedule.querySelector("h4").textContent, "Inscrições");
  content.selection.stages = [];
  renderContent(window.document, content);
  assert.equal(schedule.hidden, true);

  content.selection.scheduleImage = DEFAULT_CONTENT.selection.scheduleImage;
  renderContent(window.document, content);
  assert.equal(schedule.hidden, false);
  assert.equal(schedule.querySelector("img").hidden, false);
});

function selectionClock(window, initial) {
  let now = Date.parse(initial);
  let serial = 0;
  const timers = new Map();
  return {
    timers,
    browser: {
      location: window.location,
      Date: { now: () => now },
      setTimeout(callback, delay) {
        const id = ++serial;
        timers.set(id, { callback, at: now + delay });
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
      addEventListener: window.addEventListener.bind(window),
      removeEventListener: window.removeEventListener.bind(window),
    },
    advance(value, runTimers = true) {
      const target = Date.parse(value);
      if (runTimers) {
        while (true) {
          const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
          if (!next || next[1].at > target) break;
          now = next[1].at;
          timers.delete(next[0]);
          next[1].callback();
        }
      }
      now = target;
    },
  };
}

test("an open page updates application access at São Paulo boundaries without reloading", async (t) => {
  const { window } = setup();
  t.after(() => window.close());
  const content = copy();
  Object.assign(content.selection, {
    status: "open",
    opensAt: "2026-09-10",
    closesAt: "2026-09-10",
    applicationUrl: "https://example.org/apply",
  });
  const clock = selectionClock(window, "2026-09-10T02:59:59Z");
  await loadContent(window.document, clock.browser, async () => ({
    ok: true,
    json: async () => ({ content }),
  }));
  const application = window.document.querySelector(".cms-application-button");
  assert.equal(application.getAttribute("href"), null);
  assert.equal(clock.timers.size, 1);
  clock.advance("2026-09-10T03:00:00Z");
  assert.equal(application.href, content.selection.applicationUrl);
  assert.equal(application.hasAttribute("aria-disabled"), false);
  assert.equal(clock.timers.size, 1);
  clock.advance("2026-09-11T02:59:59.999Z");
  assert.equal(application.href, content.selection.applicationUrl);
  clock.advance("2026-09-11T03:00:00Z");
  assert.equal(application.getAttribute("href"), null);
  assert.equal(application.getAttribute("aria-disabled"), "true");
  assert.equal(
    window.document.querySelector(".cms-selection-status").textContent,
    "Processo seletivo fechado",
  );
  assert.equal(clock.timers.size, 0);
});

test("a suspended timer cannot allow an expired application and old watchers stop on replacement", async (t) => {
  const { window } = setup();
  t.after(() => window.close());
  const content = copy();
  Object.assign(content.selection, {
    status: "open",
    closesAt: "2026-09-10",
    applicationUrl: "https://example.org/apply",
  });
  const clock = selectionClock(window, "2026-09-10T20:00:00Z");
  const fetcher = async () => ({ ok: true, json: async () => ({ content }) });
  await loadContent(window.document, clock.browser, fetcher);
  await loadContent(window.document, clock.browser, fetcher);
  assert.equal(
    clock.timers.size,
    1,
    "Reloading content replaces the old timer",
  );
  clock.advance("2026-09-11T03:00:00Z", false);
  const application = window.document.querySelector(".cms-application-button");
  const click = new window.MouseEvent("click", {
    bubbles: true,
    cancelable: true,
  });
  application.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true);
  assert.equal(application.getAttribute("href"), null);
  assert.equal(clock.timers.size, 0);

  content.selection.closesAt = "2026-09-12";
  await loadContent(window.document, clock.browser, fetcher);
  assert.equal(clock.timers.size, 1);
  const replacement = copy();
  replacement.selection.applicationUrl = "https://example.org/next-edition";
  renderContent(window.document, replacement);
  assert.equal(clock.timers.size, 0);
  window.dispatchEvent(new window.Event("pageshow"));
  assert.equal(application.getAttribute("href"), null);
});

test("project image edits remove old responsive sources and collections support additions/removals", () => {
  const { window } = setup();
  const content = copy();
  const projects = content.sections.find((section) => section.id === "more");
  projects.items[0].image = "https://example.org/new-photo.jpg";
  projects.items[0].url = "https://example.org/project";
  projects.items[0].alt = "Nova imagem";
  projects.extra.schoolCategory = "Formação";
  const gallery = content.sections.find(
    (section) => section.id === "recognize",
  );
  gallery.items = [gallery.items[0]];
  renderContent(window.document, content);
  assert.equal(
    window.document.querySelector(".more-project img").src,
    "https://example.org/new-photo.jpg",
  );
  assert.equal(
    window.document
      .querySelector(".more-project")
      .querySelector("picture source"),
    null,
  );
  assert.equal(
    window.document.querySelector(".more-project img").alt,
    "Nova imagem",
  );
  assert.equal(
    window.document.querySelector(".more-project h3 a").href,
    "https://example.org/project",
  );
  assert.match(
    window.document.querySelector(".more-category").textContent,
    /Formação/,
  );
  assert.equal(
    window.document.querySelectorAll("#recognize-gallery figure").length,
    1,
  );
  projects.items.push({
    ...projects.items[0],
    id: "new",
    title: "Novo projeto",
  });
  renderContent(window.document, content);
  assert.equal(window.document.querySelectorAll(".more-project").length, 4);
  assert.equal(
    window.document.querySelectorAll(".more-project")[3].querySelector("h3")
      .textContent,
    "Novo projeto",
  );
});

test("API outage preserves the original public landing with no draft request", async () => {
  const { window } = setup();
  const before = window.document.body.innerHTML;
  const calls = [];
  const result = await loadContent(window.document, window, async (url) => {
    calls.push(url);
    throw new Error("offline");
  });
  assert.equal(result, false);
  assert.deepEqual(calls, ["/api/content"]);
  assert.equal(window.document.body.innerHTML, before);
});

test("preview loads only the authenticated preview endpoint and clearly marks saved drafts", async () => {
  const { window } = setup("https://nexo.example/?preview=1");
  const content = copy();
  content.sections[0].title = "Rascunho editorial";
  const calls = [];
  await loadContent(window.document, window, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ content }) };
  });
  assert.equal(calls[0].url, "/api/admin/preview");
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.equal(
    window.document.querySelector("#introduction h1").textContent,
    "Rascunho editorial",
  );
  assert.match(
    window.document.querySelector(".cms-preview-banner").textContent,
    /ainda não publicado/,
  );
});

test("unauthenticated preview does not render or request draft content elsewhere", async () => {
  const { window } = setup("https://nexo.example/?preview=1");
  const calls = [];
  const original =
    window.document.querySelector("#introduction h1").textContent;
  await loadContent(window.document, window, async (url) => {
    calls.push(url);
    return {
      ok: false,
      status: 401,
      json: async () => {
        throw new Error("Must not parse an unauthorized body");
      },
    };
  });
  assert.deepEqual(calls, ["/api/admin/preview"]);
  assert.equal(
    window.document.querySelector("#introduction h1").textContent,
    original,
  );
  assert.match(
    window.document.querySelector(".cms-preview-banner").textContent,
    /Prévia indisponível/,
  );
});
