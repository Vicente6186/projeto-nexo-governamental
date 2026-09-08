"use strict";

const {
  renderMarkdown,
  readingMinutes,
  CATEGORIES,
} = require("../shared/blog.cjs");

const BRAND = "Nexo Governamental XI de Agosto";
const DEFAULT_DESCRIPTION =
  "Reflexões, pesquisa e experiências que conectam a universidade, o poder público e a sociedade. O blog do Nexo Governamental, da Faculdade de Direito da USP.";
const esc = (value = "") =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const icons = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  diagonal: '<path d="M6 18 18 6M6 6h12v12"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  book: '<path d="M12 5v15M3 4h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  instagram:
    '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
};
const icon = (name, className = "") =>
  `<svg class="blog-icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.arrow}</svg>`;

function safeUrl(value, fallback = "") {
  const url = String(value || "").trim();
  return /^(?:https?:\/\/|mailto:|\/(?!\/)|#)/i.test(url) &&
    !/[\u0000-\u0020\u007f\\]/.test(url)
    ? url
    : fallback;
}

function postHref(post, preview = false) {
  return preview
    ? `/blog/preview/${encodeURIComponent(post.id)}`
    : `/blog/${encodeURIComponent(post.slug)}`;
}

function dateInfo(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime()))
    return { iso: "", label: "Ainda não publicado" };
  return {
    iso: date.toISOString(),
    label: new Intl.DateTimeFormat("pt-BR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    }).format(date),
  };
}

function dateMarkup(value) {
  const { iso, label } = dateInfo(value);
  return iso
    ? `<time datetime="${esc(iso)}">${esc(label)}</time>`
    : `<span>${esc(label)}</span>`;
}

function initials(name) {
  return String(name || "Nexo Governamental")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function queryLink({
  category = "",
  search = "",
  page = 1,
  preview = false,
} = {}) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (search) params.set("search", search);
  if (page > 1) params.set("page", page);
  if (preview) params.set("preview", "1");
  return `/blog/${params.size ? `?${params}` : ""}`;
}

function chrome(content, { site = {}, preview = false, article = false } = {}) {
  const instagram = safeUrl(
    site.instagramUrl,
    "https://www.instagram.com/nexogovernamental/",
  );
  const email = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(site.email || "")
    ? site.email
    : "nexogov.usp@gmail.com";
  return `<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
    ${preview ? `<div class="preview-banner" role="status"><span class="preview-dot"></span><strong>Prévia editorial</strong><span>Este conteúdo ainda não está publicado.</span><a href="/admin/#blog">Voltar ao painel ${icon("diagonal")}</a></div>` : ""}
    <header class="blog-header">
      <div class="blog-header-inner blog-container">
        <a class="blog-brand" href="/" aria-label="${esc(BRAND)} — início">
          <img src="/assets/introduction/brand-without-background.webp" alt="" width="48" height="49" />
          <span><strong>Nexo Governamental</strong><small>XI de Agosto · Direito USP</small></span>
        </a>
        <button class="menu-toggle" data-menu-toggle aria-controls="blog-navigation" aria-expanded="false" aria-label="Abrir menu">${icon("menu")}</button>
        <nav id="blog-navigation" class="blog-navigation" aria-label="Navegação principal">
          <a href="/">Início</a><a href="${esc(queryLink({ preview }))}" aria-current="${article ? "location" : "page"}">Blog</a><a class="nav-about" href="/#about">Conheça o Nexo ${icon("diagonal")}</a>
        </nav>
      </div>
    </header>
    ${article ? '<progress class="reading-progress" data-reading-progress max="1" value="0" aria-label="Progresso de leitura"></progress>' : ""}
    <main id="conteudo" tabindex="-1">${content}</main>
    <footer class="blog-footer">
      <div class="blog-container footer-main">
        <a class="footer-wordmark" href="/">Nexo<span>Governamental XI de Agosto</span></a>
        <nav class="footer-links" aria-label="Contato e redes sociais"><a href="${esc(instagram)}" target="_blank" rel="noopener noreferrer">Instagram ${icon("diagonal")}</a><a href="mailto:${esc(email)}">Contato ${icon("diagonal")}</a></nav>
      </div>
      <div class="blog-container footer-bottom"><span>© ${new Date().getFullYear()} ${esc(BRAND)}.</span><a href="/blog/feed.xml">RSS</a><a href="#conteudo">Voltar ao topo ↑</a></div>
    </footer>`;
}

