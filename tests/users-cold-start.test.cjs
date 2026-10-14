const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { Worker } = require("node:worker_threads");

test("concurrent cold starts migrate and bootstrap one stable administrator", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "nexo-cold-start-"));
  const filename = path.join(directory, "nexo.sqlite");
  const initial = new DatabaseSync(filename);
  initial.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE sessions (hash TEXT PRIMARY KEY, preview INTEGER NOT NULL);
  `);
  initial.close();
  const workers = [];
  t.after(async () => {
    await Promise.all(workers.map((worker) => worker.terminate()));
    rmSync(directory, { recursive: true, force: true });
  });
  const starters = Array.from({ length: 3 }, () => {
    const worker = new Worker(
      `
      const { parentPort, workerData } = require("node:worker_threads");
      const { DatabaseSync } = require("node:sqlite");
      const { initializeUsers } = require(workerData.modulePath);
      const db = new DatabaseSync(workerData.filename);
      db.exec("PRAGMA busy_timeout = 5000");
      parentPort.once("message", () => {
        try {
          initializeUsers(db, {
            email: "admin@example.org",
            name: "Nexo test",
            password: "private-cold-start-password",
          }, () => new Date("2026-10-13T12:00:00Z"), "stable-bootstrap-fingerprint");
          parentPort.postMessage({ user: db.prepare("SELECT * FROM users WHERE bootstrap = 1").get() });
        } catch (error) {
          parentPort.postMessage({ error: error.message });
        } finally {
          db.close();
          parentPort.close();
        }
      });
      parentPort.postMessage({ ready: true });
      `,
      {
        eval: true,
        workerData: {
          filename,
          modulePath: require.resolve("../server/users.cjs"),
        },
      },
    );
    workers.push(worker);
    let ready;
    let finish;
    let fail;
    const prepared = new Promise((resolve) => {
      ready = resolve;
    });
    const result = new Promise((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
    worker.on("message", (message) =>
      message.ready ? ready() : finish(message),
    );
    worker.on("error", (error) => {
      ready();
      fail(error);
    });
    return { worker, prepared, result };
  });
  await Promise.all(starters.map(({ prepared }) => prepared));
  starters.forEach(({ worker }) => worker.postMessage("start"));
  const results = await Promise.all(starters.map(({ result }) => result));
  for (const result of results) {
    assert.equal(result.error, undefined);
    assert.deepEqual(result.user, results[0].user);
  }
  const verify = new DatabaseSync(filename);
  try {
    assert.equal(
      verify.prepare("SELECT count(*) AS count FROM users").get().count,
      1,
    );
    assert.equal(
      verify
        .prepare("PRAGMA table_info(sessions)")
        .all()
        .filter(({ name }) => name === "user_id").length,
      1,
    );
  } finally {
    verify.close();
  }
});
