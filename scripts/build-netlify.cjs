const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { htmlCsp } = require("../server/blog-seo.cjs");
const {
  SITE_ORIGIN,
  discoveryFiles,
  createNotFoundHtml,
} = require("./build-netlify-static.cjs");

function createHeaders(home, admin, notFound) {
  const fresh = "  Cache-Control: public, max-age=0, must-revalidate";
  const privatePage = "  Cache-Control: no-store";
  const noindex = "  X-Robots-Tag: noindex, nofollow";
  const csp = (html) => `  Content-Security-Policy: ${htmlCsp(html)}`;
  return [
    "/",
    csp(home),
    fresh,
    "/index.html",
    csp(home),
    fresh,
    "/admin",
    csp(admin),
    privatePage,
    noindex,
    "/admin/*",
    csp(admin),
    privatePage,
    noindex,
    "/404.html",
    csp(notFound),
    fresh,
    noindex,
    "/robots.txt",
    fresh,
    "/sitemap.xml",
    fresh,
    "/sitemap-pages.xml",
    fresh,
    "",
  ].join("\n");
}

function buildNetlify({
  distDir = path.resolve(__dirname, "../dist"),
  runtimeDir = path.resolve(__dirname, "../.netlify/server-dist"),
} = {}) {
  distDir = path.resolve(distDir);
  runtimeDir = path.resolve(runtimeDir);
  if (
    distDir === runtimeDir ||
    runtimeDir.startsWith(`${distDir}${path.sep}`) ||
    distDir.startsWith(`${runtimeDir}${path.sep}`)
  )
    throw new Error(
      "A pasta pública e a pasta da função precisam ser separadas.",
    );

  for (const file of ["index.html", "admin/index.html", "blog/template.html"])
    if (
      !fs
        .statSync(path.join(distDir, file), { throwIfNoEntry: false })
        ?.isFile()
    )
      throw new Error(`Build incompleto: ${file} não foi gerado pelo webpack.`);

  const home = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
  const admin = fs.readFileSync(path.join(distDir, "admin/index.html"), "utf8");
  const page = new JSDOM(home, { url: `${SITE_ORIGIN}/` });
  try {
    if (
      page.window.document.querySelector('link[rel="canonical"]')?.href !==
      `${SITE_ORIGIN}/`
    )
      throw new Error(
        "A página inicial deve preservar o endereço canônico público.",
      );
  } finally {
    page.window.close();
  }

  const notFound = createNotFoundHtml();
  const files = {
    ...discoveryFiles(),
    "404.html": notFound,
    _headers: createHeaders(home, admin, notFound),
  };
  for (const [filename, content] of Object.entries(files))
    fs.writeFileSync(path.join(distDir, filename), content);

  // The function needs the blog template and the real asset files for
  // validation and image variants. Only generated public build output is
  // copied; editorial data and environment files are never included.
  fs.rmSync(runtimeDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(runtimeDir), { recursive: true });
  fs.cpSync(distDir, runtimeDir, { recursive: true });
  fs.rmSync(path.join(distDir, "blog/template.html"));
  return { files: Object.keys(files), runtimeDir };
}

if (require.main === module) {
  try {
    buildNetlify();
    console.log(
      "Site, painel e arquivos do servidor preparados para o Netlify.",
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildNetlify, createHeaders };