function cover(post, { className = "", eager = false } = {}) {
  const image = safeUrl(post.coverImage);
  return image
    ? `<img class="${esc(className)}" src="${esc(image)}" alt="${esc(post.coverAlt || "")}"${imageAttributes(post, eager ? "(max-width: 768px) 100vw, 60vw" : "(max-width: 720px) 100vw, (max-width: 1280px) 50vw, 600px")} loading="${eager ? "eager" : "lazy"}" decoding="async"${eager ? ' fetchpriority="high"' : ""} />`
    : `<div class="editorial-cover ${esc(className)}" aria-hidden="true"><span>NEXO</span><span class="editorial-cover-line"></span><small>IDEIAS EM DIÁLOGO</small></div>`;
}

function imageAttributes(post, sizes) {
  const media = post.coverMedia;
  return media
    ? ` width="${media.width}" height="${media.height}" srcset="${esc(media.srcset)}" sizes="${sizes}"`
    : "";
}

function postMeta(post, { includeAuthor = true } = {}) {
  return `<div class="post-meta">${includeAuthor ? `<span>${esc(post.author || BRAND)}</span><span aria-hidden="true">·</span>` : ""}${dateMarkup(post.publishedAt)}<span aria-hidden="true">·</span><span>${Number(post.readingMinutes) || readingMinutes(post.body || "")} min de leitura</span></div>`;
}

function postCard(post, preview = false) {
  const href = esc(postHref(post, preview));
  return `<article class="post-card">
    <a class="post-card-image" href="${href}" tabindex="-1" aria-hidden="true">${cover(post)}</a>
    <div class="post-card-content"><span class="category-label">${esc(post.category || "Institucional")}</span><h3><a href="${href}">${esc(post.title)}</a></h3><p>${esc(post.excerpt)}</p>${postMeta(post, { includeAuthor: false })}</div>
  </article>`;
}

function featuredPost(post, preview) {
  return `<section class="featured-section" aria-labelledby="featured-label">
    <div class="section-caption"><h2 id="featured-label">EM DESTAQUE</h2><span class="caption-rule"></span></div>
    <article class="featured-post">
      <a class="featured-image" href="${esc(postHref(post, preview))}" tabindex="-1" aria-hidden="true">${cover(post, { eager: true })}</a>
      <div class="featured-copy"><span class="category-label">${esc(post.category || "Institucional")}</span><h2><a href="${esc(postHref(post, preview))}">${esc(post.title)}</a></h2><p>${esc(post.excerpt)}</p><div class="featured-bottom">${postMeta(post)}<a class="article-link" href="${esc(postHref(post, preview))}" aria-label="Ler artigo: ${esc(post.title)}">Ler artigo <span>${icon("arrow")}</span></a></div></div>
    </article>
  </section>`;
}

function noPublications() {
  return `<section class="blog-opening" aria-labelledby="opening-title">
    <div class="opening-image"><img src="/assets/introduction/usp.avif" alt="Fachada da Faculdade de Direito da USP no Largo de São Francisco" width="1122" height="1402" decoding="async" fetchpriority="high" /><span class="opening-image-caption">Faculdade de Direito da USP</span></div>
    <div class="opening-copy"><h2 id="opening-title">Publicações<br /><em>em breve.</em></h2><a class="article-link" href="/#more">Conheça o Nexo <span>${icon("arrow")}</span></a></div>
  </section>`;
}

