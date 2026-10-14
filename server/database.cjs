const { DatabaseSync } = require("node:sqlite");

// Remote libSQL executes against the durable primary. No local replica, file
// snapshot or background synchronization participates in persisted writes.
function openDatabase({ filename, url, authToken } = {}) {
  if (!url && !authToken) {
    if (!filename) throw new Error("Informe o caminho do banco local.");
    const database = new DatabaseSync(filename);
    return {
      remote: false,
      prepare: (sql) => database.prepare(sql),
      exec: (sql) => database.exec(sql),
      close: () => database.close(),
    };
  }
  if (!url || !authToken)
    throw new Error("Configure o endereço e a credencial do banco remoto.");
  let address;
  try {
    address = new URL(url);
  } catch {
    throw new Error("O endereço do banco remoto é inválido.");
  }
  if (
    !["libsql:", "https:"].includes(address.protocol) ||
    !address.hostname ||
    address.username ||
    address.password ||
    address.search ||
    address.hash ||
    (address.pathname && address.pathname !== "/")
  )
    throw new Error(
      "Use um endereço seguro do banco remoto, sem credenciais na URL.",
    );

  const Database = require("libsql");
  const database = new Database(url, { authToken });
  return {
    remote: true,
    prepare: (sql) => {
      const statement = database.prepare(sql);
      return {
        get: (...parameters) => {
          const row = statement.get(...parameters);
          // libsql 0.5 adds timing metadata to get() results only. Keep the
          // same data shape as node:sqlite and avoid leaking driver details.
          if (row) delete row._metadata;
          return row;
        },
        all: (...parameters) => statement.all(...parameters),
        run: (...parameters) => statement.run(...parameters),
      };
    },
    exec: (sql) => database.exec(sql),
    close: () => database.close(),
  };
}

module.exports = { openDatabase };
