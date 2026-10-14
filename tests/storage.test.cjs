const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, rm, writeFile, symlink } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const Fastify = require("fastify");
const sharp = require("sharp");
const { createStorage } = require("../server/storage.cjs");
const {
  persistAssetUpload,
  registerUploadRoutes,
  createAssetValidator,
} = require("../server/assets.cjs");
const { registerBlogImages } = require("../server/blog-images.cjs");

function blobFixture() {
  const scopes = [];
  const objects = new Map();
  const operations = [];
  const store = {
    async get(key, options) {
      operations.push(["get", key, options]);
      return objects.has(key) ? objects.get(key) : null;
    },
    async set(key, value, options) {
      operations.push(["set", key, options]);
      if (options.onlyIfNew && objects.has(key)) return { modified: false };
      objects.set(key, value);
      return { modified: true };
    },
    async delete(key) {
      operations.push(["delete", key]);
      objects.delete(key);
    },
  };
  const factory = {
    getStore(options) {
      scopes.push(["site", options]);
      return store;
    },
    getDeployStore(options) {
      scopes.push(["deploy", options]);
      return store;
    },
  };
  return { factory, objects, operations, scopes, store };
}

test("Blobs production is durable while preview and missing context are deploy-isolated", async () => {
  for (const context of [
    "production",
    "deploy-preview",
    "branch-deploy",
    undefined,
  ]) {
    const blobs = blobFixture();
    const storage = await createStorage({
      env: { CMS_STORAGE: "netlify-blobs", CONTEXT: context },
      blobFactory: blobs.factory,
    });
    assert.equal(storage.remote, true);
    assert.equal(
      blobs.scopes[0][0],
      context === "production" ? "site" : "deploy",
    );
    await storage.write("uploads/test.webp", Buffer.from("image"), {
      exclusive: true,
      type: "image/webp",
    });
    assert.deepEqual(
      await storage.read("uploads/test.webp"),
      Buffer.from("image"),
    );
    assert.equal(blobs.operations[1][2].consistency, "strong");
    assert.deepEqual(blobs.operations[0][2].metadata, { type: "image/webp" });
    await assert.rejects(
      storage.write("uploads/test.webp", Buffer.from("replacement"), {
        exclusive: true,
      }),
      { code: "EEXIST" },
    );
    assert.deepEqual(
      await storage.read("uploads/test.webp"),
      Buffer.from("image"),
    );
    await storage.remove("uploads/test.webp");
    assert.equal(await storage.read("uploads/test.webp"), null);
  }
});

test("storage rejects arbitrary paths and propagates provider errors", async () => {
  const blobs = blobFixture();
  const storage = await createStorage({
    env: { CMS_STORAGE: "netlify-blobs", CONTEXT: "production" },
    blobFactory: blobs.factory,
  });
  for (const key of [
    "uploads/../secrets.pdf",
    "originals/nested/file.png",
    "/uploads/file.png",
    "uploads/file.svg",
    "nexo.sqlite",
  ]) {
    await assert.rejects(storage.read(key), /Chave/);
    await assert.rejects(storage.write(key, Buffer.from("bad")), /Chave/);
    await assert.rejects(storage.remove(key), /Chave/);
  }
  const outage = new Error("Provider unavailable");
  blobs.store.get = async () => {
    throw outage;
  };
  await assert.rejects(
    storage.read("uploads/valid.webp"),
    (error) => error === outage,
  );
});

test("filesystem storage remains private and rejects symlinks outside its root", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nexo-storage-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dataDir = path.join(directory, "data");
  const storage = await createStorage({ dataDir, env: {} });
  assert.equal(storage.remote, false);
  await storage.write("uploads/local.webp", Buffer.from("local"), {
    exclusive: true,
  });
  assert.deepEqual(
    await storage.read("uploads/local.webp"),
    Buffer.from("local"),
  );
  await assert.rejects(
    storage.write("uploads/local.webp", Buffer.from("changed"), {
      exclusive: true,
    }),
    { code: "EEXIST" },
  );
  await writeFile(path.join(directory, "secret.pdf"), "private");
  await symlink(
    path.join(directory, "secret.pdf"),
    path.join(dataDir, "uploads", "escape.pdf"),
  );
  assert.equal(await storage.read("uploads/escape.pdf"), null);
  await storage.remove("uploads/local.webp");
  assert.equal(await storage.read("uploads/local.webp"), null);
});

function uploadFixture() {
  const asset = {
    id: "asset-id",
    name: "original.png",
    url: "/uploads/asset-id.webp",
    type: "image/webp",
    size: 5,
    width: 1200,
    height: 600,
    createdAt: "2026-10-14T00:00:00Z",
  };
  return {
    asset,
    prepared: {
      buffer: Buffer.from("image"),
      extension: "webp",
      type: "image/webp",
    },
    original: Buffer.from("original"),
    detected: { type: "image/png", extension: "png" },
  };
}

test("upload stores originals privately, rechecks revoked sessions, and rolls back failed metadata", async () => {
  for (const failure of ["session", "database", null]) {
    const blobs = blobFixture();
    const storage = await createStorage({
      env: { CMS_STORAGE: "netlify-blobs", CONTEXT: "production" },
      blobFactory: blobs.factory,
    });
    const inserts = [];
    const db = {
      prepare() {
        return {
          run(...values) {
            if (failure === "database") throw new Error("database failed");
            inserts.push(values);
          },
        };
      },
    };
    const verifySession = () => {
      if (failure === "session") throw new Error("session revoked");
    };
    const promise = persistAssetUpload({
      ...uploadFixture(),
      storage,
      db,
      verifySession,
    });
    if (failure) {
      await assert.rejects(promise, new RegExp(failure));
      assert.equal(blobs.objects.size, 0);
      assert.equal(inserts.length, 0);
    } else {
      await promise;
      assert.deepEqual(
        await storage.read("originals/asset-id.png"),
        Buffer.from("original"),
      );
      assert.equal(inserts[0][8], "originals/asset-id.png");
      assert.equal(inserts[0][2], "/uploads/asset-id.webp");
    }
  }
});

