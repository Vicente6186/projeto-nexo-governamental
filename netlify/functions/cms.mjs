import path from "node:path";
import { isIP } from "node:net";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Keep this CommonJS module intact so Netlify's V2 dependency tracer can see
// its require() calls instead of losing them inside an ESM compatibility shim.
const appModule = require("../../server/app.cjs");
import unavailable from "../../server/unavailable.mjs";

export const MAX_REQUEST_BYTES = 4 * 1024 * 1024 + 64 * 1024;
const ENVIRONMENT_KEYS = [
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "ADMIN_NAME",
  "CMS_ORIGIN",
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  "RESEND_API_KEY",
  "RESEND_FROM",
  "RESET_EMAIL_DAILY_LIMIT",
];
const HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function runtimeEnvironment(name) {
  return globalThis.Netlify?.env?.get(name) ?? process.env[name];
}

function errorResponse(request, status, message, code) {
  return new Response(
    request.method === "HEAD" ? null : JSON.stringify({ error: message, code }),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}

async function requestPayload(request) {
  if (!request.body || ["GET", "HEAD"].includes(request.method))
    return undefined;
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > MAX_REQUEST_BYTES)
    throw Object.assign(new Error("Payload too large"), { statusCode: 413 });
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw Object.assign(new Error("Payload too large"), {
          statusCode: 413,
        });
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

function outgoingResponse(request, injected) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(injected.headers)) {
    if (value === undefined || HOP_HEADERS.has(name.toLowerCase())) continue;
    for (const item of Array.isArray(value) ? value : [value])
      headers.append(name, String(item));
  }
  const noBody =
    request.method === "HEAD" || [204, 205, 304].includes(injected.statusCode);
  return new Response(noBody ? null : injected.rawPayload, {
    status: injected.statusCode,
    headers,
  });
}

export function createCmsHandler({
  buildApp = appModule.buildApp,
  getEnvironment = runtimeEnvironment,
  distDir = path.resolve(process.cwd(), ".netlify/server-dist"),
  reportError = () =>
    console.error("Nexo CMS: serviço temporariamente indisponível."),
} = {}) {
  let application;
  let queue = Promise.resolve();

  function initialize(context) {
    if (!application) {
      application = Promise.resolve()
        .then(() => {
          const env = Object.fromEntries(
            ENVIRONMENT_KEYS.map((name) => [name, getEnvironment(name)]),
          );
          // Never create an ephemeral SQLite database when remote credentials are
          // absent. Preview contexts require a separate explicit opt-in below.
          if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN)
            throw new Error("Remote database configuration required");
          return buildApp({
            env: {
              ...env,
              NODE_ENV: "production",
              NETLIFY: "true",
              CONTEXT: context.deploy.context,
              CMS_STORAGE: "netlify-blobs",
              CMS_LOCAL_PREVIEW: "",
              CMS_TRUST_PROXY: "",
              DATA_DIR: "/tmp/nexo",
            },
            dataDir: "/tmp/nexo",
            distDir,
            logger: false,
          });
        })
        .catch((error) => {
          application = undefined;
          throw error;
        });
    }
    return application;
  }

  async function handle(request, context) {
    const url = new URL(request.url);
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return errorResponse(request, 400, "Endereço inválido.", "INVALID_URL");
    }
    if (/^\/blog\/template\.html\/?$/i.test(pathname))
      return errorResponse(request, 404, "Página não encontrada.", "NOT_FOUND");
    // Preview credentials must be provisioned explicitly for that deploy, with
    // a separate database. Without opt-in no app or media store is opened.
    const deployContext = context?.deploy?.context;
    if (
      deployContext !== "production" &&
      (!["deploy-preview", "branch-deploy"].includes(deployContext) ||
        getEnvironment("CMS_ALLOW_PREVIEW") !== "1")
    )
      return unavailable(request);
    if (!isIP(context.ip || "")) return unavailable(request);
    let app;
    try {
      const payload = await requestPayload(request);
      app = await initialize(context);
      const headers = {};
      for (const [name, value] of request.headers) {
        if (
          HOP_HEADERS.has(name) ||
          name === "content-length" ||
          name === "forwarded" ||
          name.startsWith("x-forwarded-") ||
          name === "x-real-ip" ||
          name === "x-nf-client-connection-ip"
        )
          continue;
        headers[name] = value;
      }
      headers.host = url.host;
      if (payload !== undefined)
        headers["content-length"] = String(payload.length);
      const result = await app.inject({
        method: request.method,
        url: `${url.pathname}${url.search}`,
        headers,
        remoteAddress: context.ip,
        ...(payload === undefined ? {} : { payload }),
      });
      return outgoingResponse(request, result);
    } catch (error) {
      if (error.statusCode === 413)
        return errorResponse(
          request,
          413,
          "O arquivo pode ter até 4 MB.",
          "PAYLOAD_TOO_LARGE",
        );
      reportError();
      return unavailable(request);
    } finally {
      // The same remote connection is reused. Complete queued mail/database
      // work before another request can enter or Netlify freezes the instance.
      if (app) await app.drainBackgroundJobs();
    }
  }

  return (request, context) => {
    const response = queue.then(() => handle(request, context));
    // A failed invocation must not poison the queue for subsequent requests.
    queue = response.catch(() => {});
    return response.catch(() => {
      reportError();
      return unavailable(request);
    });
  };
}

export default createCmsHandler();

export const config = {
  path: [
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
  ],
};
