import Database from 'better-sqlite3';
import {type Config, type Milliseconds, type Store, type Cache} from 'cache-manager';

type SqliteStoreOptions = {
    sqliteFile?: string;
    cacheTableName: string;
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
    get client(): ReturnType<typeof Database>,
};

export type SqliteCache = Cache<SqliteStore>;

export const sqliteStore = (options: SqliteStoreOptions): SqliteStore => {
    const isCacheable = options?.isCacheable ?? ((val) => val != undefined);

    const sqlite = new Database(options.sqliteFile);
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
    const deleteStatement = sqlite.prepare(`DELETE FROM ${tableName} WHERE cacheKey = ?`);
    const finderStatement = sqlite.prepare(`SELECT cacheKey FROM ${tableName} WHERE cacheKey LIKE ?`);
    const emptyStatement = sqlite.prepare(`DELETE FROM ${tableName}`);

    const fetchCaches = (...args: string[]): CacheObject[] => {
        const ts = now()

        const trans = sqlite.transaction<(keys: string[]) => CacheObject[]>((keys) => {
            return keys
                .map((key) => selectStatement.get(key) as CacheObject | undefined)
                .filter((data) => (data != undefined && (data.expiredAt == -1 || data.expiredAt > ts))) as CacheObject[];
        });

        return trans(args);
    };

    const deleteCaches = (...args: string[]) => {
        const trans = sqlite.transaction<(keys: string[]) => void>((keys) => {
            for (const key of keys) {
                deleteStatement.run(key);
            }
        });

        trans(args);
    };

    const updateCatches = (args: [string, unknown][], ttl?: Milliseconds) => {
        const t = ttl == undefined ? options?.ttl : ttl;
        const createdAt = now();
        const expiredAt = t != undefined && t != 0 ? (createdAt + t) : -1;

        const trans = sqlite.transaction<(args: [string, unknown][], createdAt: number, expiredAt: number) => void>(
            (args, createdAt, expiredAt) => {
                for (const cache of args) {
                    if (!isCacheable(cache[1])) {
                        throw new Error(`no cacheable value ${JSON.stringify(cache[1])}`);
                    }

                    updateStatement.run(cache[0], JSON.stringify(cache[1]), createdAt, expiredAt);
                }
            },
        );

        trans(args, createdAt, expiredAt);
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
                    const result = (finderStatement.all(pattern?.replace('*', '%') ?? '%') as CacheObject[]).map((cache) => cache.cacheKey);
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
