// Mounted volumes can start owned by root. Initialize only the data directories,
// then run the application as the unprivileged node account.
const { mkdirSync, chownSync, existsSync } = require("node:fs");
const path = require("node:path");

if (process.getuid?.() === 0) {
  const dataDir = path.resolve(process.env.DATA_DIR || "/app/data");
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  if (existsSync("/app/data")) chownSync("/app/data", 1000, 1000);
  chownSync(dataDir, 1000, 1000);
  process.setgroups([]);
  process.setgid(1000);
  process.setuid(1000);
}
require("./index.cjs");
