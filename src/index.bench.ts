import { join } from "node:path";
import Database from "better-sqlite3";
import { beforeAll, bench, describe } from "vitest";

let sqlite: Database.Database;

const sqliteFile = join(process.cwd(), "runtime", "cache.sqlite3");
const cacheTableName = "caches";

const argsCount = 2;

const keys = Array.from({ length: 10000 }, (_, i) => i + 1);

beforeAll(async () => {
  sqlite = new Database(sqliteFile);

  //sqlite.pragma("journal_mode = WAL");

  sqlite.exec(`
 CREATE TABLE IF NOT EXISTS ${cacheTableName} (
	'cacheKey' TEXT PRIMARY KEY,
	'cacheData' TEXT,
	'createdAt' INTEGER,
  'expiredAt' INTEGER
);
CREATE INDEX IF NOT EXISTS idx_expired_caches ON ${cacheTableName}(expiredAt);
`);

  const updateStatement = sqlite.prepare(
    `INSERT OR REPLACE INTO ${cacheTableName}(cacheKey, cacheData, createdAt, expiredAt) VALUES (?, ?, ?, ?)`,
  );

  const createdAt = new Date().getTime();

  for (const k of keys) {
    updateStatement.run(k, "cacheData", createdAt, -1);
  }
});

describe("sqlite select", () => {
  bench("select normal", () => {
    const selectStatement = sqlite.prepare(`SELECT * FROM ${cacheTableName} WHERE cacheKey = ?`);
    const selectKeys = Array.from({ length: argsCount }, (_, i) => i + 1);

    for (const k of selectKeys) {
      selectStatement.get(k);
    }
  });

  bench("select json_each", () => {
    const selectStatement = sqlite.prepare(
      `SELECT * FROM ${cacheTableName} WHERE cacheKey IN (SELECT value FROM json_each(?))`,
    );
    const selectKeys = Array.from({ length: argsCount }, (_, i) => i + 400);
    selectStatement.all(JSON.stringify(selectKeys));
  });
});

describe("sqlite delete", () => {
  bench("delete normal", () => {
    const deleteStatement = sqlite.prepare(`DELETE FROM ${cacheTableName} WHERE cacheKey = ?`);
    const deleteKeys = Array.from({ length: argsCount }, (_, i) => i + 1000);

    for (const k of deleteKeys) {
      deleteStatement.run(k);
    }
  });

  bench("delete json_each", () => {
    const deleteStatement = sqlite.prepare(
      `DELETE FROM ${cacheTableName} WHERE cacheKey IN (SELECT value FROM json_each(?))`,
    );
    const deleteKeys = Array.from({ length: argsCount }, (_, i) => i + 1300);
    deleteStatement.run(JSON.stringify(deleteKeys));
  });
});
