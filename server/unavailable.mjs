const MESSAGE = "Esta área está temporariamente indisponível";

const styles = `
  :root { color-scheme: light; font-family: Arial, Helvetica, sans-serif; color: #191f51; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; min-height: 100svh; background: radial-gradient(ellipse at top right, #dce4f5, transparent 55%), #f3f5fa; }
  main { width: min(100% - 40px, 680px); margin: 0 auto; padding: clamp(48px, 12vh, 120px) 0 48px; }
  .brand { display: inline-block; color: #191f51; text-decoration: none; margin-bottom: 36px; }
  .brand strong { display: block; font-size: 22px; letter-spacing: -.6px; }
  .brand span { display: block; margin-top: 7px; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
  section { padding: clamp(28px, 6vw, 52px); border: 1px solid #dce1ef; border-radius: 24px; background: #fff; box-shadow: 0 18px 60px #191f510c; }
  .label { margin: 0 0 20px; font-size: 12px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #52608a; }
  h1 { margin: 0; max-width: 510px; font-size: clamp(30px, 6vw, 42px); line-height: 1.14; letter-spacing: -1.3px; }
  .description { margin: 22px 0 30px; color: #535b74; font-size: 17px; line-height: 1.65; }
  .home { display: inline-block; padding: 15px 21px; border-radius: 10px; background: #191f51; color: #fff; font-size: 15px; font-weight: 700; text-decoration: none; }
  .home:hover { background: #29346f; }
  a:focus-visible { outline: 3px solid #597aca; outline-offset: 5px; }
  footer { margin-top: 28px; color: #535b74; font-size: 14px; line-height: 1.7; }
  footer p { margin: 0; }
  footer a { color: #191f51; overflow-wrap: anywhere; text-underline-offset: 3px; }
  @media (max-width: 420px) { main { width: calc(100% - 28px); } section { border-radius: 18px; } }
`;

function page(privateArea) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#191f51">
  ${privateArea ? '<meta name="robots" content="noindex, nofollow">' : ""}
  <title>${MESSAGE} · Nexo Governamental</title>
  <style>${styles}</style>
</head>
<body>
  <main>
    <a class="brand" href="/" aria-label="Nexo Governamental — página inicial">
      <strong>Nexo Governamental</strong><span>XI de Agosto</span>
    </a>
    <section aria-labelledby="title">
      <p class="label">Indisponibilidade temporária</p>
      <h1 id="title">${MESSAGE}</h1>
      <p class="description">Tente novamente mais tarde. Você pode continuar acessando as informações do Nexo na página inicial.</p>
      <a class="home" href="/">Voltar à página inicial</a>
    </section>
    <footer>
      <p>Precisa falar com o Nexo?</p>
      <a href="mailto:nexogov.usp@gmail.com">nexogov.usp@gmail.com</a>
    </footer>
  </main>
</body>
</html>`;
}

export default async function recovery(request) {
  const pathname = new URL(request.url).pathname;
  const api = pathname.startsWith("/api/");
  const admin = pathname === "/admin" || pathname.startsWith("/admin/");
  const document = pathname.endsWith(".xml") || pathname === "/robots.txt";
  const headers = {
    "Cache-Control": "no-store",
    "Retry-After": "3600",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Content-Type": api
      ? "application/json; charset=utf-8"
      : document
        ? "text/plain; charset=utf-8"
        : "text/html; charset=utf-8",
  };
  if (api || admin) headers["X-Robots-Tag"] = "noindex, nofollow";

  const body = api
    ? JSON.stringify({ error: MESSAGE, code: "TEMPORARILY_UNAVAILABLE" })
    : document
      ? `${MESSAGE}. Tente novamente mais tarde.\n`
      : page(admin);

  return new Response(request.method === "HEAD" ? null : body, {
    status: 503,
    headers,
  });
}
