const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const { DatabaseSync } = require("node:sqlite");
const { DEFAULT_CONTENT } = require("../shared/content.cjs");
const { editableDraft } = require("../server/site-policy.cjs");
const { validateContent } = require("../server/validation.cjs");
const { createBackup } = require("../server/backup.cjs");
const { args, loadEnv } = require("./cli.cjs");

function differences(before, after, prefix = "") {
  if (isDeepStrictEqual(before, after)) return [];
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  )
    return [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ].flatMap((key) =>
      differences(before[key], after[key], prefix ? `${prefix}.${key}` : key),
    );
  return [prefix];
}
function planUpdate(row, template = DEFAULT_CONTENT) {
  const published = JSON.parse(row.published);
  const draft = JSON.parse(row.draft);
  const nextPublished = editableDraft(template, published);
  const nextDraft = editableDraft(template, draft);
  // Retiring the historical schedule is an editorial state, not a design change.
  if (!published.selection.scheduleImage)
    nextPublished.selection.scheduleImage = nextDraft.selection.scheduleImage =
      "";
  validateContent(nextPublished);
  validateContent(nextDraft);
  return {
    version: row.version,
    published: nextPublished,
    draft: nextDraft,
    changes: {
      published: differences(published, nextPublished),
      draft: differences(draft, nextDraft),
    },
  };
}
async function updateInstitutional({
  dataDir,
  outputRoot,
  apply = false,
  template = DEFAULT_CONTENT,
}) {
  const filename = path.join(path.resolve(dataDir), "nexo.sqlite");
  if (!fs.existsSync(filename))
    throw new Error("Banco nexo.sqlite não encontrado.");
  const read = new DatabaseSync(filename, { readOnly: true });
  let plan;
  try {
    plan = planUpdate(
      read.prepare("SELECT * FROM content WHERE id = 1").get(),
      template,
    );
  } finally {
    read.close();
  }
  const summary = {
    applied: false,
    version: plan.version,
    changes: plan.changes,
    note: "Os contatos, o processo seletivo, os rascunhos operacionais e todos os artigos são preservados. Alterar campos fixos exige revisar este relatório e executar --apply.",
  };
  if (!apply || (!plan.changes.published.length && !plan.changes.draft.length))
    return summary;
  const saved = await createBackup({ dataDir, outputRoot });
  const db = new DatabaseSync(filename);
  try {
    db.exec("PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE");
    const current = db.prepare("SELECT * FROM content WHERE id = 1").get();
    if (current.version !== plan.version)
      throw new Error(
        "O conteúdo mudou durante o backup. Nenhuma alteração foi aplicada; execute novamente para revisar a nova versão.",
      );
    const timestamp = new Date().toISOString();
    const nextVersion = plan.version + 1;
    const publishedChanged = plan.changes.published.length > 0;
    db.prepare(
      "UPDATE content SET published = ?, draft = ?, version = ?, published_version = ?, updated_at = ?, published_at = ? WHERE id = 1",
    ).run(
      JSON.stringify(plan.published),
      JSON.stringify(plan.draft),
      nextVersion,
      publishedChanged ? nextVersion : current.published_version,
      timestamp,
      publishedChanged ? timestamp : current.published_at,
    );
    db.prepare("INSERT INTO history VALUES (?, ?, ?, ?, ?)").run(
      randomUUID(),
      "institutional.updated",
      timestamp,
      "Conteúdo institucional atualizado a partir do código; dados operacionais preservados",
      JSON.stringify(plan.published),
    );
    db.exec("COMMIT");
    return {
      ...summary,
      applied: true,
      version: nextVersion,
      backup: saved.directory,
    };
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    db.close();
  }
}
if (require.main === module) {
  (async () => {
    loadEnv();
    const flags = args(
      process.argv.slice(2),
      ["--data-dir", "--output-root"],
      ["--apply"],
    );
    console.log(
      JSON.stringify(
        await updateInstitutional({
          dataDir: flags["--data-dir"] || process.env.DATA_DIR || "./data",
          outputRoot:
            flags["--output-root"] || process.env.CMS_BACKUP_DIR || undefined,
          apply: !!flags["--apply"],
        }),
        null,
        2,
      ),
    );
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { updateInstitutional, planUpdate };
