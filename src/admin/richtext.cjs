/** Only destinations that can be safely rendered as editorial links. */
function isSafeEditorialUrl(value) {
  const url = String(value || "").trim();
  if (!url || /[\u0000-\u0020\u007f\\]/.test(url)) return false;
  if (/^\/(?!\/)/.test(url) || /^#[^#]/.test(url)) return true;
  if (/^mailto:[^@\s]+@[^@\s]+$/i.test(url)) return true;
  try {
    const parsed = new URL(url);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      !!parsed.hostname &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

/** Detect constructs outside StarterKit before parsing; leave their source untouched. */
function unsupportedMarkdownReason(source, lexer) {
  if (!source) return "";
  if (/\[\^[^\]\n]+\]/.test(source)) return "notas de rodapé";
  let tokens;
  try {
    tokens = lexer(source);
  } catch {
    return "formatação que precisa ser revisada em Markdown";
  }
  if (tokens.links && Object.keys(tokens.links).length)
    return "links por referência";
  const supported = new Set([
    "space",
    "code",
    "heading",
    "hr",
    "blockquote",
    "list",
    "list_item",
    "paragraph",
    "text",
    "escape",
    "strong",
    "em",
    "codespan",
    "br",
    "del",
    "link",
    "def",
  ]);
  function visit(items) {
    for (const token of items || []) {
      if (token.type === "image") return "imagens no corpo do texto";
      if (token.type === "table") return "tabelas";
      if (token.type === "html") return "HTML";
      if (token.task) return "listas de tarefas";
      if (!supported.has(token.type)) return "formatação avançada";
      if (token.type === "link" && token.title)
        return "links com título adicional";
      if (token.type === "link" && !isSafeEditorialUrl(token.href))
        return "um endereço de link que precisa ser revisado";
      const nested = visit(token.tokens) || visit(token.items);
      if (nested) return nested;
    }
    return "";
  }
  return visit(tokens);
}
module.exports = { isSafeEditorialUrl, unsupportedMarkdownReason };
