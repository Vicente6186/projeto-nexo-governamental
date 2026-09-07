const { DEFAULT_CONTENT } = require("../shared/content.cjs");

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

function fail(path, message) {
  throw new ValidationError(`${path}: ${message}`);
}
function object(value, keys, path) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(path, "objeto inválido.");
  const received = Object.keys(value);
  if (
    received.length !== keys.length ||
    received.some((key) => !keys.includes(key))
  )
    fail(path, "campos ausentes ou não reconhecidos.");
}
function string(value, path, max = 4000, required = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim()) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  ) {
    fail(path, `texto inválido (máximo de ${max} caracteres).`);
  }
}
function url(value, path, { image = false } = {}) {
  string(value, path, 2048);
  if (!value) return;
  if (value !== value.trim() || /[\s\\<>"'\u0000-\u001f]/.test(value))
    fail(path, "endereço inválido.");
  if (
    /^\/uploads\/[a-zA-Z0-9-]+\.(?:png|jpe?g|webp|avif|pdf)$/.test(value) &&
    (!image || !value.endsWith(".pdf"))
  )
    return;
  if (
    image &&
    /^\/?assets\//.test(value) &&
    !value.includes("..") &&
    !value.includes("%")
  )
    return;
  try {
    const parsed = new URL(value);
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      fail(path, "use um endereço HTTP ou HTTPS.");
  } catch {
    fail(path, "use um endereço HTTP ou HTTPS válido.");
  }
}
function id(value, path) {
  string(value, path, 80, true);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value))
    fail(path, "identificador inválido.");
}
function array(value, path, max) {
  if (!Array.isArray(value) || value.length > max)
    fail(path, `lista inválida (máximo de ${max} itens).`);
  if (new Set(value.map((item) => item?.id)).size !== value.length)
    fail(path, "identificadores duplicados.");
}
function date(value, path) {
  string(value, path, 10);
  if (!value) return;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) ||
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value
  )
    fail(path, "use uma data válida no formato AAAA-MM-DD.");
}

function validateContent(content, { publishing = false } = {}) {
  object(content, ["site", "sections", "selection"], "Conteúdo");
  object(
    content.site,
    [
      "name",
      "description",
      "email",
      "instagramUrl",
      "instagramHandle",
      "footerTitle",
    ],
    "Site",
  );
  for (const key of ["name", "instagramHandle", "footerTitle"])
    string(content.site[key], `Site.${key}`, 200, true);
  string(content.site.description, "Site.description", 1500);
  string(content.site.email, "Site.email", 254, true);
  if (
    !/^[^\s@?&<>"\\]+@[^\s@?&<>"\\]+\.[^\s@?&<>"\\]+$/.test(content.site.email)
  )
    fail("Site.email", "e-mail inválido.");
  url(content.site.instagramUrl, "Site.instagramUrl");
  array(content.sections, "Seções", 30);
  const expectedIds = DEFAULT_CONTENT.sections.map((section) => section.id);
  if (
    content.sections.length !== expectedIds.length ||
    content.sections.some((section) => !expectedIds.includes(section.id))
  )
    fail("Seções", "mantenha as seções originais do site.");
  for (const section of content.sections) {
    object(
      section,
      [
        "id",
        "label",
        "eyebrow",
        "title",
        "description",
        "visible",
        "items",
        "extra",
      ],
      "Seção",
    );
    id(section.id, "Seção.id");
    for (const key of ["label", "eyebrow", "title"])
      string(
        section[key],
        `${section.id}.${key}`,
        key === "title" ? 300 : 240,
        key === "title",
      );
    string(section.description, `${section.id}.description`, 8000);
    if (typeof section.visible !== "boolean")
      fail(`${section.id}.visible`, "visibilidade inválida.");
    array(section.items, `${section.id}.items`, 40);
    for (const item of section.items) {
      object(
        item,
        ["id", "title", "description", "detail", "image", "alt", "url"],
        `${section.id}.item`,
      );
      id(item.id, "Item.id");
      string(item.title, "Item.title", 240);
      string(item.description, "Item.description", 4000);
      string(item.detail, "Item.detail", 2000);
      string(item.alt, "Item.alt", 500);
      url(item.url, "Item.url");
      url(item.image, "Item.image", { image: true });
    }
    if (
      !section.extra ||
      typeof section.extra !== "object" ||
      Array.isArray(section.extra) ||
      Object.keys(section.extra).length > 40
    )
      fail(`${section.id}.extra`, "campos adicionais inválidos.");
    for (const [key, value] of Object.entries(section.extra)) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(key))
        fail(`${section.id}.extra`, "nome de campo inválido.");
      string(value, `${section.id}.${key}`, 4000);
      if (/(?:url|image|src)$/i.test(key))
        url(value, `${section.id}.${key}`, {
          image: /(?:image|src)$/i.test(key),
        });
    }
  }
  const selection = content.selection;
  object(
    selection,
    [
      "status",
      "edition",
      "title",
      "description",
      "opensAt",
      "closesAt",
      "noticeUrl",
      "applicationUrl",
      "buttonLabel",
      "scheduleTitle",
      "scheduleImage",
      "stages",
    ],
    "Processo seletivo",
  );
  if (!["closed", "upcoming", "open"].includes(selection.status))
    fail("Processo seletivo.status", "situação inválida.");
  for (const key of ["edition", "title", "buttonLabel", "scheduleTitle"])
    string(
      selection[key],
      `Processo seletivo.${key}`,
      key === "title" ? 300 : 240,
      key === "title",
    );
  string(selection.description, "Processo seletivo.description", 8000);
  date(selection.opensAt, "Processo seletivo.opensAt");
  date(selection.closesAt, "Processo seletivo.closesAt");
  if (
    selection.opensAt &&
    selection.closesAt &&
    selection.opensAt > selection.closesAt
  )
    fail(
      "Processo seletivo",
      "o encerramento deve ser igual ou posterior à abertura.",
    );
  url(selection.noticeUrl, "Processo seletivo.noticeUrl");
  url(selection.applicationUrl, "Processo seletivo.applicationUrl");
  url(selection.scheduleImage, "Processo seletivo.scheduleImage", {
    image: true,
  });
  array(selection.stages, "Processo seletivo.stages", 30);
  for (const stage of selection.stages) {
    object(stage, ["id", "title", "date", "description"], "Etapa");
    id(stage.id, "Etapa.id");
    string(stage.title, "Etapa.title", 240, true);
    date(stage.date, "Etapa.date");
    string(stage.description, "Etapa.description", 2000);
  }
  if (publishing && selection.status === "open") {
    if (!selection.applicationUrl || !selection.buttonLabel.trim())
      fail(
        "Processo seletivo",
        "informe o link e o texto do botão de inscrição para abrir as inscrições.",
      );
  }
  return content;
}

module.exports = { validateContent, ValidationError };
