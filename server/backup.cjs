const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync, backup } = require("node:sqlite");

const FORMAT = "nexo-backup/v1";
const BACKUP_NAME =
  /^nexo-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9-]{36}$/;
const DATA_FOLDERS = ["uploads", "originals"];
const sha256 = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
function fail(message) {
  throw new Error(message);
}
function integer(value, fallback, min, max, label) {
  const n = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max)
    fail(`${label} deve ser um inteiro entre ${min} e ${max}.`);
  return n;
}
function physicalPath(filename) {
  const missing = [];
  let parent = path.resolve(filename);
  while (!fs.existsSync(parent)) {
    missing.unshift(path.basename(parent));
    const next = path.dirname(parent);
    if (next === parent) break;
    parent = next;
  }
  return path.join(fs.realpathSync(parent), ...missing);
}
function inside(root, relative) {
  if (
    typeof relative !== "string" ||
    !relative ||
    relative.includes("\\") ||
    path.isAbsolute(relative) ||
    relative.split("/").some((part) => !part || part === "." || part === "..")
  )
    fail("O backup contém um caminho inválido.");
  const result = path.resolve(root, relative);
  if (!result.startsWith(`${path.resolve(root)}${path.sep}`))
    fail("Caminho fora do backup.");
  let current = path.resolve(root);
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
      fail("Links simbólicos não são aceitos no backup.");
  }
  return result;
}
function filesUnder(root, relative = "") {
  const folder = relative ? inside(root, relative) : root;
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink())
      fail("Remova links simbólicos do diretório de dados antes do backup.");
    if (entry.isDirectory()) return filesUnder(root, name);
    if (!entry.isFile())
      fail("O diretório de dados contém um arquivo não regular.");
    return [name];
  });
}
function describeFile(root, name) {
  const bytes = fs.readFileSync(inside(root, name));
  return { path: name, size: bytes.length, sha256: sha256(bytes) };
}
function checkDatabase(filename, fileNames) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    const result = db.prepare("PRAGMA quick_check").all();
    if (result.length !== 1 || Object.values(result[0])[0] !== "ok")
      fail("A integridade do banco de dados não passou na verificação.");
    if (
      !db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'content'",
        )
        .get()
    )
      fail("O arquivo não é um banco de dados do Nexo.");
    if (!db.prepare("SELECT id FROM content WHERE id = 1").get())
      fail("O banco não contém o conteúdo institucional.");
    if (
      fileNames &&
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'assets'",
        )
        .get()
    ) {
      const hasOriginal = db
        .prepare("PRAGMA table_info(assets)")
        .all()
        .some((column) => column.name === "original_path");
      const assets = db
        .prepare(
          hasOriginal
            ? "SELECT url, original_path FROM assets"
            : "SELECT url FROM assets",
        )
        .all();
      for (const { url, original_path: original } of assets) {
        if (!/^\/uploads\/[^/\\]+$/.test(url) || !fileNames.has(url.slice(1)))
          fail(
            "Um arquivo de mídia registrado no banco está ausente do backup.",
          );
        if (
          original &&
          (!/^originals\/[^/\\]+$/.test(original) || !fileNames.has(original))
        )
          fail(
            "Um arquivo original registrado no banco está ausente do backup.",
          );
      }
    }
    return {
      version: db.prepare("SELECT version FROM content WHERE id = 1").get()
        .version,
    };
  } finally {
    db.close();
  }
}
function verifyBackup(backupDir) {
  const root = path.resolve(backupDir);
  if (fs.lstatSync(root).isSymbolicLink())
    fail("O diretório do backup não pode ser um link simbólico.");
  const manifest = JSON.parse(
    fs.readFileSync(inside(root, "manifest.json"), "utf8"),
  );
  if (
    manifest.format !== FORMAT ||
    !Array.isArray(manifest.files) ||
    !Number.isFinite(Date.parse(manifest.createdAt))
  )
    fail("Manifesto de backup inválido.");
  const names = new Set();
  for (const file of manifest.files) {
    if (
      file.path !== "nexo.sqlite" &&
      !DATA_FOLDERS.some((folder) => file.path?.startsWith(`${folder}/`))
    )
      fail("O manifesto contém um arquivo não permitido.");
    if (
      names.has(file.path) ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    )
      fail("Manifesto de arquivos inválido.");
    names.add(file.path);
    const actual = describeFile(root, file.path);
    if (actual.size !== file.size || actual.sha256 !== file.sha256)
      fail(`A verificação do arquivo ${file.path} falhou.`);
  }
  if (!names.has("nexo.sqlite")) fail("O backup não inclui o banco de dados.");
  checkDatabase(inside(root, "nexo.sqlite"), names);
  return manifest;
}
function pruneBackups(root, keep, currentDirectory) {
  const own = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && BACKUP_NAME.test(entry.name))
    .filter((entry) => {
      try {
        const manifest = JSON.parse(
          fs.readFileSync(
            inside(path.join(root, entry.name), "manifest.json"),
            "utf8",
          ),
        );
        return manifest.format === FORMAT && manifest.directory === entry.name;
      } catch {
        return false;
      }
    })
    .map((entry) => entry.name)
    .sort()
    .reverse();
  // The completed copy must survive retention even after a clock correction.
  const expired = own
    .filter((name) => name !== currentDirectory)
    .slice(keep - 1);
  for (const name of expired)
    fs.rmSync(path.join(root, name), { recursive: true });
  return expired.length;
}
async function createBackup({
  dataDir,
  outputRoot,
  keep = 14,
  now = new Date(),
}) {
  const source = path.resolve(dataDir);
  const root = path.resolve(outputRoot || path.join(source, "backups"));
  keep = integer(keep, 14, 1, 3650, "Retenção");
  const sourceDatabase = path.join(source, "nexo.sqlite");
  if (!fs.existsSync(sourceDatabase))
    fail("Banco nexo.sqlite não encontrado. Nenhum backup foi criado.");
  if (
    fs.lstatSync(source).isSymbolicLink() ||
    fs.lstatSync(sourceDatabase).isSymbolicLink()
  )
    fail("O diretório de dados e o banco não podem ser links simbólicos.");
  const physicalRoot = physicalPath(root);
  for (const folder of DATA_FOLDERS) {
    const fileRoot = physicalPath(path.join(source, folder));
    if (
      physicalRoot === fileRoot ||
      physicalRoot.startsWith(`${fileRoot}${path.sep}`)
    )
      fail("O destino do backup não pode ficar dentro das pastas de mídia.");
  }
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(root).isSymbolicLink())
    fail("O destino do backup não pode ser um link simbólico.");
  const lockFile = path.join(root, ".nexo-backup.lock");
  let lock;
  try {
    lock = fs.openSync(lockFile, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST")
      fail(
        "Já existe um backup em andamento neste destino. Confira o processo antes de remover .nexo-backup.lock.",
      );
    throw error;
  }
  let temp;
  let db;
  try {
    const createdAt = now.toISOString();
    const directory = `nexo-backup-${createdAt.replaceAll(":", "-").replace(".", "-")}-${crypto.randomUUID()}`;
    temp = fs.mkdtempSync(path.join(root, ".nexo-backup-"));
    fs.chmodSync(temp, 0o700);
    fs.writeFileSync(lock, `${process.pid}\n`, { encoding: "utf8" });
    db = new DatabaseSync(sourceDatabase, { readOnly: true });
    await backup(db, path.join(temp, "nexo.sqlite"));
    db.close();
    db = null;
    fs.chmodSync(path.join(temp, "nexo.sqlite"), 0o600);
    const names = ["nexo.sqlite"];
    for (const folder of DATA_FOLDERS) {
      for (const name of filesUnder(source, folder)) {
        const destination = inside(temp, name);
        fs.mkdirSync(path.dirname(destination), {
          recursive: true,
          mode: 0o700,
        });
        // Immutable upload names let a database snapshot safely precede file copies.
        const before = fs.statSync(inside(source, name));
        fs.copyFileSync(
          inside(source, name),
          destination,
          fs.constants.COPYFILE_EXCL,
        );
        const after = fs.statSync(inside(source, name));
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
          fail("Um arquivo mudou durante o backup; tente novamente.");
        fs.chmodSync(destination, 0o600);
        names.push(name);
      }
    }
    const manifest = {
      format: FORMAT,
      directory,
      createdAt,
      files: names.sort().map((name) => describeFile(temp, name)),
    };
    fs.writeFileSync(
      path.join(temp, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { mode: 0o600 },
    );
    verifyBackup(temp);
    const destination = path.join(root, directory);
    fs.renameSync(temp, destination);
    const removed = pruneBackups(root, keep, directory);
    return {
      directory: destination,
      createdAt: manifest.createdAt,
      files: manifest.files.length,
      bytes: manifest.files.reduce((sum, file) => sum + file.size, 0),
      removed,
    };
  } finally {
    // Each cleanup must run even if another resource cannot be released.
    try {
      db?.close();
    } finally {
      try {
        if (temp && fs.existsSync(temp)) fs.rmSync(temp, { recursive: true });
      } finally {
        try {
          fs.closeSync(lock);
        } finally {
          fs.unlinkSync(lockFile);
        }
      }
    }
  }
}
function restoreBackup({ backupDir, destination, apply = false }) {
  const source = path.resolve(backupDir);
  const manifest = verifyBackup(source);
  if (!apply)
    return {
      verified: true,
      applied: false,
      files: manifest.files.length,
      createdAt: manifest.createdAt,
    };
  if (!destination)
    fail("Informe um diretório novo com --destination para restaurar.");
  const target = path.resolve(destination);
  if (target === source || target.startsWith(`${source}${path.sep}`))
    fail("O destino da restauração deve ficar fora do backup.");
  if (
    fs.existsSync(target) &&
    (fs.lstatSync(target).isSymbolicLink() ||
      !fs.statSync(target).isDirectory() ||
      fs.readdirSync(target).length)
  )
    fail(
      "A restauração exige um diretório novo ou vazio. Os dados existentes não foram alterados.",
    );
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const staging = fs.mkdtempSync(
    path.join(path.dirname(target), ".nexo-restore-"),
  );
  try {
    fs.chmodSync(staging, 0o700);
    for (const file of manifest.files) {
      const output = inside(staging, file.path);
      fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
      fs.copyFileSync(
        inside(source, file.path),
        output,
        fs.constants.COPYFILE_EXCL,
      );
      fs.chmodSync(output, 0o600);
      if (describeFile(staging, file.path).sha256 !== file.sha256)
        fail("Uma cópia da restauração não passou na verificação.");
    }
    const db = new DatabaseSync(path.join(staging, "nexo.sqlite"));
    try {
      for (const table of ["sessions", "password_reset_tokens"]) {
        if (
          db
            .prepare(
              "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
            )
            .get(table)
        )
          db.exec(`DELETE FROM ${table}`);
      }
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } finally {
      db.close();
    }
    for (const folder of DATA_FOLDERS)
      fs.mkdirSync(path.join(staging, folder), {
        recursive: true,
        mode: 0o700,
      });
    // rename cannot replace a nonempty destination, including one created meanwhile.
    fs.renameSync(staging, target);
    return {
      verified: true,
      applied: true,
      destination: target,
      files: manifest.files.length,
      createdAt: manifest.createdAt,
      sessionsRevoked: true,
      resetTokensRevoked: true,
    };
  } finally {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true });
  }
}
function startBackupSchedule({ env = process.env, dataDir, logger = console }) {
  const hours = integer(
    env.CMS_BACKUP_INTERVAL_HOURS,
    24,
    0,
    168,
    "CMS_BACKUP_INTERVAL_HOURS",
  );
  const keep = integer(env.CMS_BACKUP_KEEP, 14, 1, 3650, "CMS_BACKUP_KEEP");
  if (!hours || env.NODE_ENV !== "production") return async () => {};
  const outputRoot = path.resolve(
    env.CMS_BACKUP_DIR || path.join(dataDir, "backups"),
  );
  let running = null;
  let stopped = false;
  const run = () => {
    if (running || stopped) return;
    running = createBackup({ dataDir, outputRoot, keep })
      .then((result) => {
        logger.info(
          {
            createdAt: result.createdAt,
            files: result.files,
            bytes: result.bytes,
          },
          "Backup do Nexo concluído e verificado.",
        );
      })
      .catch((error) =>
        logger.error(
          { message: error.message },
          "O backup do Nexo falhou; confira o armazenamento e execute npm run backup.",
        ),
      )
      .finally(() => {
        running = null;
      });
  };
  const initial = setTimeout(run, 60_000);
  const interval = setInterval(run, hours * 60 * 60 * 1000);
  initial.unref();
  interval.unref();
  return async () => {
    stopped = true;
    clearTimeout(initial);
    clearInterval(interval);
    await running;
  };
}
module.exports = {
  createBackup,
  verifyBackup,
  restoreBackup,
  startBackupSchedule,
  checkDatabase,
};
