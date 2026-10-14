const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { buildNetlify } = require("../scripts/build-netlify.cjs");

function fixture(t) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "nexo-netlify-build-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const distDir = path.join(directory, "dist");
  const runtimeDir = path.join(directory, ".netlify/server-dist");
  fs.mkdirSync(path.join(distDir, "admin"), { recursive: true });
  fs.mkdirSync(path.join(distDir, "blog"));
  fs.mkdirSync(path.join(distDir, "assets"));
  const jsonLd = '{"@context":"https://schema.org","@type":"Organization"}';
  const home = `<!doctype html><html><head><link rel="canonical" href="https://nexo-governamental.netlify.app/"><script type="application/ld+json">${jsonLd}</script></head><body><h1>Nexo Governamental</h1><script src="/main.js" defer></script></body></html>`;
  fs.writeFileSync(path.join(distDir, "index.html"), home);
  fs.writeFileSync(
    path.join(distDir, "admin/index.html"),
    '<meta name="robots" content="noindex,nofollow"><script src="/admin.js" defer></script>',
  );
  fs.writeFileSync(
    path.join(distDir, "blog/template.html"),
    "<!--BLOG_META--><!--BLOG_CONTENT-->",
  );
  fs.writeFileSync(path.join(distDir, "assets/photo.webp"), "image-content");
  fs.writeFileSync(path.join(distDir, "main.js"), "public-cms-client");
  fs.writeFileSync(path.join(distDir, "admin.js"), "admin-client");
  fs.writeFileSync(
    path.join(distDir, "google42b90ef871b3befd.html"),
    "google-site-verification",
  );
  fs.mkdirSync(path.join(directory, "data"));
  fs.writeFileSync(
    path.join(directory, "data/nexo.sqlite"),
    "PRIVATE_DATABASE",
  );
  fs.writeFileSync(path.join(directory, ".env"), "PRIVATE_ENVIRONMENT");
  return { directory, distDir, runtimeDir, home, jsonLd };
}

test("full Netlify build retains the CMS and runtime assets without publishing its render template", (t) => {
  const f = fixture(t);
  buildNetlify(f);
  assert.equal(
    fs.readFileSync(path.join(f.distDir, "index.html"), "utf8"),
    f.home,
  );
  assert.equal(
    fs.readFileSync(path.join(f.runtimeDir, "index.html"), "utf8"),
    f.home,
  );
  assert.equal(
    fs.readFileSync(path.join(f.runtimeDir, "blog/template.html"), "utf8"),
    "<!--BLOG_META--><!--BLOG_CONTENT-->",
  );
  assert.equal(
    fs.existsSync(path.join(f.distDir, "blog/template.html")),
    false,
  );
  for (const root of [f.distDir, f.runtimeDir]) {
    assert.equal(
      fs.readFileSync(path.join(root, "assets/photo.webp"), "utf8"),
      "image-content",
    );
    assert.equal(
      fs.readFileSync(path.join(root, "admin.js"), "utf8"),
      "admin-client",
    );
    assert.equal(
      fs.readFileSync(path.join(root, "google42b90ef871b3befd.html"), "utf8"),
      "google-site-verification",
    );
    assert.equal(fs.existsSync(path.join(root, ".env")), false);
    assert.equal(fs.existsSync(path.join(root, "data")), false);
    assert.match(
      fs.readFileSync(path.join(root, "404.html"), "utf8"),
      /noindex/,
    );
    assert.match(
      fs.readFileSync(path.join(root, "sitemap.xml"), "utf8"),
      /<sitemapindex /,
    );
    assert.match(
      fs.readFileSync(path.join(root, "sitemap.xml"), "utf8"),
      /\/blog\/sitemap.xml/,
    );
    assert.doesNotMatch(
      fs.readFileSync(path.join(root, "sitemap-pages.xml"), "utf8"),
      /lastmod|railway/,
    );
  }
  const headers = fs.readFileSync(path.join(f.distDir, "_headers"), "utf8");
  const schemaHash = createHash("sha256").update(f.jsonLd).digest("base64");
  assert.equal(headers.split(`'sha256-${schemaHash}'`).length - 1, 2);
  assert.match(
    headers,
    /\/admin\/\*\n  Content-Security-Policy:[^\n]+\n  Cache-Control: no-store\n  X-Robots-Tag: noindex, nofollow/,
  );
  assert.doesNotMatch(headers, /script-src[^;]*unsafe-inline/);
  assert.equal(fs.existsSync(path.join(f.distDir, "_redirects")), false);
});

test("Netlify build refuses recovery-only output or an unexpected canonical", (t) => {
  const f = fixture(t);
  fs.rmSync(path.join(f.distDir, "admin/index.html"));
  assert.throws(() => buildNetlify(f), /Build incompleto/);
  fs.writeFileSync(path.join(f.distDir, "admin/index.html"), "admin");
  fs.writeFileSync(
    path.join(f.distDir, "index.html"),
    f.home.replace(
      "https://nexo-governamental.netlify.app/",
      "https://wrong.example/",
    ),
  );
  assert.throws(() => buildNetlify(f), /canônico/);
  assert.equal(fs.existsSync(f.runtimeDir), false);
});

test("Netlify build refuses overlapping output directories before deleting anything", (t) => {
  const f = fixture(t);
  for (const runtimeDir of [
    f.distDir,
    path.join(f.distDir, "runtime"),
    f.directory,
  ])
    assert.throws(
      () => buildNetlify({ distDir: f.distDir, runtimeDir }),
      /separadas/,
    );
  assert.equal(
    fs.readFileSync(path.join(f.distDir, "index.html"), "utf8"),
    f.home,
  );
});
