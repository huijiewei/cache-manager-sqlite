import Database from "better-sqlite3";
import type { Cache, Config, Milliseconds, Store } from "cache-manager";

type SqliteStoreOptions = {
  sqliteFile?: string;
  cacheTableName: string;
  enableWALMode?: boolean;
} & Config;

type CacheObject = {
  cacheKey: string;
  cacheData: string;
  createdAt: number;
  expiredAt: number;
};

const now = () => {
  return new Date().getTime();
};

export type SqliteStore = Store & {
  get client(): ReturnType<typeof Database>;
};

export type SqliteCache = Cache<SqliteStore>;

export const sqliteStore = (options: SqliteStoreOptions): SqliteStore => {
  const isCacheable = options?.isCacheable ?? ((val) => val !== undefined);
  const enableWALMode = options?.enableWALMode ?? true;

  const sqlite = new Database(options.sqliteFile);

  if (enableWALMode) {
    sqlite.pragma("journal_mode = WAL");
  }

  const tableName = options.cacheTableName;

  sqlite.exec(`
 CREATE TABLE IF NOT EXISTS ${tableName} (
	'cacheKey' TEXT PRIMARY KEY,
	'cacheData' TEXT,
	'createdAt' INTEGER,
  'expiredAt' INTEGER
);
CREATE INDEX IF NOT EXISTS idx_expired_caches ON ${tableName}(expiredAt);
`);

  const selectStatement = sqlite.prepare(`SELECT * FROM ${tableName} WHERE cacheKey = ?`);
  const updateStatement = sqlite.prepare(
    `INSERT OR REPLACE INTO ${tableName}(cacheKey, cacheData, createdAt, expiredAt) VALUES (?, ?, ?, ?)`,
  );
  const deleteStatement = sqlite.prepare(`DELETE FROM ${tableName} WHERE cacheKey IN (?)`);
  const finderStatement = sqlite.prepare(
    `SELECT cacheKey FROM ${tableName} WHERE cacheKey LIKE ? AND (expiredAt = -1 OR expiredAt > ?)`,
  );
  const emptyStatement = sqlite.prepare(`DELETE FROM ${tableName}`);

  const fetchCaches = (...args: string[]): CacheObject[] => {
    const ts = now();
    const expiredKeys: string[] = [];

    const result = args
      .map((key) => {
        const data = selectStatement.get(key) as CacheObject | undefined;
        if (data !== undefined && data.expiredAt !== -1 && data.expiredAt < ts) {
          expiredKeys.push(data.cacheKey);
          return undefined;
        }
        return data;
      })
      .filter((data) => data !== undefined) as CacheObject[];

    if (expiredKeys.length > 0) {
      deleteStatement.run(expiredKeys.join(","));
    }

    return result;
  };

  const deleteCaches = (...args: string[]) => {
    deleteStatement.run(args.join(","));
  };

  const updateCatches = (args: [string, unknown][], ttl?: Milliseconds) => {
    const t = ttl == undefined ? options?.ttl : ttl;
    const createdAt = now();
    const expiredAt = t != undefined && t != 0 ? createdAt + t : -1;

    for (const cache of args) {
      if (!isCacheable(cache[1])) {
        throw new Error(`no cacheable value ${JSON.stringify(cache[1])}`);
      }
      updateStatement.run(cache[0], JSON.stringify(cache[1]), createdAt, expiredAt);
    }
  };

  return {
    del(key: string): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          deleteCaches(key);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    },
    get<T>(key: string): Promise<T | undefined> {
      return new Promise((resolve, reject) => {
        try {
          const result = fetchCaches(key);

          if (result.length == 0) {
            resolve(undefined);
          } else {
            resolve(JSON.parse(result[0].cacheData));
          }
        } catch (e) {
          reject(e);
        }
      });
    },
    keys(pattern?: string): Promise<string[]> {
      return new Promise((resolve, reject) => {
        try {
          const result = (finderStatement.all(pattern?.replace("*", "%") ?? "%", now()) as CacheObject[]).map(
            (cache) => cache.cacheKey,
          );
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    },
    mdel(...args: string[]): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          deleteCaches(...args);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    },
    mget<T>(...args: string[]): Promise<T[]> {
      return new Promise((resolve, reject) => {
        try {
          const result = fetchCaches(...args).map((data) => JSON.parse(data.cacheData));

          const fillLen = args.length - result.length;

          resolve(fillLen ? result.concat(Array(fillLen).fill(undefined)) : result);
        } catch (e) {
          reject(e);
        }
      });
    },
    mset(args: [string, unknown][], ttl?: Milliseconds): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          updateCatches(args, ttl);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    },
    reset(): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          emptyStatement.run();
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    },
    set<T>(key: string, data: T, ttl?: Milliseconds): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          updateCatches([[key, data]], ttl);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    },
    ttl(key: string): Promise<number> {
      return new Promise((resolve, reject) => {
        try {
          const result = fetchCaches(key);

          if (result.length == 0) {
            resolve(-2);
          } else {
            resolve(result[0].expiredAt == -1 ? -1 : result[0].expiredAt - now());
          }
        } catch (e) {
          reject(e);
        }
      });
    },
    get client() {
      return sqlite;
    },
  };
};
