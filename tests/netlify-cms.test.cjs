const test = require("node:test");
const assert = require("node:assert/strict");

const modulePromise = import("../netlify/functions/cms.mjs");
const origin = "https://nexo-governamental.netlify.app";
const context = { ip: "192.0.2.12", deploy: { context: "production" } };
const environment = {
  ADMIN_EMAIL: "admin@example.org",
  ADMIN_PASSWORD: "test-private-password",
  CMS_ORIGIN: origin,
  TURSO_DATABASE_URL: "libsql://test-database.turso.io",
  TURSO_AUTH_TOKEN: "test-private-database-token",
};
const reply = (changes = {}) => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  rawPayload: Buffer.from('{"ok":true}'),
  ...changes,
});
const request = (pathname = "/api/health", options) =>
  new Request(origin + pathname, options);
const flush = () => new Promise((resolve) => setImmediate(resolve));
async function fixture({
  inject,
  drain,
  env = environment,
  buildApp,
  ...options
} = {}) {
  const { createCmsHandler } = await modulePromise;
  return createCmsHandler({
    buildApp:
      buildApp ||
      (async () => ({
        inject: inject || (async () => reply()),
        drainBackgroundJobs: drain || (async () => {}),
      })),
    getEnvironment: (key) => env[key],
    reportError: () => {},
    ...options,
  });
}

test("CMS routes dynamic documents and reserves the home page for the CDN", async () => {
  const { config } = await modulePromise;
  for (const pathname of [
    "/api/*",
    "/blog",
    "/blog/*",
    "/admin",
    "/admin/*",
    "/uploads/*",
    "/media/*",
    "/robots.txt",
    "/sitemap.xml",
    "/sitemap-pages.xml",
  ])
    assert.ok(config.path.includes(pathname));
  assert.equal(config.path.includes("/*"), false);
  assert.equal(config.path.includes("/"), false);
  assert.equal(config.preferStatic, undefined);
});

test("adapter preserves binary bodies, cookies and the trusted platform IP", async () => {
  const input = Buffer.from([0, 255, 128, 42]);
  const output = Buffer.from([137, 80, 78, 71, 255, 0]);
  const cookies = [
    "nexo_session=abc; HttpOnly; Secure; Path=/",
    "other=xyz; Path=/",
  ];
  let builds = 0;
  let settings;
  const calls = [];
  const handler = await fixture({
    env: {
      ...environment,
      CMS_LOCAL_PREVIEW: "1",
      CMS_TRUST_PROXY: "127.0.0.1",
      DATA_DIR: "/wrong",
    },
    buildApp: async (options) => {
      builds++;
      settings = options;
      return {
        inject: async (call) => {
          calls.push(call);
          return reply({
            rawPayload: output,
            headers: {
              "content-type": "image/png",
              "set-cookie": cookies,
              "transfer-encoding": "chunked",
            },
          });
        },
        drainBackgroundJobs: async () => {},
      };
    },
  });
  const response = await handler(
    request("/api/admin/uploads?edit=1", {
      method: "POST",
      body: input,
      headers: {
        "content-type": "application/octet-stream",
        "x-forwarded-for": "203.0.113.99",
        forwarded: "for=203.0.113.99",
        origin: origin,
      },
    }),
    context,
  );
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), output);
  assert.deepEqual(response.headers.getSetCookie(), cookies);
  assert.equal(response.headers.get("transfer-encoding"), null);
  assert.deepEqual(calls[0].payload, input);
  assert.equal(calls[0].url, "/api/admin/uploads?edit=1");
  assert.equal(calls[0].remoteAddress, context.ip);
  assert.equal(calls[0].headers["x-forwarded-for"], undefined);
  assert.equal(calls[0].headers.forwarded, undefined);
  assert.equal(calls[0].headers.origin, origin);
  assert.equal(calls[0].headers["content-length"], "4");
  assert.equal(settings.dataDir, "/tmp/nexo");
  assert.match(settings.distDir, /\.netlify\/server-dist$/);
  assert.equal(settings.env.CMS_STORAGE, "netlify-blobs");
  assert.equal(settings.env.CMS_LOCAL_PREVIEW, "");
  assert.equal(settings.env.CMS_TRUST_PROXY, "");
  assert.equal(settings.env.NODE_ENV, "production");
  await handler(request(), context);
  assert.equal(builds, 1);
});

test("requests stay serialized until queued background work finishes", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const events = [];
  let drains = 0;
  const handler = await fixture({
    inject: async (call) => {
      events.push(call.url);
      return reply();
    },
    drain: async () => {
      if (++drains === 1) await gate;
      events.push("drained");
    },
  });
  const first = handler(request("/api/first"), context);
  await flush();
  const second = handler(request("/api/second"), context);
  await flush();
  assert.deepEqual(events, ["/api/first"]);
  release();
  assert.deepEqual(
    (await Promise.all([first, second])).map((response) => response.status),
    [200, 200],
  );
  assert.deepEqual(events, ["/api/first", "drained", "/api/second", "drained"]);
});

