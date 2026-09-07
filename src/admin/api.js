let csrfToken = "";
export function setCsrf(value) {
  csrfToken = value || "";
}
export async function api(path, { method = "GET", body, form } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const response = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    body: form || (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const data = await response
    .json()
    .catch(() => ({ message: "O servidor não retornou uma resposta válida." }));
  if (!response.ok) {
    const error = new Error(
      data.message ||
        data.error ||
        "Não foi possível concluir. Tente novamente.",
    );
    error.status = response.status;
    throw error;
  }
  if (data.csrfToken) setCsrf(data.csrfToken);
  return data;
}