test("a colliding upload never removes a preexisting object", async () => {
  const blobs = blobFixture();
  const storage = await createStorage({
    env: { CMS_STORAGE: "netlify-blobs", CONTEXT: "production" },
    blobFactory: blobs.factory,
  });
  await storage.write("uploads/asset-id.webp", Buffer.from("existing"));
  await assert.rejects(
    persistAssetUpload({ ...uploadFixture(), storage, db: {} }),
    { code: "EEXIST" },
  );
  assert.deepEqual(
    await storage.read("uploads/asset-id.webp"),
    Buffer.from("existing"),
  );
});

test("upload routes only serve registered public files and preserve PDF download headers", async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  const blobs = blobFixture();
  const storage = await createStorage({
    env: { CMS_STORAGE: "netlify-blobs", CONTEXT: "production" },
    blobFactory: blobs.factory,
  });
  const assets = {
    "/uploads/asset-id.webp": { type: "image/webp" },
    "/uploads/notice.pdf": { type: "application/pdf" },
    "/uploads/deleted.webp": { type: "image/webp" },
  };
  const db = {
    prepare() {
      return { get: (url) => assets[url] };
    },
  };
  await storage.write("uploads/asset-id.webp", Buffer.from("image"));
  await storage.write("uploads/notice.pdf", Buffer.from("pdf"));
  await storage.write(
    "originals/asset-id.png",
    Buffer.from("private-original"),
  );
  await storage.write("uploads/orphan.webp", Buffer.from("unregistered"));
  registerUploadRoutes(app, { db, storage });
  for (const url of [
    "/originals/asset-id.png",
    "/uploads/orphan.webp",
    "/uploads/deleted.webp",
    "/uploads/nested/asset-id.webp",
  ])
    assert.equal((await app.inject(url)).statusCode, 404, url);
  const image = await app.inject("/uploads/asset-id.webp");
  assert.equal(image.statusCode, 200);
  assert.equal(image.headers["content-type"], "image/webp");
  assert.equal(image.headers["x-content-type-options"], "nosniff");
  const pdf = await app.inject("/uploads/notice.pdf");
  assert.equal(pdf.headers["content-disposition"], "attachment");
  assert.match(pdf.headers["content-security-policy"], /sandbox/);
  const validate = createAssetValidator(db, {
    storage,
    dataDir: "/absent",
    distDir: "/absent",
  });
  assert.doesNotThrow(() => validate("/uploads/asset-id.webp"));
  assert.throws(() => validate("/uploads/orphan.webp"), {
    code: "ASSET_NOT_FOUND",
  });
  assert.throws(() => validate("/uploads/notice.pdf"), {
    code: "ASSET_TYPE_MISMATCH",
  });
});

test("blog variants survive new function instances without exposing originals or repeating image work", async (t) => {
  const blobs = blobFixture();
  const storage = await createStorage({
    env: { CMS_STORAGE: "netlify-blobs", CONTEXT: "production" },
    blobFactory: blobs.factory,
  });
  const image = await sharp({
    create: { width: 1200, height: 600, channels: 3, background: "#123456" },
  })
    .webp()
    .toBuffer();
  await storage.write("uploads/asset-id.webp", image);
  const asset = {
    ...uploadFixture().asset,
    size: image.length,
    created_at: "2026-10-14T00:00:00Z",
  };
  const db = {
    prepare() {
      return { get: (url) => (url === asset.url ? asset : undefined) };
    },
  };
  const config = {
    origin: "https://nexo.example",
    origins: new Set(["https://nexo.example"]),
    dataDir: "/absent",
    distDir: "/absent",
  };
  let first;
  for (let instance = 0; instance < 2; instance++) {
    const app = Fastify();
    t.after(() => app.close());
    const images = registerBlogImages(app, { db, config, storage });
    const start = blobs.operations.length;
    assert.match(
      (await images.describe(asset.url)).srcset,
      /480\/uploads\/asset-id.webp 480w/,
    );
    assert.equal(
      blobs.operations.length,
      start,
      "HTML metadata does not download the image",
    );
    const response = await app.inject("/media/480/uploads/asset-id.webp");
    assert.equal(response.statusCode, 200);
    assert.equal((await sharp(response.rawPayload).metadata()).width, 480);
    assert.equal(response.headers["content-type"], "image/webp");
    if (instance === 0) first = response.rawPayload;
    else {
      assert.deepEqual(response.rawPayload, first);
      assert.equal(
        blobs.operations.slice(start).some(([op]) => op === "set"),
        false,
        "second instance reuses durable variant",
      );
      assert.equal(
        blobs.operations
          .slice(start)
          .some(([op, key]) => op === "get" && key.startsWith("uploads/")),
        false,
      );
    }
    assert.equal(
      (
        await app.inject({
          url: "/media/480/uploads/asset-id.webp",
          headers: { "if-none-match": response.headers.etag },
        })
      ).statusCode,
      304,
    );
    assert.equal(
      (await app.inject("/media/480/originals/asset-id.png")).statusCode,
      404,
    );
    assert.equal(
      (await app.inject("/media/480/uploads/unknown.webp")).statusCode,
      404,
    );
  }
});