test("initialization failures stay generic and a later invocation retries", async () => {
  let attempts = 0;
  const handler = await fixture({
    buildApp: async () => {
      if (++attempts === 1) throw new Error("secret-provider-token");
      return {
        inject: async () => reply(),
        drainBackgroundJobs: async () => {},
      };
    },
  });
  const failed = await handler(request(), context);
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /secret|provider|token/);
  assert.equal(failed.headers.get("retry-after"), "3600");
  assert.equal((await handler(request(), context)).status, 200);
  assert.equal(attempts, 2);
});

test("inject or drain errors cannot poison the request queue", async () => {
  let attempts = 0;
  let drains = 0;
  const handler = await fixture({
    inject: async () => {
      if (++attempts === 1) throw new Error("private");
      return reply();
    },
    drain: async () => {
      if (++drains === 2) throw new Error("private");
    },
  });
  assert.equal((await handler(request(), context)).status, 503);
  assert.equal((await handler(request(), context)).status, 503);
  assert.equal((await handler(request(), context)).status, 200);
  assert.equal(drains, 3);
});

test("previews require explicit opt-in and remote credentials never fall back to SQLite", async () => {
  let builds = 0;
  const buildApp = async () => {
    builds++;
    return { inject: async () => reply(), drainBackgroundJobs: async () => {} };
  };
  const previewContext = { ...context, deploy: { context: "deploy-preview" } };
  const blocked = await fixture({ buildApp });
  assert.equal((await blocked(request(), previewContext)).status, 503);
  assert.equal(builds, 0);
  for (const missing of ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"]) {
    const handler = await fixture({
      buildApp,
      env: { ...environment, [missing]: "" },
    });
    assert.equal((await handler(request(), context)).status, 503);
  }
  assert.equal(builds, 0);
  let settings;
  const allowed = await fixture({
    env: { ...environment, CMS_ALLOW_PREVIEW: "1" },
    buildApp: async (options) => {
      settings = options;
      return buildApp();
    },
  });
  assert.equal((await allowed(request(), previewContext)).status, 200);
  assert.equal(settings.env.CONTEXT, "deploy-preview");
  assert.equal(builds, 1);
});

test("untrusted IP headers cannot substitute absent platform metadata", async () => {
  let calls = 0;
  const handler = await fixture({
    inject: async () => {
      calls++;
      return reply();
    },
  });
  const response = await handler(
    request("/api/login", { headers: { "x-forwarded-for": "192.0.2.2" } }),
    { deploy: context.deploy },
  );
  assert.equal(response.status, 503);
  assert.equal(calls, 0);
});

test("internal blog template is never served, including encoded requests", async () => {
  let calls = 0;
  const handler = await fixture({
    inject: async () => {
      calls++;
      return reply();
    },
  });
  for (const pathname of [
    "/blog/template.html",
    "/blog/%74emplate.html",
    "/blog/template.html/",
  ]) {
    const response = await handler(request(pathname), context);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  }
  assert.equal(calls, 0);
});

test("oversized binary requests are rejected before app initialization", async () => {
  const { MAX_REQUEST_BYTES } = await modulePromise;
  let builds = 0;
  const handler = await fixture({
    buildApp: async () => {
      builds++;
      throw new Error("should not initialize");
    },
  });
  for (const headers of [
    {},
    { "content-length": String(MAX_REQUEST_BYTES + 1) },
  ]) {
    const response = await handler(
      request("/api/admin/uploads", {
        method: "POST",
        body: Buffer.alloc(MAX_REQUEST_BYTES + 1),
        headers,
      }),
      context,
    );
    assert.equal(response.status, 413);
    assert.equal((await response.json()).code, "PAYLOAD_TOO_LARGE");
  }
  assert.equal(builds, 0);
});

test("HEAD and empty status codes preserve headers without forbidden response bodies", async () => {
  for (const [method, statusCode] of [
    ["HEAD", 200],
    ["GET", 204],
    ["GET", 205],
    ["GET", 304],
  ]) {
    const handler = await fixture({
      inject: async () =>
        reply({
          statusCode,
          headers: { etag: '"original"', "cache-control": "no-cache" },
          rawPayload: Buffer.from("ignored"),
        }),
    });
    const response = await handler(request("/blog/", { method }), context);
    assert.equal(response.status, statusCode);
    assert.equal(response.headers.get("etag"), '"original"');
    assert.equal(response.body, null);
    assert.equal(await response.text(), "");
  }
});
