const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createResetEmailSender,
  resetEmailConfigured,
} = require("../server/reset-email.cjs");
const env = {
  NODE_ENV: "production",
  CMS_ORIGIN: "https://nexo.example.org",
  RESEND_API_KEY: "re_fake_test_only_123",
  RESEND_FROM: "Nexo Studio <acesso@nexo.example.org>",
};
const token = "a".repeat(64);
const message = {
  to: "conta@example.org",
  name: "Pessoa <script>alert(1)</script> & Equipe",
  resetUrl: `${env.CMS_ORIGIN}/admin/#redefinir-senha?token=${token}`,
  expiresMinutes: 30,
  idempotencyKey: "password-reset/test-123",
};

test("email configuration requires credentials, a safe sender and an exact HTTPS production origin", () => {
  assert.equal(resetEmailConfigured(env), true);
  assert.equal(
    resetEmailConfigured({ ...env, RESEND_FROM: "acesso@nexo.example.org" }),
    true,
  );
  for (const overrides of [
    { RESEND_API_KEY: "" },
    { RESEND_API_KEY: "wrong-format" },
    { RESEND_FROM: "" },
    { RESEND_FROM: "invalid" },
    { RESEND_FROM: "Nexo <acesso@nexo.example.org>\r\nBcc: other@example.org" },
    { CMS_ORIGIN: "" },
    { CMS_ORIGIN: "http://nexo.example.org" },
    { CMS_ORIGIN: "https://nexo.example.org/admin/" },
    { CMS_ORIGIN: "https://user:secret@nexo.example.org" },
  ])
    assert.equal(resetEmailConfigured({ ...env, ...overrides }), false);
  assert.equal(
    resetEmailConfigured({
      ...env,
      NODE_ENV: "development",
      CMS_ORIGIN: "http://127.0.0.1:8080",
    }),
    true,
  );
  assert.equal(
    resetEmailConfigured({
      ...env,
      NODE_ENV: "development",
      CMS_ORIGIN: "http://public.example.org",
    }),
    false,
  );
});

test("Resend request uses a bounded, idempotent API call and safe branded HTML plus plain text", async () => {
  const requests = [];
  const sender = createResetEmailSender({
    env,
    fetchFn: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      return Response.json({ id: "provider-email-123" });
    },
  });
  assert.deepEqual(await sender.sendReset(message), {
    id: "provider-email-123",
  });
  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(request.url, "https://api.resend.com/emails");
  assert.equal(request.options.method, "POST");
  assert.equal(
    request.options.headers.Authorization,
    `Bearer ${env.RESEND_API_KEY}`,
  );
  assert.equal(
    request.options.headers["Idempotency-Key"],
    message.idempotencyKey,
  );
  assert.equal(request.options.redirect, "error");
  assert(request.options.signal instanceof AbortSignal);
  assert.deepEqual(request.body.to, [message.to]);
  assert.equal(request.body.from, env.RESEND_FROM);
  assert(
    request.body.html.includes(
      "Nexo Governamental · Faculdade de Direito · USP",
    ),
  );
  assert(request.body.html.includes("&lt;script&gt;"));
  assert(!request.body.html.includes("<script>"));
  assert(!request.body.html.includes(env.RESEND_API_KEY));
  assert(request.body.html.includes(`href="${message.resetUrl}"`));
  assert(request.body.text.includes(message.resetUrl));
  assert(request.body.text.includes("30 minutos"));
  assert(request.body.text.includes("uma única vez"));
});

test("email cannot send an attacker origin, arbitrary link, extra recipient or injected header", async () => {
  let sent = 0;
  const sender = createResetEmailSender({
    env,
    fetchFn: async () => {
      sent++;
      return Response.json({ id: "id" });
    },
  });
  for (const changes of [
    {
      resetUrl: message.resetUrl.replace(
        "nexo.example.org",
        "attacker.example.org",
      ),
    },
    { resetUrl: `${env.CMS_ORIGIN}/other/#redefinir-senha?token=${token}` },
    { resetUrl: `${env.CMS_ORIGIN}/admin/?token=${token}` },
    { resetUrl: `${message.resetUrl}&redirect=https://attacker.example.org` },
    { resetUrl: "javascript:alert(1)" },
    { to: "one@example.org,two@example.org" },
    { to: "one@example.org\r\nBcc: two@example.org" },
    { idempotencyKey: "key\r\ninjected: value" },
    { expiresMinutes: -1 },
  ])
    await assert.rejects(sender.sendReset({ ...message, ...changes }), {
      code: "EMAIL_DELIVERY_FAILED",
    });
  assert.equal(sent, 0);
  const missing = createResetEmailSender({
    env: {},
    fetchFn: async () => {
      sent++;
    },
  });
  await assert.rejects(missing.sendReset(message), {
    code: "EMAIL_NOT_CONFIGURED",
  });
  assert.equal(sent, 0);
});

test("provider errors, malformed successes and timeouts never expose provider data or recovery links", async () => {
  const secret = `secret ${env.RESEND_API_KEY} ${message.resetUrl} ${message.to}`;
  for (const fetchFn of [
    async () => new Response(secret, { status: 429 }),
    async () => new Response(secret, { status: 403 }),
    async () => new Response("not json", { status: 200 }),
    async () => Response.json({ message: secret }),
    async () => {
      throw new Error(secret);
    },
    async () => {
      throw new DOMException(secret, "TimeoutError");
    },
  ]) {
    const sender = createResetEmailSender({ env, fetchFn });
    await assert.rejects(sender.sendReset(message), (error) => {
      assert.equal(error.code, "EMAIL_DELIVERY_FAILED");
      assert(!error.message.includes(secret));
      assert(!error.message.includes(token));
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test("password-change notification contains neither passwords nor the reset token", async () => {
  let body;
  const sender = createResetEmailSender({
    env,
    fetchFn: async (_url, options) => {
      body = JSON.parse(options.body);
      return Response.json({ id: "changed-123" });
    },
  });
  await sender.sendPasswordChanged({
    to: message.to,
    name: "Pessoa",
    idempotencyKey: "password-changed/test-123",
  });
  assert(body.text.includes("sessões anteriores foram encerradas"));
  assert(!JSON.stringify(body).includes(token));
  assert(!body.html.includes(env.RESEND_API_KEY));
  assert(body.subject.includes("Sua senha foi alterada"));
});
