const path = require("node:path");
const fs = require("node:fs/promises");
const { createHash } = require("node:crypto");
const sharp = require("sharp");

const WIDTHS = [480, 768, 1200, 1920];

function registerBlogImages(app, { db, config }) {
  const metadata = new Map();
  const cache = new Map();
  const pending = new Map();
  const queue = [];
  let running = 0;
  let bytes = 0;
  async function optimize(file, width) {
    if (running < 2) running++;
    else await new Promise((resolve) => queue.push(resolve));
    try {
      return await sharp(file, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toBuffer();
    } finally {
      if (queue.length) queue.shift()();
      else running--;
    }
  }
  async function source(value) {
    let url;
    try {
      url = new URL(value, config.origin || [...config.origins][0]);
      if (
        !config.origins.has(url.origin) ||
        url.search ||
        url.hash ||
        /%|\\/.test(url.pathname)
      )
        return null;
    } catch {
      return null;
    }
    const match = url.pathname.match(
      /^\/(assets|uploads)\/([a-zA-Z0-9_./-]+\.(?:webp|avif|png|jpe?g))$/i,
    );
    if (
      !match ||
      match[2].split("/").some((part) => !part || part === "." || part === "..")
    )
      return null;
    if (
      match[1] === "uploads" &&
      !db
        .prepare("SELECT id FROM assets WHERE url = ? AND type LIKE 'image/%'")
        .get(url.pathname)
    )
      return null;
    const root =
      match[1] === "uploads"
        ? path.join(config.dataDir, "uploads")
        : path.join(config.distDir, "assets");
    try {
      const [realRoot, file] = await Promise.all([
        fs.realpath(root),
        fs.realpath(path.join(root, match[2])),
      ]);
      if (!file.startsWith(`${realRoot}${path.sep}`)) return null;
      const stat = await fs.stat(file);
      if (!stat.isFile() || stat.size > 20 * 1024 * 1024) return null;
      const key = createHash("sha256")
        .update(`${file}:${stat.size}:${stat.mtimeMs}`)
        .digest("hex");
      return { file, key, pathname: url.pathname };
    } catch {
      return null;
    }
  }
  async function dimensions(file) {
    if (metadata.has(file.key)) return metadata.get(file.key);
    try {
      const info = await sharp(file.file, {
        limitInputPixels: 40_000_000,
      }).metadata();
      if (!info.width || !info.height || (info.pages || 1) !== 1) return null;
      const rotated = [5, 6, 7, 8].includes(info.orientation);
      const result = {
        width: rotated ? info.height : info.width,
        height: rotated ? info.width : info.height,
      };
      if (metadata.size >= 256) metadata.delete(metadata.keys().next().value);
      metadata.set(file.key, result);
      return result;
    } catch {
      return null;
    }
  }
  async function describe(value) {
    const file = await source(value);
    if (!file) return null;
    const size = await dimensions(file);
    if (!size) return null;
    const candidates = WIDTHS.filter((width) => width < size.width).map(
      (width) => `/media/${width}${file.pathname} ${width}w`,
    );
    candidates.push(`${file.pathname} ${size.width}w`);
    return { ...size, srcset: candidates.join(", ") };
  }
  app.get("/media/:width/*", async (request, reply) => {
    const width = Number(request.params.width);
    const file =
      WIDTHS.includes(width) && (await source(`/${request.params["*"]}`));
    const size = file && (await dimensions(file));
    if (!size || width >= size.width)
      return reply.code(404).send({ error: "Imagem não encontrada." });
    const key = `${file.key}-${width}`;
    const etag = `"${key}"`;
    reply
      .header("Cache-Control", "public, max-age=86400")
      .header("ETag", etag)
      .header("X-Content-Type-Options", "nosniff");
    if (request.headers["if-none-match"] === etag)
      return reply.code(304).send();
    let buffer = cache.get(key);
    if (!buffer) {
      if (!pending.has(key)) {
        if (pending.size >= 32)
          return reply
            .header("Cache-Control", "no-store")
            .redirect(file.pathname);
        const job = optimize(file.file, width)
          .then((value) => {
            while (cache.size && bytes + value.length > 32 * 1024 * 1024) {
              const oldest = cache.keys().next().value;
              bytes -= cache.get(oldest).length;
              cache.delete(oldest);
            }
            if (value.length <= 32 * 1024 * 1024) {
              cache.set(key, value);
              bytes += value.length;
            }
            return value;
          })
          .finally(() => pending.delete(key));
        pending.set(key, job);
      }
      try {
        buffer = await pending.get(key);
      } catch {
        return reply
          .header("Cache-Control", "no-store")
          .code(404)
          .send({ error: "Imagem não encontrada." });
      }
    } else {
      cache.delete(key);
      cache.set(key, buffer);
    }
    return reply.type("image/webp").send(buffer);
  });
  app.addHook("onClose", async () => {
    await Promise.allSettled(pending.values());
    cache.clear();
    metadata.clear();
  });
  return {
    describe,
    enrich: async (post) => ({
      ...post,
      coverMedia: await describe(post.coverImage),
    }),
  };
}

module.exports = { registerBlogImages, WIDTHS };
