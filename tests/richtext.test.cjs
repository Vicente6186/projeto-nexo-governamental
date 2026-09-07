const test = require("node:test");
const assert = require("node:assert/strict");
const { MarkdownManager } = require("@tiptap/markdown");
const StarterKit = require("@tiptap/starter-kit").default;
const {
  isSafeEditorialUrl,
  unsupportedMarkdownReason,
} = require("../src/admin/richtext.cjs");

const manager = new MarkdownManager({
  extensions: [StarterKit.configure({ underline: false })],
  markedOptions: { gfm: true, breaks: false },
});
const unsupported = (source) =>
  unsupportedMarkdownReason(source, (text) => manager.instance.lexer(text));

test("visual editor preserves supported editorial content through Markdown round trips", () => {
  const source =
    "## Subtítulo\n\nTexto **forte**, *leve* e [USP](https://www.usp.br).\n\n- Primeiro\n- Segundo\n\n> Uma citação.\n\n1. Preparação\n2. Encontro";
  const document = manager.parse(source);
  assert.equal(unsupported(source), "");
  const saved = manager.serialize(document);
  assert.deepEqual(manager.parse(saved), document);
  assert.equal(saved, source);
});

test("nested formatting, code and explicit line breaks survive serialization", () => {
  const source =
    "### Contexto\n\n**Texto com *ênfase* e [fonte](https://usp.br)**.\n\n- Primeiro\n  - Subitem\n\nUma linha  \noutra linha\n\n```js\nconst item = 1;\n```\n\n---";
  const document = manager.parse(source);
  assert.equal(unsupported(source), "");
  assert.deepEqual(manager.parse(manager.serialize(document)), document);
});

test("unsupported structures are routed to source editing before conversion", () => {
  const samples = [
    ["![Descrição](https://usp.br/foto.jpg)", "imagens"],
    ["Uma **imagem ![alt](https://usp.br/foto.jpg)** no texto.", "imagens"],
    ["Coluna | Outra\n--- | ---\nA | B", "tabelas"],
    ["- [ ] Uma tarefa", "tarefas"],
    ["<!-- anotação editorial -->\n\nTexto", "HTML"],
    ["Texto[^a]\n\n[^a]: Nota original", "rodapé"],
    ["[USP][fonte]\n\n[fonte]: https://usp.br", "referência"],
    ['[USP](https://usp.br "Título do link")', "título"],
  ];
  for (const [source, reason] of samples)
    assert.ok(unsupported(source).includes(reason), source);
});

test("link editing accepts institutional web links, local paths and mailto", () => {
  for (const url of [
    "https://usp.br",
    "http://www.usp.br/pagina?q=1#topo",
    "/blog/artigo",
    "#inscricoes",
    "mailto:nexo@usp.br",
  ])
    assert.equal(isSafeEditorialUrl(url), true, url);
});

test("unsafe and ambiguous URLs cannot be inserted into the visual document", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,teste",
    "//exemplo.com",
    "https://user:password@usp.br",
    "https:\\evil.com",
    "https://usp.br/\nmalformed",
    "ftp://example.com",
    "",
  ])
    assert.equal(isSafeEditorialUrl(url), false, url);
  assert.match(unsupported("[Leia](javascript:alert(1))"), /endereço/);
});

test("parser errors preserve source editing rather than silently normalizing content", () => {
  assert.match(
    unsupportedMarkdownReason("Texto original", () => {
      throw new Error("parse");
    }),
    /Markdown/,
  );
});
