const { isDeepStrictEqual } = require("node:util");
const { validateContent, ValidationError } = require("./validation.cjs");

const EDITABLE_FIELDS = Object.freeze({
  site: Object.freeze(["email", "instagramUrl", "instagramHandle"]),
  selection: Object.freeze([
    "edition",
    "status",
    "opensAt",
    "closesAt",
    "noticeUrl",
    "applicationUrl",
    "stages",
  ]),
});

function editableDraft(published, draft) {
  // Keep the institution's existing published content as the fixed baseline.
  // Older drafts can contain fields that the simplified panel no longer edits.
  const content = structuredClone(published);
  for (const [group, fields] of Object.entries(EDITABLE_FIELDS)) {
    for (const field of fields) {
      if (draft?.[group] && Object.hasOwn(draft[group], field))
        content[group][field] = structuredClone(draft[group][field]);
    }
  }
  return content;
}

function validateContact(site, { publishing = false } = {}) {
  const handle = site.instagramHandle.replace(/^@/, "");
  if (handle && !/^[A-Za-z0-9._]{1,30}$/.test(handle))
    throw new ValidationError(
      "Informe apenas o nome do perfil do Instagram, sem espaços.",
      "site.instagramHandle",
    );
  if (!site.instagramUrl) {
    if (publishing && handle)
      throw new ValidationError(
        "Informe o endereço do perfil do Instagram.",
        "site.instagramUrl",
        "FIELD_REQUIRED",
      );
    return;
  }
  let parsed;
  try {
    parsed = new URL(site.instagramUrl);
  } catch {
    throw new ValidationError(
      "Informe um endereço válido do Instagram.",
      "site.instagramUrl",
    );
  }
  const match = parsed.pathname.match(/^\/([A-Za-z0-9._]{1,30})\/?$/);
  if (
    !["instagram.com", "www.instagram.com"].includes(parsed.hostname) ||
    parsed.protocol !== "https:" ||
    parsed.port ||
    !match ||
    parsed.search ||
    parsed.hash
  )
    throw new ValidationError(
      "Use o endereço HTTPS do perfil, como https://www.instagram.com/nexogovernamental/.",
      "site.instagramUrl",
    );
  if (handle && match[1].toLowerCase() !== handle.toLowerCase())
    throw new ValidationError(
      "O endereço do Instagram deve corresponder ao nome de usuário informado.",
      "site.instagramUrl",
    );
}

function validateEditableContent(published, requested, options = {}) {
  const validated = validateContent(requested, options);
  validateContact(validated.site, options);
  const projected = editableDraft(published, validated);
  if (!isDeepStrictEqual(validated, projected)) {
    const error = new Error(
      "O painel permite editar apenas o processo seletivo e os canais de contato. Os textos institucionais e a estrutura do site são fixos.",
    );
    error.statusCode = 403;
    error.code = "FORBIDDEN";
    throw error;
  }
  return projected;
}

module.exports = { editableDraft, validateEditableContent, validateContact };
