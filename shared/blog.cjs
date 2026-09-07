const MarkdownIt = require("markdown-it");

const CATEGORIES = [
  "Institucional",
  "Políticas públicas",
  "Direito e sociedade",
  "Pesquisa e extensão",
  "Vida no Nexo",
];
const POST_KEYS = [
  "title",
  "slug",
  "excerpt",
  "category",
  "author",
  "authorRole",
  "coverImage",
  "coverAlt",
  "coverCredit",
  "body",
  "tags",
  "featured",
];

function emptyPost() {
  return {
    title: "",
    slug: "",
    excerpt: "",
    category: CATEGORIES[0],
    author: "Nexo Governamental",
    authorRole: "",
    coverImage: "",
    coverAlt: "",
    coverCredit: "",
    body: "",
    tags: [],
    featured: false,
  };
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
}

function readingMinutes(body) {
  const words =
    String(body || "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .match(/[\p{L}\p{N}]+/gu) || [];
  return Math.max(1, Math.ceil(words.length / 220));
}

function safeLink(value, image = false) {
  if (typeof value !== "string" || /[\u0000-\u0020\u007f\\<>"']/.test(value))
    return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  if (!image && value.startsWith("#")) return true;
  try {
    const url = new URL(value);
    return (
      (image ? ["https:", "http:"] : ["https:", "http:", "mailto:"]).includes(
        url.protocol,
      ) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function markdown(rejectUnsafe = false) {
  const md = new MarkdownIt({
    html: false,
    linkify: false,
    typographer: true,
    breaks: false,
  });
  md.validateLink = (url) => {
    const valid = safeLink(url);
    if (!valid && rejectUnsafe)
      fail(
        "Texto",
        "um link não é permitido. Use HTTPS, HTTP, e-mail ou um caminho iniciado por /.",
      );
    return valid;
  };
  const originalLink =
    md.renderer.rules.link_open ||
    ((tokens, index, options, env, self) =>
      self.renderToken(tokens, index, options));
  md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const href = tokens[index].attrGet("href") || "";
    if (/^https?:\/\//i.test(href)) {
      tokens[index].attrSet("rel", "noopener noreferrer");
      tokens[index].attrSet("target", "_blank");
    }
    return originalLink(tokens, index, options, env, self);
  };
  const originalImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, index, options, env, self) => {
    if (!safeLink(tokens[index].attrGet("src") || "", true)) return "";
    tokens[index].attrSet("loading", "lazy");
    tokens[index].attrSet("decoding", "async");
    return originalImage(tokens, index, options, env, self);
  };
  return md;
}
const renderer = markdown();
function renderMarkdown(body) {
  return renderer.render(typeof body === "string" ? body : "");
}

function fail(label, message) {
  const error = new Error(`${label}: ${message}`);
  error.statusCode = 400;
  throw error;
}
function text(value, label, max, required = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    fail(label, `use um texto de até ${max} caracteres.`);
  if (required && !value.trim())
    fail(label, "preencha este campo antes de publicar.");
  return value.trim();
}

function validatePost(value, { publishing = false } = {}) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== POST_KEYS.length ||
    Object.keys(value).some((key) => !POST_KEYS.includes(key))
  )
    fail("Artigo", "campos ausentes ou não reconhecidos.");
  const post = {
    title: text(value.title, "Título", 180, publishing),
    slug: text(value.slug, "Endereço", 120, publishing),
    excerpt: text(value.excerpt, "Resumo", 360, publishing),
    category: text(value.category, "Categoria", 80, true),
    author: text(value.author, "Autoria", 160, publishing),
    authorRole: text(value.authorRole, "Descrição da autoria", 180),
    coverImage: text(value.coverImage, "Imagem de capa", 2048),
    coverAlt: text(
      value.coverAlt,
      "Descrição da imagem",
      300,
      publishing && Boolean(value.coverImage),
    ),
    coverCredit: text(value.coverCredit, "Crédito da imagem", 240),
    body: text(value.body, "Texto", 100000, publishing),
    tags: [],
    featured: value.featured,
  };
  if (
    post.slug &&
    (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug) ||
      ["preview", "admin", "api"].includes(post.slug))
  )
    fail(
      "Endereço",
      "use letras minúsculas, números e hífens; este endereço pode estar reservado.",
    );
  if (!CATEGORIES.includes(post.category))
    fail("Categoria", "escolha uma das categorias disponíveis.");
  if (typeof post.featured !== "boolean") fail("Destaque", "valor inválido.");
  if (!Array.isArray(value.tags) || value.tags.length > 8)
    fail("Palavras-chave", "use até 8 palavras-chave.");
  post.tags = value.tags.map((tag) => text(tag, "Palavra-chave", 40, true));
  if (
    new Set(post.tags.map((tag) => tag.toLocaleLowerCase("pt-BR"))).size !==
    post.tags.length
  )
    fail("Palavras-chave", "remova os termos repetidos.");
  if (post.coverImage) {
    const local =
      /^\/(?:uploads|assets)\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp|avif)$/i.test(
        post.coverImage,
      ) && !post.coverImage.includes("..");
    if (
      (!local && !/^https?:\/\//i.test(post.coverImage)) ||
      !safeLink(post.coverImage, true)
    )
      fail(
        "Imagem de capa",
        "use uma imagem da biblioteca ou um endereço HTTP/HTTPS válido.",
      );
  }
  // The parser resolves escapes and entities before validation, including reference links.
  markdown(true).parse(post.body, {});
  return post;
}

function previewPosts() {
  return [
    {
      ...emptyPost(),
      title: "Conheça o Nexo Governamental",
      slug: "conheca-o-nexo-governamental",
      excerpt:
        "Universidade, poder público e sociedade civil: os pontos de encontro que orientam o Nexo Governamental.",
      coverImage: "/assets/introduction/usp.webp",
      coverAlt: "Faculdade de Direito da USP no Largo de São Francisco",
      featured: true,
      tags: ["Extensão", "Universidade"],
      body: "> **Rascunho de exemplo.** Este texto foi preparado para demonstrar o blog na prévia local. Revise as informações e a autoria antes de publicar.\n\n## Uma ponte com a sociedade\n\nO Nexo Governamental XI de Agosto é uma organização estudantil da Faculdade de Direito da USP. Sua proposta aproxima a comunidade acadêmica do setor público e da sociedade civil.\n\nO diálogo com os Três Poderes e a participação no debate público fazem parte dessa missão.\n\n## Um espaço para compartilhar conhecimento\n\nEste blog poderá reunir reflexões, registros de atividades e textos produzidos pela equipe. A ideia é tornar o conhecimento acessível e convidar o leitor a acompanhar as discussões do Nexo.\n\n## Antes de publicar\n\n- Confira a precisão das informações.\n- Identifique os autores e as fontes utilizadas.\n- Revise os créditos e a autorização de uso das imagens.\n- Substitua este exemplo pelo texto aprovado pela equipe.",
    },
    {
      ...emptyPost(),
      title: "Universidade e participação no debate público",
      slug: "universidade-e-participacao-no-debate-publico",
      excerpt:
        "Um ponto de partida para textos sobre a aproximação entre formação acadêmica, instituições e vida em sociedade.",
      category: "Direito e sociedade",
      tags: ["Debate público", "Formação"],
      body: "> **Rascunho de exemplo.** Conteúdo demonstrativo para revisão da equipe; não representa uma publicação institucional aprovada.\n\n## Conhecimento em diálogo\n\nA formação universitária também se constrói no encontro entre perspectivas. Ouvir a sociedade, compreender o funcionamento das instituições e examinar argumentos são caminhos para qualificar o debate público.\n\n## Perguntas que abrem a conversa\n\nQue temas aproximam a universidade da vida cotidiana? Como apresentar questões complexas com clareza? Quais fontes ajudam o leitor a aprofundar uma reflexão?\n\nEssas perguntas podem orientar os próximos textos deste espaço. A equipe poderá substituir este rascunho por uma análise assinada, acompanhada de referências e revisão editorial.",
    },
    {
      ...emptyPost(),
      title: "Pesquisa e extensão: ideias para compartilhar",
      slug: "pesquisa-e-extensao-ideias-para-compartilhar",
      excerpt:
        "Como transformar perguntas, leituras e experiências da extensão em textos abertos à comunidade.",
      category: "Pesquisa e extensão",
      tags: ["Pesquisa", "Extensão"],
      body: "> **Rascunho de exemplo.** Texto ilustrativo da prévia local. Substitua por conteúdo revisado e aprovado antes da publicação.\n\n## Da pergunta ao texto\n\nUm artigo pode começar com uma pergunta relevante para a comunidade. Organizar o contexto, apresentar as fontes e explicar os limites da análise ajuda o leitor a acompanhar o raciocínio.\n\n## Uma estrutura para começar\n\n1. Apresente a questão e por que ela merece atenção.\n2. Desenvolva os argumentos com fontes identificadas.\n3. Explique o que a reflexão permite concluir e quais perguntas permanecem.\n\n## Construção coletiva\n\nA edição pode ser uma oportunidade de diálogo entre os integrantes da equipe. Clareza, cuidado com as informações e respeito às diferentes perspectivas ajudam a tornar o blog um espaço de troca.",
    },
  ];
}

module.exports = {
  CATEGORIES,
  emptyPost,
  slugify,
  readingMinutes,
  renderMarkdown,
  validatePost,
  previewPosts,
};
