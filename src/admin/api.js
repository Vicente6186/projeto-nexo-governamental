let csrfToken = "";
let sessionUserId = null;
export function setCsrf(value) {
  csrfToken = value || "";
  if (!csrfToken) sessionUserId = null;
}

function sessionExpired() {
  const error = new Error(
    "Entre novamente para continuar. Sua edição está preservada.",
  );
  error.status = 401;
  error.code = "SESSION_EXPIRED";
  return error;
}
async function readResponse(response, signal) {
  let data;
  try {
    data = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
  } catch (cause) {
    if (signal?.aborted) throw cause;
    const error = new Error(
      "O servidor não retornou uma resposta válida. Sua edição está preservada; confira o estado antes de tentar novamente.",
    );
    error.status = response.status >= 400 ? response.status : 502;
    error.code = "INVALID_RESPONSE";
    throw error;
  }
  return data;
}
function responseError(response, data) {
  const error = new Error(
    data.message || data.error || "Não foi possível concluir. Tente novamente.",
  );
  error.status = response.status;
  error.code = data.code;
  error.field = data.field;
  error.currentVersion = data.currentVersion;
  error.retryAfter =
    Number(response.headers.get("retry-after")) || Number(data.retryAfter) || 0;
  return error;
}
export async function api(
  path,
  { method = "GET", body, form, signal, timeout = 30000 } = {},
) {
  const requestUserId = sessionUserId;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort("timeout"), timeout);
  const perform = () => {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;
    return fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      body: form || (body !== undefined ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });
  };
  try {
    let response = await perform();
    let data = await readResponse(response, controller.signal);
    if (response.status === 403 && data.code === "CSRF_EXPIRED") {
      // This rejection happens before mutation. Another tab may have renewed the
      // shared cookie, so refresh its token and retry this rejected request once.
      // The account must still match the one that started the mutation, including
      // when a parallel login/session response has changed this module's state.
      const refreshed = await fetch("/api/session", {
        credentials: "same-origin",
        signal: controller.signal,
      });
      const session = await readResponse(refreshed, controller.signal);
      if (!refreshed.ok) throw responseError(refreshed, session);
      if (
        !session.authenticated ||
        typeof session.csrfToken !== "string" ||
        !session.csrfToken ||
        !requestUserId ||
        sessionUserId !== requestUserId ||
        session.user?.id !== requestUserId
      )
        throw sessionExpired();
      setCsrf(session.csrfToken);
      response = await perform();
      data = await readResponse(response, controller.signal);
      if (response.status === 403 && data.code === "CSRF_EXPIRED")
        throw sessionExpired();
    }
    if (!response.ok) throw responseError(response, data);
    if (data.authenticated === false) setCsrf("");
    if (data.authenticated === true && typeof data.user?.id === "string")
      sessionUserId = data.user.id;
    if (data.csrfToken) setCsrf(data.csrfToken);
    return data;
  } catch (cause) {
    if (cause.status) throw cause;
    const cancelled = signal?.aborted;
    const error = new Error(
      cancelled
        ? "Envio cancelado."
        : controller.signal.aborted
          ? "A resposta demorou mais que o esperado. Sua edição foi preservada. Confira o estado antes de tentar novamente."
          : "Não foi possível conectar. Sua edição foi preservada; verifique a conexão e tente novamente.",
    );
    error.code = cancelled
      ? "CANCELLED"
      : controller.signal.aborted
        ? "TIMEOUT"
        : "NETWORK_ERROR";
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
