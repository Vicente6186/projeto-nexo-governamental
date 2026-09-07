const { args, loadEnv } = require("./cli.cjs");
const { createBackup } = require("../server/backup.cjs");
async function main() {
  loadEnv();
  const flags = args(process.argv.slice(2), [
    "--data-dir",
    "--output-root",
    "--keep",
  ]);
  const result = await createBackup({
    dataDir: flags["--data-dir"] || process.env.DATA_DIR || "./data",
    outputRoot:
      flags["--output-root"] || process.env.CMS_BACKUP_DIR || undefined,
    keep: flags["--keep"] || process.env.CMS_BACKUP_KEEP || 14,
  });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