function pagination({ page, pages, search, category, preview }) {
  if (pages <= 1) return "";
  const shown = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter((item) => item >= 1 && item <= pages)
    .sort((a, b) => a - b);
  const link = (target) =>
    esc(queryLink({ search, category, page: target, preview }));
  let previous = 0;
  const numbers = shown
    .map((number) => {
      const ellipsis =
        previous && number - previous > 1
          ? '<span class="pagination-ellipsis" aria-hidden="true">…</span>'
          : "";
      previous = number;
      return `${ellipsis}<a href="${link(number)}" ${number === page ? 'aria-current="page"' : ""} aria-label="Página ${number}">${number}</a>`;
    })
    .join("");
  return `<nav class="blog-pagination" aria-label="Páginas do blog">${page > 1 ? `<a class="pagination-direction" aria-label="Página anterior" href="${link(page - 1)}">${icon("back")}<span>Anterior</span></a>` : '<span class="pagination-spacer"></span>'}<div class="pagination-numbers">${numbers}</div>${page < pages ? `<a class="pagination-direction" aria-label="Próxima página" href="${link(page + 1)}"><span>Próxima</span>${icon("arrow")}</a>` : '<span class="pagination-spacer"></span>'}</nav>`;
}

function renderBlogIndex({
  posts = [],
  total = posts.length,
  page = 1,
  pages = 1,
  categories = CATEGORIES,
  search = "",
  category = "",
  site = {},
  preview = false,
} = {}) {
  const cleanPage = Math.max(1, Number(page) || 1);
  const cleanPages = Math.max(1, Number(pages) || 1);
  const filtered = Boolean(search || category);
  const featured =
    !filtered && cleanPage === 1
      ? posts.find((post) => post.featured) || posts[0]
      : null;
  const remaining = featured
    ? posts.filter((post) => post.id !== featured.id)
    : posts;
  const categoryList = (categories || CATEGORIES).map((item) =>
    typeof item === "string"
      ? { id: item, label: item }
      : {
          id: item.id || item.name || item.label,
          label: item.label || item.name || item.id,
        },
  );
  const content = `<div class="blog-container">
    <section class="journal-intro" aria-labelledby="journal-title"><h1 id="journal-title">Blog do <em>Nexo.</em></h1></section>
    <div class="journal-tools"><nav class="category-navigation" aria-label="Filtrar artigos por categoria"><a href="${esc(queryLink({ search, preview }))}"${!category ? ' aria-current="page"' : ""}>Todos</a>${categoryList.map((item) => `<a href="${esc(queryLink({ category: item.id, search, preview }))}"${category === item.id ? ' aria-current="page"' : ""}>${esc(item.label)}</a>`).join("")}</nav>
      <form class="blog-search" action="/blog/" method="get" role="search"><label class="sr-only" for="blog-search">Buscar artigos</label><input id="blog-search" type="search" name="search" placeholder="Buscar no blog" value="${esc(search)}" maxlength="120" />${category ? `<input type="hidden" name="category" value="${esc(category)}" />` : ""}${preview ? '<input type="hidden" name="preview" value="1" />' : ""}<button type="submit" aria-label="Buscar">${icon("search")}</button></form>
    </div>
    ${filtered ? `<div class="results-summary"><h2>${search ? `Resultados para “${esc(search)}”` : esc(category)}</h2><span>${Number(total)} ${Number(total) === 1 ? "artigo" : "artigos"}</span><a href="${esc(queryLink({ preview }))}">Limpar filtros</a></div>` : ""}
    ${featured ? featuredPost(featured, preview) : ""}
    ${remaining.length ? `<section class="recent-section" aria-labelledby="recent-title"><div class="section-caption"><h2 id="recent-title">${filtered ? "ARTIGOS ENCONTRADOS" : cleanPage > 1 ? "MAIS LEITURAS" : preview ? "RASCUNHOS EM PRÉVIA" : "ÚLTIMAS PUBLICAÇÕES"}</h2><span class="caption-rule"></span><span>${Number(total)} ${Number(total) === 1 ? "ARTIGO" : "ARTIGOS"}</span></div><div class="post-grid">${remaining.map((post) => postCard(post, preview)).join("")}</div></section>` : ""}
    ${!posts.length ? (filtered ? `<section class="blog-empty" aria-labelledby="empty-title"><span class="empty-icon">${icon("search")}</span><h2 id="empty-title">Vamos tentar outra busca?</h2><p>Nenhum artigo corresponde aos filtros selecionados.<br />Experimente outro termo ou explore todas as publicações.</p><a class="button-primary" href="${esc(queryLink({ preview }))}">Ver todos os artigos ${icon("arrow")}</a></section>` : noPublications()) : ""}
    ${pagination({ page: cleanPage, pages: cleanPages, category, search, preview })}
  </div>`;
  return {
    title: `${search ? `Busca: ${search}` : category || "Blog"}${cleanPage > 1 ? ` · Página ${cleanPage}` : ""} · ${BRAND}`,
    description: category
      ? `Artigos sobre ${category.toLocaleLowerCase("pt-BR")} no blog do Nexo Governamental, organização estudantil da Faculdade de Direito da USP.`
      : DEFAULT_DESCRIPTION,
    canonicalPath: queryLink({ category, search, page: cleanPage }),
    ogImage: safeUrl(
      featured?.coverImage,
      "/assets/brand-with-background.webp",
    ),
    html: chrome(content, { site, preview }),
  };
}

