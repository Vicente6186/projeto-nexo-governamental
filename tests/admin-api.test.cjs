const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
let moduleId = 0;
const originalFetch = global.fetch;
async function fixture(t, handler) {
  global.fetch = handler;
  t.after(() => {
    global.fetch = originalFetch;
  });
  const source = readFileSync(
    path.join(__dirname, "../src/admin/api.js"),
    "utf8",
  );
  return import(
    `data:text/javascript;base64,${Buffer.from(`${source}\n// fixture ${++moduleId}`).toString("base64")}`
  );
}
const json = (data, status = 200) => Response.json(data, { status });

test("a stale CSRF token is refreshed once before retrying the rejected mutation", async (t) => {
  const calls = [];
  let mutations = 0;
  const { api } = await fixture(t, async (url, options) => {
    calls.push({ url, options });
    if (url === "/api/session")
      return json({
        authenticated: true,
        user: { id: "alice" },
        csrfToken: mutations ? "new-token" : "old-token",
      });
    if (++mutations === 1)
      return json({ error: "Sessão", code: "CSRF_EXPIRED" }, 403);
    return json({ version: 2 });
  });
  await api("/api/session");
  calls.length = 0;
  const data = await api("/api/admin/content", {
    method: "PUT",
    body: { version: 1, content: { title: "Preservado" } },
  });
  assert.equal(data.version, 2);
  assert.deepEqual(
    calls.map((call) => call.url),
    ["/api/admin/content", "/api/session", "/api/admin/content"],
  );
  assert.equal(calls[0].options.headers["X-CSRF-Token"], "old-token");
  assert.equal(calls[2].options.headers["X-CSRF-Token"], "new-token");
  assert.equal(calls[0].options.body, calls[2].options.body);
});

test("expired sessions and a second CSRF rejection stop without retry loops", async (t) => {
  for (const authenticated of [false, true]) {
    let count = 0;
    let initial = true;
    const { api } = await fixture(t, async (url) => {
      count++;
      if (url === "/api/session" && initial) {
        initial = false;
        return json({
          authenticated: true,
          user: { id: "alice" },
          csrfToken: "original",
        });
      }
      return url === "/api/session"
        ? json({ authenticated, user: { id: "alice" }, csrfToken: "token" })
        : json({ error: "Sessão", code: "CSRF_EXPIRED" }, 403);
    });
    await api("/api/session");
    count = 0;
    await assert.rejects(
      api("/api/admin/publish", { method: "POST", body: { version: 1 } }),
      (error) => error.status === 401 && error.code === "SESSION_EXPIRED",
    );
    assert.equal(count, authenticated ? 3 : 2);
  }
});

test("CSRF refresh never retries an old editor's mutation as another account", async (t) => {
  const calls = [];
  let sessions = 0;
  const { api } = await fixture(t, async (url, options) => {
    calls.push({ url, options });
    if (url === "/api/session") {
      const id = ++sessions === 1 ? "alice" : "bob";
      return json({
        authenticated: true,
        user: { id },
        csrfToken: `${id}-token`,
      });
    }
    return json({ code: "CSRF_EXPIRED" }, 403);
  });
  await api("/api/session");
  calls.length = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(
      api("/api/admin/content", { method: "PUT", body: { version: 1 } }),
      (error) => error.status === 401 && error.code === "SESSION_EXPIRED",
    );
  }
  assert.deepEqual(
    calls.map(({ url }) => url),
    [
      "/api/admin/content",
      "/api/session",
      "/api/admin/content",
      "/api/session",
    ],
  );
  assert.equal(calls[0].options.headers["X-CSRF-Token"], "alice-token");
  assert.equal(
    calls[2].options.headers["X-CSRF-Token"],
    "alice-token",
    "a mismatched refresh must not replace the editor's session identity or token",
  );
});

