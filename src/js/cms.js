/* This adapter leaves the original landing intact when the content service is unavailable. */
(function cmsModule(globalScope) {
  "use strict";

  const normalizeText = (value) =>
    String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  const sectionSelectors = {
    introduction: {
      title: "#introduction-content h1",
      description: "#introduction-content > p",
      anchor: "#introduction-content",
    },
    about: {
      title: "#about-title",
      description: "#about-description",
      anchor: "#about > div",
    },
    objective: {
      title: "#objective-title",
      description: ".objective-lead",
      anchor: ".objective-content",
    },
    recognize: {
      title: "#recognize-title",
      description: "#recognize-description",
      anchor: ".recognize-header",
    },
    more: {
      title: "#more-title",
      description: "#more-description",
      eyebrow: ".more-eyebrow",
      anchor: ".more-header > div",
    },
    instagram: {
      title: "#instagram-title",
      description: ".instagram-description",
      eyebrow: ".instagram-eyebrow",
      anchor: ".instagram-content",
    },
    contact: {
      title: "#contact-title",
      description: ".contact-description",
      eyebrow: ".contact-eyebrow",
      anchor: "#contact-content",
    },
  };

  function safeUrl(value, image = false) {
    if (typeof value !== "string" || !value.trim()) return "";
    const input = value.trim();
    if (/[\u0000-\u001f\u007f\\]/.test(input)) return "";
    if (
      /^\/uploads\/[a-zA-Z0-9-]+\.(?:png|jpe?g|webp|avif|pdf)$/.test(input) &&
      (!image || !input.endsWith(".pdf"))
    )
      return input;
    if (
      image &&
      /^\/?assets\/[a-zA-Z0-9_./-]+$/.test(input) &&
      !input.includes("..")
    )
      return input.startsWith("/") ? input : `/${input}`;
    try {
      const parsed = new URL(input);
      return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : "";
    } catch (_) {
      return "";
    }
  }

  function text(document, selector, value) {
    const element = document.querySelector(selector);
    if (
      element &&
      typeof value === "string" &&
      normalizeText(element.textContent) !== normalizeText(value)
    ) {
      element.textContent = value;
    }
    return element;
  }

  // Keep decorative images/lines while replacing the human-readable label.
  function decorativeText(document, element, value) {
    if (
      !element ||
      typeof value !== "string" ||
      normalizeText(element.textContent) === normalizeText(value)
    )
      return;
    const decorations = Array.from(element.children).filter(
      (child) =>
        child.tagName === "IMG" || child.getAttribute("aria-hidden") === "true",
    );
    element.replaceChildren(document.createTextNode(value));
    decorations.forEach((child) => element.appendChild(child));
  }

  function titleText(document, element, value) {
    if (
      !element ||
      typeof value !== "string" ||
      normalizeText(element.textContent) === normalizeText(value)
    )
      return;
    if (element.querySelector("img")) {
      decorativeText(document, element, value);
      return;
    }
    const accent = element.querySelector("span");
    if (!accent) {
      element.textContent = value;
      return;
    }
    const lines = value.split("\n");
    const words = value.trim().split(/\s+/);
    const first = lines.length > 1 ? lines[0] : words.slice(0, -2).join(" ");
    const last =
      lines.length > 1 ? lines.slice(1).join(" ") : words.slice(-2).join(" ");
    const span = document.createElement("span");
    span.className = accent.className;
    span.textContent = first ? last : value;
    element.replaceChildren();
    if (first) {
      element.appendChild(document.createTextNode(first));
      element.appendChild(
        value.includes("\n")
          ? document.createElement("br")
          : document.createTextNode(" "),
      );
    }
    element.appendChild(span);
  }

  function managedElement(document, parent, tag, className, before) {
    let element = parent.querySelector(`.${className}`);
    if (!element) {
      element = document.createElement(tag);
      element.className = className;
      parent.insertBefore(element, before || null);
    }
    return element;
  }

  function optionalText(document, parent, className, value, tag = "p", before) {
    const existing = parent.querySelector(`.${className}`);
    if (!value) {
      if (existing) existing.remove();
      return null;
    }
    const element = managedElement(document, parent, tag, className, before);
    element.textContent = value;
    return element;
  }

  function setImage(document, image, source, alt) {
    if (!image) return;
    const accepted = safeUrl(source, true);
    if (!accepted) {
      image.hidden = true;
      image.removeAttribute("src");
      if (image.parentElement.tagName === "PICTURE")
        image.parentElement
          .querySelectorAll("source")
          .forEach((entry) => entry.remove());
      return;
    }
    image.hidden = false;
    const current = (image.getAttribute("src") || "").replace(/^\.?\//, "");
    if (current !== accepted.replace(/^\//, "")) {
      image.setAttribute("src", accepted);
      image.removeAttribute("srcset");
      if (image.parentElement.tagName === "PICTURE")
        image.parentElement
          .querySelectorAll("source")
          .forEach((entry) => entry.remove());
    }
    image.alt = alt || "";
  }

  function linkedTitle(document, element, item) {
    if (!element) return;
    const href = safeUrl(item.url);
    if (!href) {
      element.textContent = item.title;
      return;
    }
    const link = document.createElement("a");
    link.href = href;
    link.textContent = item.title;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    element.replaceChildren(link);
  }

  function renderIntroduction(document, extra) {
    const image = document.querySelector("#introduction-image img");
    if (!image) return;
    if (typeof extra.image === "string") {
      setImage(
        document,
        image,
        extra.image,
        typeof extra.imageAlt === "string" ? extra.imageAlt : image.alt,
      );
    } else if (typeof extra.imageAlt === "string") {
      image.alt = extra.imageAlt;
    }
  }

  function renderChecklist(document, items) {
    const list = document.querySelector("#about-list");
    if (!list) return;
    list.replaceChildren();
    items.forEach((item) => {
      const li = document.createElement("li");
      const title = document.createElement("span");
      linkedTitle(document, title, item);
      li.appendChild(title);
      if (item.image) {
        const img = document.createElement("img");
        img.className = "cms-list-image";
        img.loading = "lazy";
        li.prepend(img);
        setImage(document, img, item.image, item.alt);
      }
      optionalText(document, li, "cms-item-description", item.description);
      optionalText(document, li, "cms-item-detail", item.detail);
      list.appendChild(li);
    });
  }

  function renderGallery(document, items) {
    const gallery = document.querySelector("#recognize-gallery");
    if (!gallery) return;
    const current = Array.from(gallery.querySelectorAll("figure"));
    items.forEach((item, index) => {
      let figure = current[index];
      if (!figure) {
        figure = document.createElement("figure");
        const img = document.createElement("img");
        img.loading = "lazy";
        img.decoding = "async";
        figure.append(img, document.createElement("figcaption"));
        gallery.appendChild(figure);
      }
      const shape = ["president", "vice", "senate", "labor", "deputies"][index];
      figure.className = `recognize-photo${shape ? ` recognize-photo--${shape}` : " cms-gallery-extra"}`;
      setImage(document, figure.querySelector("img"), item.image, item.alt);
      const caption = figure.querySelector("figcaption");
      linkedTitle(document, caption, item);
      optionalText(document, caption, "cms-item-description", item.description);
      optionalText(document, caption, "cms-item-detail", item.detail);
    });
    current.slice(items.length).forEach((figure) => figure.remove());
  }

  function renderProjects(document, items, extra) {
    const grid = document.querySelector("#more-grid");
    if (!grid) return;
    const current = Array.from(grid.querySelectorAll(".more-project"));
    items.forEach((item, index) => {
      let card = current[index];
      if (!card) {
        card = document.createElement("article");
        const picture = document.createElement("picture");
        picture.className = "more-visual";
        const img = document.createElement("img");
        img.loading = "lazy";
        img.decoding = "async";
        picture.appendChild(img);
        const copy = document.createElement("div");
        copy.className = "more-copy";
        const category = document.createElement("p");
        category.className = "more-category";
        const title = document.createElement("h3");
        const summary = document.createElement("p");
        summary.className = "more-summary";
        const detail = document.createElement("p");
        detail.className = "more-detail";
        copy.append(category, title, summary, detail);
        card.append(picture, copy);
        grid.appendChild(card);
      }
      card.className = `more-project${index === 0 ? " more-project--featured" : ""}${item.id === "travel" ? " more-project--travel" : ""}`;
      const heading = card.querySelector("h3");
      heading.id = `cms-project-${index}-title`;
      card.setAttribute("aria-labelledby", heading.id);
      linkedTitle(document, heading, item);
      card.querySelector(".more-summary").textContent = item.description;
      card.querySelector(".more-detail").textContent = item.detail;
      setImage(document, card.querySelector("img"), item.image, item.alt);
      const category = card.querySelector(".more-category");
      const number = document.createElement("span");
      number.setAttribute("aria-hidden", "true");
      number.textContent = String(index + 1).padStart(2, "0");
      category.replaceChildren(
        number,
        document.createTextNode(` ${extra[`${item.id}Category`] || ""}`),
      );
    });
    current.slice(items.length).forEach((card) => card.remove());
  }

  function renderSection(document, section) {
    const root = document.getElementById(section.id);
    if (!root) return;
    root.hidden = section.visible === false;
    document
      .querySelectorAll(`footer nav a[href="#${section.id}"]`)
      .forEach((link) => {
        link.hidden = root.hidden;
        link.textContent = section.label;
      });
    const selectors = sectionSelectors[section.id];
    if (!selectors) return;
    if (section.id === "recognize") {
      const title = document.querySelector(selectors.title);
      const context = title && title.querySelector(".recognize-title-context");
      const existingBody = title
        ? normalizeText(
            Array.from(title.childNodes)
              .filter((node) => node !== context)
              .map((node) => node.textContent)
              .join(" "),
          )
        : "";
      if (title && existingBody !== normalizeText(section.title)) {
        const lead = document.createElement("span");
        lead.className = "recognize-title-context";
        lead.textContent = section.eyebrow;
        const accent = document.createElement("span");
        accent.className = "recognize-title-accent";
        accent.textContent = section.title;
        title.replaceChildren(lead, document.createTextNode(" "), accent);
      } else if (context) context.textContent = section.eyebrow;
    } else {
      titleText(
        document,
        document.querySelector(selectors.title),
        section.title,
      );
      let eyebrow =
        selectors.eyebrow && document.querySelector(selectors.eyebrow);
      const anchor = document.querySelector(selectors.anchor);
      if (!eyebrow && anchor && section.eyebrow)
        eyebrow = managedElement(
          document,
          anchor,
          "p",
          "cms-section-eyebrow",
          anchor.firstChild,
        );
      if (!eyebrow && anchor)
        eyebrow = anchor.querySelector(".cms-section-eyebrow");
      if (eyebrow) {
        decorativeText(document, eyebrow, section.eyebrow);
        eyebrow.hidden = !section.eyebrow;
      }
    }
    text(document, selectors.description, section.description);
    const extra = section.extra || {};
    if (section.id === "introduction") renderIntroduction(document, extra);
    const mappings = {
      about: {
        listTitle: "#about-list-title",
        videoTitle: "#about-video-title",
        videoDescription: "#about-video-description",
      },
      objective: {
        detail: ".objective-detail",
        invitation: ".objective-invitation",
        civilLabel: ".objective-civil",
        executiveLabel: ".objective-powers span:nth-child(1)",
        legislativeLabel: ".objective-powers span:nth-child(2)",
        judiciaryLabel: ".objective-powers span:nth-child(3)",
        republicLabel: ".objective-republic",
      },
      recognize: {
        galleryTitle: "#recognize-gallery-title",
        membersValue: ".recognize-stats > div:nth-child(1) dd",
        membersLabel: ".recognize-stats > div:nth-child(1) dt",
        universitiesValue: ".recognize-stats > div:nth-child(2) dd",
        universitiesLabel: ".recognize-stats > div:nth-child(2) dt",
      },
      instagram: {
        profileTitle: ".instagram-profile h3",
        profileSubtitle: ".instagram-profile-subtitle",
        institution: ".instagram-profile-institution",
        profileCta: ".instagram-profile-cta",
      },
      contact: {
        availability: ".contact-availability",
        emailLabel: ".contact-address > div > p",
        formTitle: "#contact-form-title",
        formDescription: ".contact-form-heading > p",
        formHelp: "#contact-form-help",
        submitLabel: ".contact-submit > span",
      },
    };
    Object.entries(mappings[section.id] || {}).forEach(([key, selector]) =>
      text(document, selector, extra[key]),
    );
    if (section.id === "objective") {
      const diagram = document.querySelector(".objective-map");
      if (diagram) {
        const label = (selector) =>
          normalizeText(document.querySelector(selector)?.textContent);
        const powers = Array.from(
          document.querySelectorAll(".objective-powers span"),
          (element) => normalizeText(element.textContent),
        ).filter(Boolean);
        diagram.setAttribute(
          "aria-label",
          [
            [label(".objective-civil"), powers.join(", ")]
              .filter(Boolean)
              .join(": "),
            label(".objective-republic"),
          ]
            .filter(Boolean)
            .join(". "),
        );
      }
    }
    if (section.id === "recognize") {
      titleText(
        document,
        document.querySelector("#recognize-community-title"),
        extra.communityTitle,
      );
      renderGallery(document, section.items || []);
    }
    if (section.id === "about") renderChecklist(document, section.items || []);
    if (section.id === "more")
      renderProjects(document, section.items || [], extra);
  }

  function parseBoundary(value, endOfDay = false) {
    if (!value) return null;
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}-03:00`
      : value;
    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function selectionState(selection, now = Date.now()) {
    const opens = parseBoundary(selection.opensAt);
    const closes = parseBoundary(selection.closesAt, true);
    if (
      (opens !== null && !Number.isFinite(opens)) ||
      (closes !== null && !Number.isFinite(closes)) ||
      (opens !== null && closes !== null && closes < opens)
    )
      return "closed";
    if (selection.status !== "open")
      return selection.status === "upcoming" ? "upcoming" : "closed";
    if (closes !== null && now > closes) return "closed";
    if (opens !== null && now < opens) return "upcoming";
    return "open";
  }

  function formatDate(value) {
    const timestamp = parseBoundary(value);
    if (!Number.isFinite(timestamp)) return value || "";
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "long",
      timeZone: "America/Sao_Paulo",
    }).format(timestamp);
  }

  function renderSelection(document, selection, now) {
    const root = document.querySelector("#selective-process-content");
    const schedule = document.querySelector("#selective-process-schedule");
    if (!root || !schedule) return;
    const state = selectionState(selection, now);
    const status = root.querySelector(":scope > p");
    if (status) {
      status.textContent = {
        closed: "Processo seletivo fechado",
        upcoming: "Processo seletivo em breve",
        open: "Inscrições abertas",
      }[state];
      status.className = `cms-selection-status cms-selection-status--${state}`;
    }
    text(document, "#selective-process-content h2", selection.title);
    optionalText(
      document,
      root,
      "cms-selection-edition",
      selection.edition,
      "span",
      root.querySelector("h2"),
    );
    optionalText(
      document,
      root,
      "cms-selection-description",
      selection.description,
      "div",
      root.querySelector("a"),
    );
    const dates = [
      selection.opensAt ? `Abertura: ${formatDate(selection.opensAt)}` : "",
      selection.closesAt
        ? `Encerramento: ${formatDate(selection.closesAt)}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
    optionalText(
      document,
      root,
      "cms-selection-dates",
      dates,
      "div",
      root.querySelector("a"),
    );
    const notice = root.querySelector("a:not(.cms-application-button)");
    const noticeHref = safeUrl(selection.noticeUrl);
    if (notice) {
      notice.hidden = !noticeHref;
      if (noticeHref) notice.href = noticeHref;
      else notice.removeAttribute("href");
      notice.rel = "noopener noreferrer";
    }
    const applicationHref = safeUrl(selection.applicationUrl);
    let application = root.querySelector(".cms-application-button");
    if (applicationHref || application) {
      if (!application) {
        application = document.createElement("a");
        application.className = "btn-success cms-application-button";
        root.appendChild(application);
      }
      application.textContent = selection.buttonLabel || "Inscreva-se";
      application.hidden = !applicationHref;
      if (state === "open" && applicationHref) {
        application.href = applicationHref;
        application.target = "_blank";
        application.rel = "noopener noreferrer";
        application.removeAttribute("aria-disabled");
        application.removeAttribute("tabindex");
      } else {
        application.removeAttribute("href");
        application.removeAttribute("target");
        application.setAttribute("aria-disabled", "true");
        application.setAttribute("tabindex", "-1");
      }
    }
    text(document, "#selective-process-schedule h3", selection.scheduleTitle);
    const img = schedule.querySelector("img");
    setImage(
      document,
      img,
      selection.scheduleImage,
      "Cronograma do processo seletivo",
    );
    let stages = schedule.querySelector(".cms-selection-stages");
    if (selection.stages && selection.stages.length) {
      if (img) img.hidden = true;
      stages =
        stages ||
        managedElement(document, schedule, "ol", "cms-selection-stages");
      stages.replaceChildren();
      selection.stages.forEach((stage) => {
        const li = document.createElement("li");
        const date = document.createElement("span");
        date.className = "cms-stage-date";
        date.textContent = stage.date ? formatDate(stage.date) : "";
        const title = document.createElement("h4");
        title.textContent = stage.title;
        const description = document.createElement("p");
        description.textContent = stage.description;
        li.append(date, title, description);
        stages.appendChild(li);
      });
    } else if (stages) stages.remove();
    schedule.hidden = !selection.stages?.length && (!img || img.hidden);
  }

  const selectionWatchers = new WeakMap();

  function watchSelection(document, window, selection) {
    selectionWatchers.get(document)?.();
    if (selection.status !== "open") return;
    const opens = parseBoundary(selection.opensAt);
    const closes = parseBoundary(selection.closesAt, true);
    if (!Number.isFinite(opens) && !Number.isFinite(closes)) return;

    let timer;
    let lastState;
    const refresh = () => {
      window.clearTimeout(timer);
      const now = window.Date.now();
      const state = selectionState(selection, now);
      if (state !== lastState) {
        renderSelection(document, selection, now);
        lastState = state;
      }
      const next = [opens, Number.isFinite(closes) ? closes + 1 : null]
        .filter((boundary) => Number.isFinite(boundary) && boundary > now)
        .sort((a, b) => a - b)[0];
      if (next !== undefined)
        timer = window.setTimeout(refresh, Math.min(next - now, 2147483647));
    };
    // Background tabs and restored pages can resume after their scheduled timer.
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onApplication = (event) => {
      if (!event.target.closest?.(".cms-application-button")) return;
      refresh();
      if (selectionState(selection, window.Date.now()) !== "open")
        event.preventDefault();
    };
    const pause = () => window.clearTimeout(timer);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("click", onApplication, true);
    document.addEventListener("auxclick", onApplication, true);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("pagehide", pause);
    const stop = () => {
      pause();
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("click", onApplication, true);
      document.removeEventListener("auxclick", onApplication, true);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("pagehide", pause);
      selectionWatchers.delete(document);
    };
    selectionWatchers.set(document, stop);
    refresh();
  }

  function renderContent(document, content, options = {}) {
    if (
      !content ||
      !content.site ||
      !Array.isArray(content.sections) ||
      !content.selection
    )
      return false;
    selectionWatchers.get(document)?.();
    document.title = content.site.name;
    const meta = (selector, value) => {
      const tag = document.querySelector(selector);
      if (tag) tag.setAttribute("content", value);
    };
    meta('meta[name="description"]', content.site.description);
    meta('meta[property="og:title"]', content.site.name);
    meta('meta[property="og:description"]', content.site.description);
    const brand = document.querySelector("#introduction-brand");
    if (brand) brand.alt = content.site.name;
    text(document, "footer > .container > h3", content.site.footerTitle);
    const email = content.site.email;
    if (
      typeof email === "string" &&
      /^[^\s@?&\r\n]+@[^\s@?&\r\n]+\.[^\s@?&\r\n]+$/.test(email)
    ) {
      const mailto = `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}`;
      const anchor = document.querySelector(".contact-address a");
      if (anchor) {
        anchor.href = mailto;
        anchor.textContent = email;
      }
      const form = document.querySelector("#contact-form");
      if (form) {
        form.dataset.recipient = email;
        form.action = mailto;
      }
    }
    const instagram = document.querySelector(".instagram-profile");
    const instagramUrl = safeUrl(content.site.instagramUrl);
    if (instagram) {
      if (instagramUrl) instagram.href = instagramUrl;
      else instagram.removeAttribute("href");
      instagram.setAttribute(
        "aria-label",
        `Abrir o perfil ${content.site.instagramHandle} no Instagram`,
      );
    }
    text(document, ".instagram-profile-handle", content.site.instagramHandle);
    const structured = document.querySelector(
      'script[type="application/ld+json"]',
    );
    if (structured) {
      try {
        const data = JSON.parse(structured.textContent);
        Object.assign(data, {
          name: content.site.name,
          description: content.site.description,
          email,
          sameAs: instagramUrl ? [instagramUrl] : [],
        });
        structured.textContent = JSON.stringify(data).replace(/</g, "\\u003c");
      } catch (_) {
        /* An unrelated metadata format should not block content rendering. */
      }
    }
    content.sections.forEach((section) => renderSection(document, section));
    renderSelection(document, content.selection, options.now);
    return true;
  }

  function previewBanner(document, message, state = "ready") {
    let banner = document.querySelector(".cms-preview-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "cms-preview-banner";
      banner.setAttribute("role", "status");
      document.body.prepend(banner);
    }
    banner.classList.toggle("cms-preview-banner--error", state === "error");
    banner.dataset.previewState = state;
    banner.textContent = message;
    document.documentElement.classList.add("cms-preview");
  }

  async function loadContent(document, window, fetcher) {
    const isPreview =
      new URLSearchParams(window.location.search).get("preview") === "1";
    if (isPreview)
      previewBanner(
        document,
        "Prévia do rascunho · Carregando conteúdo salvo…",
        "loading",
      );
    try {
      const response = await fetcher(
        isPreview ? "/api/admin/preview" : "/api/content",
        {
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      );
      if (!response.ok) throw new Error("Content unavailable");
      const payload = await response.json();
      if (!renderContent(document, payload.content))
        throw new Error("Invalid content");
      watchSelection(document, window, payload.content.selection);
      if (isPreview)
        previewBanner(
          document,
          "Prévia do rascunho salvo · Conteúdo ainda não publicado",
        );
      return true;
    } catch (_) {
      if (isPreview)
        previewBanner(
          document,
          "Prévia indisponível. Entre no painel e salve o rascunho para visualizar. Abaixo está a página original.",
          "error",
        );
      return false;
    }
  }

  const api = { safeUrl, selectionState, renderContent, loadContent };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (
    globalScope &&
    globalScope.document &&
    typeof globalScope.fetch === "function"
  ) {
    const boot = () =>
      loadContent(
        globalScope.document,
        globalScope,
        globalScope.fetch.bind(globalScope),
      );
    if (globalScope.document.readyState === "loading")
      globalScope.document.addEventListener("DOMContentLoaded", boot, {
        once: true,
      });
    else boot();
  }
})(typeof window !== "undefined" ? window : null);
