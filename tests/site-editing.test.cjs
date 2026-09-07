const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_CONTENT } = require("../shared/content.cjs");
const {
  editableCopy,
  mergeDraft,
  validateSite,
} = require("../src/admin/site-editing.cjs");
test("recovering old edits cannot restore protected institution fields", () => {
  const old = structuredClone(DEFAULT_CONTENT);
  old.site.name = "Protected draft";
  old.sections[0].title = "Old layout";
  old.site.email = "team@example.org";
  const recovered = editableCopy(DEFAULT_CONTENT, old);
  assert.equal(recovered.site.email, old.site.email);
  assert.equal(recovered.site.name, DEFAULT_CONTENT.site.name);
  assert.deepEqual(recovered.sections, DEFAULT_CONTENT.sections);
});
test("concurrent edits merge independent fields and require explicit choice for conflicts", () => {
  const mine = structuredClone(DEFAULT_CONTENT),
    remote = structuredClone(DEFAULT_CONTENT);
  mine.site.email = "mine@example.org";
  mine.selection.edition = "2027.1";
  remote.site.email = "theirs@example.org";
  remote.selection.noticeUrl = "https://example.org/new.pdf";
  const merged = mergeDraft(DEFAULT_CONTENT, mine, remote);
  assert.equal(merged.conflicts.length, 1);
  assert.equal(merged.result.site.email, remote.site.email);
  assert.equal(merged.result.selection.edition, mine.selection.edition);
  assert.equal(merged.result.selection.noticeUrl, remote.selection.noticeUrl);
  assert.equal(
    mergeDraft(DEFAULT_CONTENT, mine, remote, { "site.email": "mine" }).result
      .site.email,
    mine.site.email,
  );
});
test("an unfinished stage can be saved but cannot be published", () => {
  const content = structuredClone(DEFAULT_CONTENT);
  content.selection.stages = [
    { id: "stage-1", title: "", date: "", description: "" },
  ];
  assert.deepEqual(validateSite(content), {});
  assert.ok(
    validateSite(content, { publishing: true })["selection.stages.0.title"],
  );
  content.site.instagramUrl = "https://example.org/other";
  assert.ok(validateSite(content)["site.instagramUrl"]);
});

test("legacy recovery requires explicit choices for every different field and rejects damaged field shapes", () => {
  const local = structuredClone(DEFAULT_CONTENT),
    remote = structuredClone(DEFAULT_CONTENT);
  local.site.email = "old@example.org";
  remote.selection.edition = "2027.2";
  const result = mergeDraft({}, local, remote);
  assert.deepEqual(
    result.conflicts.map((item) => item.path),
    ["site.email", "selection.edition"],
  );
  assert.equal(result.result.selection.edition, "2027.2");
  assert.throws(() =>
    editableCopy(DEFAULT_CONTENT, { site: { email: { invalid: true } } }),
  );
  assert.throws(() =>
    editableCopy(DEFAULT_CONTENT, {
      selection: { stages: [{ title: "broken" }] },
    }),
  );
});
