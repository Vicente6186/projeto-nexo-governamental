const RESEND_ENDPOINT = "https://api.resend.com/emails";
const EMAIL_PATTERN =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const safeEmail = (value) =>
  typeof value === "string" && value.length <= 254 && EMAIL_PATTERN.test(value);
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

function senderAddress(value) {
  if (
    typeof value !== "string" ||
    value.length > 320 ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    return null;
  const trimmed = value.trim();
  if (safeEmail(trimmed)) return trimmed;
  const named = trimmed.match(/^([^<>]+) <([^<>]+)>$/);
  return named && named[1].trim() && safeEmail(named[2]) ? trimmed : null;
}

function resetEmailConfiguration(env) {
  const key = (env.RESEND_API_KEY || "").trim();
  const from = senderAddress(env.RESEND_FROM);
  let origin;
  try {
    const candidate = new URL(env.CMS_ORIGIN);
    const allowedProtocol =
      candidate.protocol === "https:" ||
      (env.NODE_ENV !== "production" &&
        candidate.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(candidate.hostname));
    if (
      allowedProtocol &&
      candidate.origin === env.CMS_ORIGIN &&
      !candidate.username &&
      !candidate.password
    )
      origin = candidate.origin;
  } catch {}
  return {
    key,
    from,
    origin,
    configured:
      key.length >= 10 &&
      key.length <= 512 &&
      /^re_[A-Za-z0-9_-]+$/.test(key) &&
      !!from &&
      !!origin,
  };
}

function resetEmailConfigured(env = process.env) {
  return resetEmailConfiguration(env).configured;
}

function mailError(code) {
  const error = new Error(
    code === "EMAIL_NOT_CONFIGURED"
      ? "O envio de e-mails de recuperação ainda não está configurado."
      : "Não foi possível concluir o envio do e-mail de recuperação.",
  );
  error.code = code;
  return error;
}

function emailLayout({ name, title, introduction, action, explanation }) {
  const greeting = name?.trim() ? `Olá, ${name.trim()}.` : "Olá.";
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f3f5f7;color:#212641;font-family:Arial,Helvetica,sans-serif;line-height:1.6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e6ee;border-radius:16px;overflow:hidden">
<tr><td style="padding:28px 32px;background:#191f51;color:#ffffff"><span style="font-size:24px;font-weight:bold;letter-spacing:-1px">nexo <span style="font-weight:normal">studio</span></span><br><span style="font-size:10px;letter-spacing:1.5px;color:#cdd4ef">NEXO GOVERNAMENTAL</span></td></tr>
<tr><td style="padding:32px"><p style="margin:0 0 16px;font-size:14px">${escapeHtml(greeting)}</p><h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;letter-spacing:-0.6px">${escapeHtml(title)}</h1><p style="margin:0 0 24px;font-size:15px">${escapeHtml(introduction)}</p>${action || ""}<p style="margin:24px 0 0;font-size:13px;color:#59647b">${escapeHtml(explanation)}</p></td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e7eaf1;font-size:11px;color:#69748a">Nexo Governamental · Faculdade de Direito · USP<br>Acesso exclusivo à equipe responsável pelo site.</td></tr>
</table></td></tr></table></body></html>`;
}

function createResetEmailSender({ env = process.env, fetchFn = fetch } = {}) {
  const config = resetEmailConfiguration(env);
  async function send({ to, subject, html, text, idempotencyKey }) {
    if (!config.configured) throw mailError("EMAIL_NOT_CONFIGURED");
    if (
      !safeEmail(to) ||
      typeof idempotencyKey !== "string" ||
      !/^[A-Za-z0-9_/-]{1,256}$/.test(idempotencyKey)
    )
      throw mailError("EMAIL_DELIVERY_FAILED");
    try {
      const response = await fetchFn(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          from: config.from,
          to: [to],
          subject,
          html,
          text,
        }),
        signal: AbortSignal.timeout(8_000),
        redirect: "error",
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (
        typeof result?.id !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(result.id)
      )
        throw new Error();
      return { id: result.id };
    } catch {
      // Provider responses can contain email addresses or links. Never propagate them.
      throw mailError("EMAIL_DELIVERY_FAILED");
    }
  }
  return {
    configured: config.configured,
    async sendReset({
      to,
      name,
      resetUrl,
      expiresMinutes = 30,
      idempotencyKey,
    }) {
      let url;
      try {
        url = new URL(resetUrl);
      } catch {}
      if (
        !url ||
        url.origin !== config.origin ||
        url.pathname !== "/admin/" ||
        url.search ||
        url.username ||
        url.password ||
        !/^#redefinir-senha\?token=[a-f0-9]{64}$/.test(url.hash) ||
        !Number.isSafeInteger(expiresMinutes) ||
        expiresMinutes < 1 ||
        expiresMinutes > 60
      )
        throw mailError(
          config.configured ? "EMAIL_DELIVERY_FAILED" : "EMAIL_NOT_CONFIGURED",
        );
      const title = "Redefina sua senha";
      const introduction = `Recebemos uma solicitação para redefinir sua senha no Nexo Studio. O link abaixo é válido por ${expiresMinutes} minutos e pode ser usado uma única vez.`;
      const explanation =
        "Se você não solicitou esta alteração, pode ignorar este e-mail. Sua senha permanece a mesma até a confirmação de uma nova senha.";
      const safeUrl = escapeHtml(url.href);
      const action = `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:#96e8dc"><a href="${safeUrl}" style="display:inline-block;padding:14px 22px;color:#15294a;font-size:14px;font-weight:bold;text-decoration:none">Definir nova senha</a></td></tr></table><p style="margin:24px 0 8px;font-size:12px;color:#59647b">Se o botão não abrir, copie e cole este endereço no navegador:</p><p style="margin:0;font-size:12px;overflow-wrap:anywhere;word-break:break-all"><a href="${safeUrl}" style="color:#2c4b72">${safeUrl}</a></p>`;
      return send({
        to,
        idempotencyKey,
        subject: "Redefina sua senha · Nexo Studio",
        html: emailLayout({ name, title, introduction, action, explanation }),
        text: `${name?.trim() ? `Olá, ${name.trim()}.` : "Olá."}\n\n${title}\n\n${introduction}\n\n${url.href}\n\n${explanation}\n\nNexo Governamental · Faculdade de Direito · USP`,
      });
    },
    async sendPasswordChanged({ to, name, idempotencyKey }) {
      const title = "Sua senha foi alterada";
      const introduction =
        "A senha da sua conta no Nexo Studio foi redefinida. As sessões anteriores foram encerradas. Entre novamente no painel com a nova senha.";
      const explanation =
        "Se você não reconhece esta alteração, solicite uma nova redefinição pelo painel e avise a pessoa responsável pelos acessos da equipe.";
      return send({
        to,
        idempotencyKey,
        subject: "Sua senha foi alterada · Nexo Studio",
        html: emailLayout({ name, title, introduction, explanation }),
        text: `${name?.trim() ? `Olá, ${name.trim()}.` : "Olá."}\n\n${title}\n\n${introduction}\n\n${explanation}\n\nNexo Governamental · Faculdade de Direito · USP`,
      });
    },
  };
}

module.exports = { createResetEmailSender, resetEmailConfigured };
