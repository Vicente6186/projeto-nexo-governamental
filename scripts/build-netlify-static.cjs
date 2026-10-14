const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { htmlCsp } = require("../server/blog-seo.cjs");

const SITE_ORIGIN = "https://nexo-governamental.netlify.app";

// This recovery build uses only the versioned public HTML. It must never read
// the editorial database: a local copy cannot establish what was published.
function renderRecoveryHtml(html) {
  const dom = new JSDOM(html, { url: `${SITE_ORIGIN}/` });
  try {
    const document = dom.window.document;
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical?.href !== `${SITE_ORIGIN}/`)
      throw new Error(
        "A página inicial deve preservar o endereço canônico público.",
      );

    const selection = document.querySelector("#selective-process");
    const content = selection?.querySelector("#selective-process-content");
    const heading = content?.querySelector("h2");
    const journal = document.querySelector("#journal-latest");
    if (!selection || !content || !heading || !journal)
      throw new Error(
        "A página inicial não contém as seções esperadas para recuperação.",
      );

    const label = document.createElement("p");
    label.textContent = "Processo seletivo";
    const notice = document.createElement("div");
    notice.className = "cms-selection-description";
    notice.textContent =
      "Para confirmar as informações atuais do processo seletivo, fale com a equipe pelos canais institucionais.";
    const contact = document.createElement("a");
    contact.className = "btn-success";
    contact.href = "#contact";
    contact.textContent = "Falar com a equipe";

    // Replace the entire selection body so an old notice, application URL,
    // status, date or schedule cannot accidentally survive the recovery.
    content.replaceChildren(label, heading, notice, contact);
    selection.replaceChildren(content);

    const placeholder = document.createElement("div");
    placeholder.className = "journal-empty";
    const monogram = document.createElement("span");
    monogram.className = "journal-monogram";
    monogram.setAttribute("aria-hidden", "true");
    monogram.textContent = "N.";
    const message = document.createElement("p");
    message.dataset.journalMessage = "";
    message.textContent = "Publicações temporariamente indisponíveis.";
    placeholder.append(monogram, message);
    journal.replaceChildren(placeholder);

    return dom.serialize();
  } finally {
    dom.window.close();
  }
}

function discoveryFiles() {
  return {
    "robots.txt": `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`,
    "sitemap.xml": `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${SITE_ORIGIN}/sitemap-pages.xml</loc></sitemap><sitemap><loc>${SITE_ORIGIN}/blog/sitemap.xml</loc></sitemap></sitemapindex>\n`,
    "sitemap-pages.xml": `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE_ORIGIN}/</loc></url></urlset>\n`,
  };
}

function createNotFoundHtml() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="description" content="A página solicitada não foi encontrada no site do Nexo Governamental XI de Agosto.">
  <title>Página não encontrada | Nexo Governamental XI de Agosto</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #191f51; background: #f7f6f2; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; }
    main { width: min(36rem, calc(100% - 3rem)); padding: 3rem 0; }
    .brand { font-weight: 700; }
    h1 { font-size: clamp(2rem, 6vw, 3rem); line-height: 1.15; }
    p { line-height: 1.7; }
    a { color: inherit; text-underline-offset: .25em; }
    a:focus-visible { outline: 3px solid currentColor; outline-offset: 5px; }
  </style>
</head>
<body>
  <main>
    <p class="brand">Nexo Governamental XI de Agosto</p>
    <h1>Página não encontrada</h1>
    <p>Confira o endereço ou volte à página inicial para conhecer o Nexo e falar com a equipe.</p>
    <p><a href="/">Voltar à página inicial</a></p>
  </main>
</body>
</html>\n`;
}

function createHeaders(html) {
  const fresh = "  Cache-Control: public, max-age=0, must-revalidate";
  const csp = `  Content-Security-Policy: ${htmlCsp(html)}`;
  return [
    "/",
    csp,
    fresh,
    "/index.html",
    csp,
    fresh,
    "/robots.txt",
    fresh,
    "/sitemap.xml",
    fresh,
    "/sitemap-pages.xml",
    fresh,
    "",
  ].join("\n");
}

function buildNetlifyStatic({
  distDir = path.resolve(__dirname, "../dist"),
} = {}) {
  const indexPath = path.join(distDir, "index.html");
  const html = renderRecoveryHtml(fs.readFileSync(indexPath, "utf8"));
  const files = {
    "index.html": html,
    ...discoveryFiles(),
    "404.html": createNotFoundHtml(),
    _headers: createHeaders(html),
  };
  for (const [filename, content] of Object.entries(files))
    fs.writeFileSync(path.join(distDir, filename), content);
  return Object.keys(files);
}

if (require.main === module) {
  try {
    const files = buildNetlifyStatic();
    console.log(`Recuperação estática preparada: ${files.join(", ")}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  SITE_ORIGIN,
  renderRecoveryHtml,
  discoveryFiles,
  createNotFoundHtml,
  buildNetlifyStatic,
};
