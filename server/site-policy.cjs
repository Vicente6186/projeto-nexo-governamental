const { isDeepStrictEqual } = require("node:util");
const { validateContent } = require("./validation.cjs");

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

function validateEditableContent(published, requested) {
  const validated = validateContent(requested);
  const projected = editableDraft(published, validated);
  if (!isDeepStrictEqual(validated, projected)) {
    const error = new Error(
      "O painel permite editar apenas o processo seletivo e os canais de contato. Os textos institucionais e a estrutura do site são fixos.",
    );
    error.statusCode = 403;
    throw error;
  }
  return projected;
}

module.exports = { editableDraft, validateEditableContent };
