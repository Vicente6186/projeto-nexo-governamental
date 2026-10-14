const path = require("node:path");
const fs = require("node:fs/promises");

function storageKey(key) {
  if (
    typeof key !== "string" ||
    !/^(uploads|originals|variants)\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp|avif|pdf)$/.test(
      key,
    )
  )
    throw new Error("Chave de arquivo inválida.");
  return key;
}

async function createStorage({ dataDir, env = process.env, blobFactory } = {}) {
  const remote = env.CMS_STORAGE === "netlify-blobs";
  if (env.CMS_STORAGE && !remote && env.CMS_STORAGE !== "filesystem")
    throw new Error("CMS_STORAGE inválido.");
  if (!remote) {
    const root = path.resolve(dataDir);
    const filename = (key) => path.join(root, storageKey(key));
    return {
      remote: false,
      async read(key) {
        const target = filename(key);
        try {
          const realRoot = await fs.realpath(root);
          const resolved = await fs.realpath(target);
          if (!resolved.startsWith(`${realRoot}${path.sep}`)) return null;
          return await fs.readFile(resolved);
        } catch (error) {
          if (error.code === "ENOENT") return null;
          throw error;
        }
      },
      async write(key, buffer, { exclusive = false } = {}) {
        const target = filename(key);
        await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        await fs.writeFile(target, buffer, {
          flag: exclusive ? "wx" : "w",
          mode: 0o600,
        });
      },
      async remove(key) {
        await fs.rm(filename(key), { force: true });
      },
    };
  }

  const { getStore, getDeployStore } =
    blobFactory || (await import("@netlify/blobs"));
  // A preview must never overwrite production uploads. Only the explicit
  // production deploy context can open the persistent site-wide store.
  const store =
    env.CONTEXT === "production"
      ? getStore({ name: "nexo-media", consistency: "strong" })
      : getDeployStore({ name: "nexo-media" });
  return {
    remote: true,
    async read(key) {
      const data = await store.get(storageKey(key), {
        type: "arrayBuffer",
        consistency: "strong",
      });
      return data === null ? null : Buffer.from(data);
    },
    async write(key, buffer, { type, exclusive = false } = {}) {
      const value = Buffer.from(buffer);
      const result = await store.set(
        storageKey(key),
        value.buffer.slice(
          value.byteOffset,
          value.byteOffset + value.byteLength,
        ),
        {
          ...(type ? { metadata: { type } } : {}),
          ...(exclusive ? { onlyIfNew: true } : {}),
        },
      );
      if (exclusive && !result.modified) {
        const error = new Error("Este arquivo já existe.");
        error.code = "EEXIST";
        throw error;
      }
    },
    async remove(key) {
      await store.delete(storageKey(key));
    },
  };
}

module.exports = { createStorage, storageKey };
