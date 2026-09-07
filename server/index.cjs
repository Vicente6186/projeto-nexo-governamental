const { existsSync } = require("node:fs");
const path = require("node:path");

const envFile = path.join(__dirname, "..", ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { buildApp } = require("./app.cjs");

async function start() {
  const app = await buildApp();
  const port = Number(process.env.PORT || 3001);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT inválida.");
  await app.listen({ host: process.env.HOST || "127.0.0.1", port });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => app.close().then(() => process.exit(0)));
}

start().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