test("explicit logout and a subsequent login establish the next account for safe CSRF renewal", async (t) => {
  for (const reset of ["logout", "clear"]) {
    let activeUser = "alice";
    let mutations = 0;
    const { api, setCsrf } = await fixture(t, async (url, options) => {
      if (url === "/api/logout") return json({ authenticated: false });
      if (url === "/api/login") activeUser = "bob";
      if (["/api/session", "/api/login"].includes(url))
        return json({
          authenticated: true,
          user: { id: activeUser },
          csrfToken: `${activeUser}-${mutations}`,
        });
      if (++mutations === 1) return json({ code: "CSRF_EXPIRED" }, 403);
      assert.equal(options.headers["X-CSRF-Token"], "bob-1");
      return json({ version: 2 });
    });
    await api("/api/session");
    if (reset === "logout")
      await api("/api/logout", { method: "POST", body: {} });
    else setCsrf("");
    await api("/api/login", { method: "POST", body: {} });
    assert.equal(
      (await api("/api/admin/content", { method: "PUT", body: { version: 1 } }))
        .version,
      2,
    );
    assert.equal(mutations, 2);
  }
});

test("a parallel session response cannot reassign an already pending mutation", async (t) => {
  let sessions = 0;
  let rejectMutation;
  let mutations = 0;
  const { api } = await fixture(t, async (url) => {
    if (url === "/api/session") {
      const id = ++sessions === 1 ? "alice" : "bob";
      return json({
        authenticated: true,
        user: { id },
        csrfToken: `${id}-token`,
      });
    }
    mutations++;
    return new Promise((resolve) => {
      rejectMutation = resolve;
    });
  });
  await api("/api/session");
  const mutation = api("/api/admin/content", {
    method: "PUT",
    body: { version: 1 },
  });
  const rejected = assert.rejects(
    mutation,
    (error) => error.status === 401 && error.code === "SESSION_EXPIRED",
  );
  await api("/api/session");
  rejectMutation(json({ code: "CSRF_EXPIRED" }, 403));
  await rejected;
  assert.equal(
    mutations,
    1,
    "the original mutation is never retried with Bob's token",
  );
});

test("ordinary forbidden, conflicts and ambiguous network failures never repeat mutations", async (t) => {
  for (const outcome of ["forbidden", "conflict", "network"]) {
    let count = 0;
    const { api } = await fixture(t, async () => {
      count++;
      if (outcome === "network")
        throw new TypeError("Connection lost after send");
      return json(
        {
          error: "Não concluído",
          code: outcome === "conflict" ? "CONTENT_CONFLICT" : "FORBIDDEN",
          currentVersion: 4,
        },
        outcome === "conflict" ? 409 : 403,
      );
    });
    await assert.rejects(
      api("/api/admin/publish", { method: "POST", body: { version: 1 } }),
      (error) =>
        outcome === "network"
          ? error.code === "NETWORK_ERROR"
          : error.status === (outcome === "conflict" ? 409 : 403),
    );
    assert.equal(count, 1);
  }
});

test("malformed successful responses are rejected instead of replacing editor state", async (t) => {
  for (const body of [
    "<html>Proxy fallback</html>",
    "null",
    "[]",
    '"unexpected"',
  ]) {
    let count = 0;
    const { api } = await fixture(t, async () => {
      count++;
      return new Response(body, { status: 200 });
    });
    await assert.rejects(
      api("/api/admin/content", { method: "PUT", body: { version: 1 } }),
      (error) => error.code === "INVALID_RESPONSE",
    );
    assert.equal(count, 1);
  }
});

test("timeouts and explicit cancellation preserve distinct errors without repeating uploads", async (t) => {
  let count = 0;
  const { api } = await fixture(t, async (_url, { signal }) => {
    count++;
    return new Promise((_resolve, reject) => {
      if (signal.aborted) return reject(new Error("Aborted"));
      signal.addEventListener("abort", () => reject(new Error("Aborted")), {
        once: true,
      });
    });
  });
  await assert.rejects(
    api("/api/admin/uploads", { method: "POST", timeout: 5 }),
    (error) => error.code === "TIMEOUT",
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    api("/api/admin/uploads", { method: "POST", signal: controller.signal }),
    (error) => error.code === "CANCELLED",
  );
  assert.equal(count, 2);
});