function withHeadingIds(html) {
  const entries = [];
  const counts = new Map();
  const usedIds = new Set();
  const content = String(html).replace(
    /<h([23])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/g,
    (_, level, text) => {
      const plain = text.replace(/<[^>]+>/g, "").replace(
        /&(?:amp|lt|gt|quot|#39);/g,
        (entity) =>
          ({
            "&amp;": "&",
            "&lt;": "<",
            "&gt;": ">",
            "&quot;": '"',
            "&#39;": "'",
          })[entity],
      );
      const base =
        plain
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 90) || "secao";
      let count = (counts.get(base) || 0) + 1;
      let id = `leitura-${base}${count > 1 ? `-${count}` : ""}`;
      while (usedIds.has(id)) {
        count++;
        id = `leitura-${base}-${count}`;
      }
      counts.set(base, count);
      usedIds.add(id);
      entries.push({ level, title: plain, id });
      return `<h${level} id="${id}">${text}</h${level}>`;
    },
  );
  return { html: content, entries };
}

function renderBlogArticle({
  post,
  related = [],
  site = {},
  preview = false,
} = {}) {
  if (!post)
    throw new TypeError("Um artigo é necessário para renderizar a página.");
  const rendered = withHeadingIds(post.html || renderMarkdown(post.body || ""));
  const readTime =
    Number(post.readingMinutes) || readingMinutes(post.body || "");
  const updated = dateInfo(post.updatedAt);
  const publication = dateInfo(post.publishedAt);
  const wasUpdated =
    publication.iso &&
    updated.iso &&
    updated.label !== publication.label &&
    updated.iso > publication.iso;
  const contents = rendered.entries
    .filter((entry) => entry.level === "2")
    .slice(0, 12);
  const coverImage = safeUrl(post.coverImage);
  const category = post.category || "Institucional";
  const blogHref = esc(queryLink({ preview }));
  const categoryHref = esc(queryLink({ category, preview }));
  const content = `<article class="article-page">
    <header class="article-heading blog-container">
      <nav class="article-breadcrumb" aria-label="Você está em"><a href="${blogHref}">Blog</a>${icon("chevron")}<a href="${categoryHref}">${esc(category)}</a></nav>
      <div class="article-heading-inner"><a class="category-label" href="${categoryHref}">${esc(category)}</a><h1>${esc(post.title)}</h1><p class="article-deck">${esc(post.excerpt)}</p><div class="article-byline"><span class="author-avatar" aria-hidden="true">${esc(initials(post.author))}</span><div class="author-details"><strong>${esc(post.author || BRAND)}</strong>${post.authorRole ? `<span>${esc(post.authorRole)}</span>` : ""}</div><div class="article-date">${dateMarkup(post.publishedAt)}<span>${icon("clock")}${readTime} min de leitura</span></div></div></div>
    </header>
    ${coverImage ? `<figure class="article-cover blog-container"><img src="${esc(coverImage)}" alt="${esc(post.coverAlt || "")}"${imageAttributes(post, "(max-width: 1280px) 100vw, 1280px")} fetchpriority="high" decoding="async" />${post.coverCredit ? `<figcaption>${esc(post.coverCredit)}</figcaption>` : ""}</figure>` : ""}
    <div class="article-layout blog-container">
      <aside class="article-sidebar"><div class="article-sidebar-sticky">${contents.length >= 2 ? `<nav class="table-of-contents" aria-label="Neste artigo"><h2>NESTE ARTIGO</h2><ol>${contents.map((entry) => `<li><a href="#${esc(entry.id)}">${esc(entry.title)}</a></li>`).join("")}</ol></nav>` : `<div class="sidebar-reading-note"><span class="eyebrow">CADERNO NEXO</span><p>Um convite à<br /><em>reflexão.</em></p></div>`}${preview ? '<div class="article-share"><span class="eyebrow">LEITURA EM PRÉVIA</span><p class="share-status">A publicação libera o link para compartilhar este artigo.</p></div>' : `<div class="article-share"><span class="eyebrow">COMPARTILHE A IDEIA</span><button class="copy-link" type="button" data-copy-link hidden>${icon("copy")} Copiar link</button><label class="sr-only" for="share-link-fallback">Link deste artigo</label><input class="share-fallback" id="share-link-fallback" data-share-fallback readonly hidden /><p class="share-status" data-share-status role="status" aria-live="polite"></p></div>`}</div></aside>
      <div class="article-reading-column"><div class="article-body">${rendered.html}</div>
        <footer class="article-end">${wasUpdated ? `<p class="article-updated">Atualizado em ${esc(updated.label)}.</p>` : ""}${post.tags?.length ? `<ul class="article-tags" aria-label="Temas deste artigo">${post.tags.map((tag) => `<li>${esc(tag)}</li>`).join("")}</ul>` : ""}<div class="author-bio"><span class="author-avatar" aria-hidden="true">${esc(initials(post.author))}</span><div><span class="eyebrow">ESCRITO POR</span><strong>${esc(post.author || BRAND)}</strong>${post.authorRole ? `<p>${esc(post.authorRole)}</p>` : ""}</div></div><a class="back-to-blog" href="${blogHref}">${icon("back")} ${preview ? "Todos os rascunhos" : "Todas as publicações"}</a></footer>
      </div><div class="article-layout-balance" aria-hidden="true"></div>
    </div>
  </article>
  ${
    related.length
      ? `<section class="related-section"><div class="blog-container"><div class="related-heading"><div><span class="eyebrow">A CONVERSA CONTINUA</span><h2>Outras <em>perspectivas.</em></h2></div><a class="article-link" href="${blogHref}">Ver todos os artigos ${icon("arrow")}</a></div><div class="post-grid">${related
          .slice(0, 3)
          .map((item) => postCard(item, preview))
          .join("")}</div></div></section>`
      : `<aside class="article-outro blog-container"><span class="eyebrow">DA LEITURA À CONVERSA</span><h2>Ideias se fortalecem<br />quando <em>circulam.</em></h2><a class="article-link" href="${blogHref}">Explore o blog ${icon("arrow")}</a></aside>`
  }`;
  return {
    title: `${post.title} · ${BRAND}`,
    description: post.excerpt || DEFAULT_DESCRIPTION,
    canonicalPath: postHref(post),
    ogImage: coverImage || "/assets/brand-with-background.webp",
    html: chrome(content, { site, preview, article: true }),
  };
}

function renderBlogNotFound({ site = {}, preview = false } = {}) {
  return {
    title: `Artigo não encontrado · ${BRAND}`,
    description:
      "Este artigo não está disponível. Explore outras ideias no blog do Nexo Governamental.",
    canonicalPath: "/blog/",
    ogImage: "/assets/brand-with-background.webp",
    html: chrome(
      `<div class="not-found-page blog-container"><section class="blog-empty" aria-labelledby="not-found-title"><span class="not-found-number" aria-hidden="true">404</span><span class="eyebrow">UM DESVIO NA LEITURA</span><h1 id="not-found-title">Esta página não está disponível.</h1><p>O artigo pode ter sido retirado do ar ou o endereço pode estar incorreto. Há outras ideias para descobrir no blog.</p><a class="button-primary" href="${esc(queryLink({ preview }))}">Voltar ao blog ${icon("arrow")}</a></section></div>`,
      { site, preview },
    ),
  };
}

module.exports = { renderBlogIndex, renderBlogArticle, renderBlogNotFound };
