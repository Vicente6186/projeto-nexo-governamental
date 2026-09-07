const { args, loadEnv } = require("./cli.cjs");
const { restoreBackup } = require("../server/backup.cjs");
try {
  loadEnv();
  const flags = args(
    process.argv.slice(2),
    ["--backup", "--destination"],
    ["--apply"],
  );
  if (!flags["--backup"])
    throw new Error(
      "Informe --backup com o diretório do backup. Sem --apply, o comando apenas verifica os arquivos.",
    );
  console.log(
    JSON.stringify(
      restoreBackup({
        backupDir: flags["--backup"],
        destination: flags["--destination"],
        apply: !!flags["--apply"],
      }),
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
