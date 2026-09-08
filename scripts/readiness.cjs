const fs = require("node:fs");
const path = require("node:path");
const { isIP } = require("node:net");
const { args, loadEnv } = require("./cli.cjs");
const { resetEmailConfigured } = require("../server/reset-email.cjs");
const { isValidEmail } = require("../server/users.cjs");

async function readiness({
  env = process.env,
  baseUrl,
  distDir = path.resolve(__dirname, "..", "dist"),
  production = env.NODE_ENV === "production",
  fetchFn = fetch,
} = {}) {
  const checks = [];
  const check = (name, ok, pass, fail) =>
    checks.push({
      name,
      state: ok ? "pass" : "fail",
      detail: ok ? pass : fail,
    });
  check(
    "Node.js",
    Number(process.versions.node.split(".")[0]) >= 24,
    "Node.js 24 ou superior.",
    "Use Node.js 24 ou superior.",
  );
  check(
    "Build",
    fs.existsSync(path.join(distDir, "index.html")) &&
      fs.existsSync(path.join(distDir, "admin", "index.html")),
    "Site e painel compilados encontrados.",
    "Execute npm run build antes de validar a entrega.",
  );
  if (production) {
    check(
      "Ambiente",
      env.NODE_ENV === "production",
      "Modo de produção configurado.",
      "Defina NODE_ENV=production no destino.",
    );
    check(
      "Prévia local",
      env.CMS_LOCAL_PREVIEW !== "1",
      "Acesso demonstrativo desabilitado.",
      "CMS_LOCAL_PREVIEW deve ser 0 em produção.",
    );
    check(
      "Acesso inicial",
      isValidEmail((env.ADMIN_EMAIL || "").trim()) &&
        (env.ADMIN_PASSWORD || "").length >= 12 &&
        (env.ADMIN_PASSWORD || "").length <= 1024,
      "Credenciais iniciais presentes, sem exposição de valores.",
      "Configure ADMIN_EMAIL válido e ADMIN_PASSWORD com 12 a 1.024 caracteres.",
    );
    let validOrigin = false;
    try {
      const origin = new URL(env.CMS_ORIGIN);
      validOrigin =
        origin.protocol === "https:" &&
        origin.origin === env.CMS_ORIGIN &&
        !origin.username &&
        !origin.password;
    } catch {}
    check(
      "Origem",
      validOrigin,
      "Origem HTTPS exata configurada.",
      "CMS_ORIGIN deve ser uma origem HTTPS, sem caminho ou barra final.",
    );
    check(
      "E-mail de recuperação",
      resetEmailConfigured({ ...env, NODE_ENV: "production" }),
      "Configuração de envio presente e válida; domínio e entrega real ainda precisam ser verificados no Resend.",
      "Configure RESEND_API_KEY, RESEND_FROM e CMS_ORIGIN HTTPS para disponibilizar a recuperação de senha.",
    );
    const resetLimit =
      env.RESET_EMAIL_DAILY_LIMIT === undefined ||
      env.RESET_EMAIL_DAILY_LIMIT === ""
        ? 20
        : Number(env.RESET_EMAIL_DAILY_LIMIT);
    check(
      "Limite de recuperação",
      Number.isSafeInteger(resetLimit) && resetLimit >= 1 && resetLimit <= 90,
      "Limite diário de recuperação configurado entre 1 e 90 mensagens, com padrão 20.",
      "RESET_EMAIL_DAILY_LIMIT deve ser um inteiro entre 1 e 90.",
    );
    check(
      "Armazenamento",
      !!env.DATA_DIR,
      "DATA_DIR explícito; a persistência real precisa ser verificada no provedor.",
      "Defina DATA_DIR no volume persistente do destino.",
    );
    const backupHours =
      env.CMS_BACKUP_INTERVAL_HOURS === undefined ||
      env.CMS_BACKUP_INTERVAL_HOURS === ""
        ? 24
        : Number(env.CMS_BACKUP_INTERVAL_HOURS);
    const keep =
      env.CMS_BACKUP_KEEP === undefined || env.CMS_BACKUP_KEEP === ""
        ? 14
        : Number(env.CMS_BACKUP_KEEP);
    check(
      "Backup automático",
      Number.isSafeInteger(backupHours) &&
        backupHours > 0 &&
        backupHours <= 168 &&
        Number.isSafeInteger(keep) &&
        keep >= 1 &&
        keep <= 3650,
      "Agendamento e retenção configurados; confira os logs e a cópia externa.",
      "Configure CMS_BACKUP_INTERVAL_HOURS entre 1 e 168 e CMS_BACKUP_KEEP entre 1 e 3650, ou documente um agendador externo antes da liberação.",
    );
    const trust = (env.CMS_TRUST_PROXY || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const validProxy = trust.every((value) => {
      const [address, prefix, ...extra] = value.split("/");
      const family = isIP(address);
      return (
        !!family &&
        !extra.length &&
        (prefix === undefined ||
          (/^\d+$/.test(prefix) &&
            Number(prefix) >= 1 &&
            Number(prefix) <= (family === 4 ? 32 : 128)))
      );
    });
    check(
      "Proxy",
      validProxy,
      "Lista de IPs/CIDRs explícitos válida; sem confiança irrestrita.",
      "Configure apenas IPs ou CIDRs válidos e específicos do proxy da hospedagem, sem curingas.",
    );
  }
  let origin;
  try {
    origin = new URL(
      baseUrl ||
        (production ? env.CMS_ORIGIN : `http://127.0.0.1:${env.PORT || 3001}`),
    );
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      throw new Error();
  } catch {
    origin = undefined;
    checks.push({
      name: "HTTP",
      state: "fail",
      detail:
        "Informe --url com a origem HTTP ou HTTPS da aplicação, sem credenciais ou caminhos.",
    });
  }
  if (origin) {
    if (production) {
      check(
        "HTTPS público",
        origin.protocol === "https:",
        "A verificação HTTP usa TLS validado pelo Node.",
        "A liberação de produção exige verificação no domínio HTTPS público.",
      );
      check(
        "Domínio verificado",
        origin.origin === env.CMS_ORIGIN,
        "A origem consultada é a mesma configurada em CMS_ORIGIN.",
        "O endereço de --url deve corresponder exatamente à origem configurada em CMS_ORIGIN.",
      );
    }
    for (const [name, route, kind] of [
      ["Saúde da API", "/api/health", "health"],
      ["Conteúdo público", "/api/content", "content"],
      ["Blog", "/blog/", "html"],
      ["Painel", "/admin/", "admin"],
      ...(production
        ? [["Acesso autenticado", "/api/session", "session"]]
        : []),
    ]) {
      try {
        const response = await fetchFn(new URL(route, origin), {
          redirect: "error",
          signal: AbortSignal.timeout(8_000),
        });
        let valid = response.ok;
        if (valid && ["health", "content", "session"].includes(kind)) {
          const body = await response.json();
          if (kind === "session")
            check(
              "Recuperação disponível",
              body.passwordResetAvailable === true,
              "A API confirma que a recuperação por e-mail está configurada.",
              "A API ainda não disponibiliza a recuperação de senha. Confira as configurações de envio no ambiente em execução.",
            );
          valid =
            kind === "health"
              ? body.ok === true
              : kind === "session"
                ? body.localPreview === false &&
                  body.authenticated === false &&
                  body.user === null
                : !!body.content?.site && !!body.content?.selection;
        } else if (valid) {
          const html = await response.text();
          valid =
            /text\/html/i.test(response.headers.get("content-type") || "") &&
            /<!doctype html/i.test(html);
          if (kind === "admin")
            valid =
              valid &&
              /noindex/i.test(response.headers.get("x-robots-tag") || html);
          else
            valid =
              valid &&
              /<h1\b[^>]*>\s*Blog do\s+(?:<[^>]+>\s*)*Nexo\b/i.test(html) &&
              !/<!--BLOG_(?:META|CONTENT)-->/i.test(html);
        }
        check(
          name,
          valid,
          `Resposta válida em ${route}.`,
          `Resposta inesperada em ${route} (HTTP ${response.status}).`,
        );
      } catch {
        checks.push({
          name,
          state: "fail",
          detail: `Não foi possível confirmar ${route}. Verifique o processo, DNS, HTTPS e o encaminhamento do proxy.`,
        });
      }
    }
  }
  const externalGates = [
    "Volume persistente e comportamento após reinício ou substituição do contêiner.",
    "Backup copiado para outro armazenamento e restauração exercitada no destino.",
    "Contas individuais da equipe, troca da senha inicial e revogação de acessos antigos.",
    "Domínio de envio verificado no Resend, rastreamento de links e abertura desativado e mensagem de recuperação efetivamente recebida.",
    "Monitoramento de disponibilidade, logs de falha e responsável pela manutenção.",
    "Conteúdo institucional revisado e rascunhos demonstrativos removidos ou mantidos sem publicação.",
  ];
  return {
    scope: production ? "production-readiness" : "local-readiness",
    ok: checks.every((item) => item.state === "pass"),
    checks,
    publicGoLiveConfirmed: false,
    externalGates,
    note: "Este comando verifica configuração e respostas HTTP. Ele não comprova sozinho publicação pública, persistência, recuperação ou operação pela equipe.",
  };
}
if (require.main === module) {
  (async () => {
    loadEnv();
    const flags = args(
      process.argv.slice(2),
      ["--url", "--dist-dir"],
      ["--production"],
    );
    const report = await readiness({
      baseUrl: flags["--url"],
      distDir: flags["--dist-dir"] && path.resolve(flags["--dist-dir"]),
      production:
        !!flags["--production"] || process.env.NODE_ENV === "production",
    });
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { readiness };
