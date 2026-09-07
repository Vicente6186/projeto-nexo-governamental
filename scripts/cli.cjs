const fs = require("node:fs");
const path = require("node:path");
function loadEnv() {
  const filename = path.resolve(__dirname, "..", ".env");
  if (fs.existsSync(filename)) process.loadEnvFile(filename);
}
function args(argv, valueFlags, booleanFlags = []) {
  const result = {};
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (Object.hasOwn(result, key)) throw new Error(`Opção repetida: ${key}`);
    if (booleanFlags.includes(key)) result[key] = true;
    else if (valueFlags.includes(key)) {
      const value = argv[++index];
      if (!value || value.startsWith("--"))
        throw new Error(`Informe um valor para ${key}.`);
      result[key] = value;
    } else throw new Error(`Opção não reconhecida: ${key}`);
  }
  return result;
}
module.exports = { args, loadEnv };
