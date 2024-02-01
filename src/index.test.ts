import {describe, expect, it, beforeEach} from 'vitest';
import cacheManager from 'cache-manager';
import {join} from 'node:path';
import {type SqliteCache, sqliteStore} from "./index";

const sleep = (timeout: number) =>
    new Promise((resolve) => setTimeout(resolve, timeout));

let sqliteCache: SqliteCache;
let sqliteCacheTtl: SqliteCache;
let sqliteCacheInMemory: SqliteCache;

const sqliteFile = join(process.cwd(), 'runtime', 'cache.sqlite3');
const cacheTableName = 'caches'

beforeEach(async () => {
    sqliteCache = await cacheManager.caching(sqliteStore({sqliteFile, cacheTableName}));
    sqliteCacheTtl = await cacheManager.caching(sqliteStore({sqliteFile, cacheTableName, ttl: 500}));

    await sqliteCache.reset();
});

describe('instance', () => {
    it('should be constructed', async () => {
        const cache = await cacheManager.caching(sqliteStore({sqliteFile, cacheTableName}));
        await cache.set('fooll', 'bar');
        await expect(cache.get('fooll')).resolves.toEqual('bar');
    });
});

describe('set', () => {
    it('should store a value without ttl', async () => {
        await expect(sqliteCache.set('foo', 'bar')).resolves.toBeUndefined();
        await expect(sqliteCache.get('foo')).resolves.toBe('bar');
    });

    it('should store a value with a specific ttl', async () => {
        await expect(sqliteCache.set('foo', 'bar', 1)).resolves.toBeUndefined();
        await sleep(2);
        await expect(sqliteCache.get('foo')).resolves.toBeUndefined();
    });

    it('should store a value with a specific ttl from global', async () => {
        await sqliteCacheTtl.set('foo', 'bar');
        await sleep(2);
        await expect(sqliteCacheTtl.get('foo')).resolves.toEqual('bar');
        await sleep(500);
        await expect(sqliteCacheTtl.get('foo')).resolves.toBeUndefined();
    });

    it('should store a value with 0 ttl', async () => {
        await sqliteCacheTtl.set('foo', 'bar', 0);
        await sleep(500 + 1);
        await expect(sqliteCacheTtl.get('foo')).resolves.toEqual('bar');
    });

    it('should not be able to store a null value (not cacheable)', () =>
        expect(sqliteCache.set('foo2', null)).rejects.toBeDefined());

    it('should not store an invalid value', () =>
        expect(sqliteCache.set('foo1', undefined)).rejects.toStrictEqual(
            new Error('no cacheable value undefined'),
        ));


    it('should return an error if there is an error acquiring a connection', async () => {
        sqliteCache.store.client.close();
        await expect(sqliteCache.set('foo', 'bar')).rejects.toBeDefined();
    });
});

describe('mset', () => {
    it('should store a value with a specific ttl', async () => {
        await sqliteCache.store.mset(
            [
                ['foo', 'bar'],
                ['foo2', 'bar2'],
            ],
            1000,
        );
        await expect(sqliteCache.store.mget('foo', 'foo2')).resolves.toStrictEqual([
            'bar',
            'bar2',
        ]);
    });

    it('should store a value with a specific ttl from global', async () => {
        await sqliteCacheTtl.store.mset([
            ['foo', 'bar'],
            ['foo2', 'bar2'],
        ]);
        await expect(
            sqliteCacheTtl.store.mget('foo', 'foo2'),
        ).resolves.toStrictEqual(['bar', 'bar2']);

        await sleep(500);

        await expect(
            sqliteCacheTtl.store.mget('foo', 'foo2'),
        ).resolves.toStrictEqual([undefined, undefined]);
    });

    it('should store a value with 0 ttl', async () => {
        await sqliteCacheTtl.store.mset(
            [
                ['foo', 'bar'],
                ['foo2', 'bar2'],
            ],
            0,
        );
        await sleep(500);
        await expect(
            sqliteCacheTtl.store.mget('foo', 'foo2'),
        ).resolves.toStrictEqual(['bar', 'bar2']);
    });

    it('should store a value with a no ttl', async () => {
        await sqliteCache.store.mset([
            ['foo', 'bar'],
            ['foo2', 'bar2'],
        ]);
        await expect(sqliteCache.store.mget('foo', 'foo2')).resolves.toStrictEqual([
            'bar',
            'bar2',
        ]);
        await expect(sqliteCache.store.ttl('foo')).resolves.toEqual(-1);
    });

    it('should not be able to store a null value (not cacheable)', () =>
        expect(sqliteCache.store.mset([['foo2', null]])).rejects.toBeDefined());

    it('should store a value without ttl', async () => {
        await sqliteCache.store.mset([
            ['foo', 'baz'],
            ['foo2', 'baz2'],
        ]);
        await expect(sqliteCache.store.mget('foo', 'foo2')).resolves.toStrictEqual([
            'baz',
            'baz2',
        ]);
    });

    it('should not store an invalid value', () =>
        expect(sqliteCache.store.mset([['foo1', undefined]])).rejects.toBeDefined());
});

describe('mget', () => {
    it('should retrieve a value for a given key', async () => {
        const value = 'bar';
        const value2 = 'bar2';
        await sqliteCache.store.mset([
            ['foo', value],
            ['foo2', value2],
        ]);
        await expect(sqliteCache.store.mget('foo', 'foo2')).resolves.toStrictEqual([
            value,
            value2,
        ]);
    });
    it('should return null when the key is invalid', () =>
        expect(
            sqliteCache.store.mget('invalidKey', 'otherInvalidKey'),
        ).resolves.toStrictEqual([undefined, undefined]));

    it('should return an error if there is an error acquiring a connection', async () => {
        sqliteCache.store.client.close();
        await expect(sqliteCache.store.mget('foo')).rejects.toBeDefined();
    });
});

describe('del', () => {
    it('should delete a value for a given key', async () => {
        await sqliteCache.set('foo', 'bar');
        await expect(sqliteCache.del('foo')).resolves.toBeUndefined();
    });

    it('should delete a unlimited number of keys', async () => {
        await sqliteCache.store.mset([
            ['foo', 'bar'],
            ['foo2', 'bar2'],
        ]);
        await expect(sqliteCache.store.mdel('foo', 'foo2')).resolves.toBeUndefined();
    });

    it('should return an error if there is an error acquiring a connection', async () => {
        sqliteCache.store.client.close();
        await expect(sqliteCache.del('foo')).rejects.toBeDefined();
    });
});

describe('reset', () => {
    it('should flush underlying db', () => sqliteCache.reset());

    it('should return an error if there is an error acquiring a connection', async () => {
        sqliteCache.store.client.close();
        await expect(sqliteCache.reset()).rejects.toBeDefined();
    });
});

describe('ttl', () => {
    it('should retrieve ttl for a given key', async () => {
        const ttl = 1000;
        await sqliteCache.set('foo', 'bar', ttl);
        await expect(sqliteCache.store.ttl('foo')).resolves.toBeGreaterThanOrEqual(
            ttl - 10,
        );

        await sqliteCache.set('foo', 'bar', 0);
        await expect(sqliteCache.store.ttl('foo')).resolves.toEqual(-1);
    });

    it('should retrieve ttl for an invalid key', () =>
        expect(sqliteCache.store.ttl('invalidKey')).resolves.toEqual(-2));

    it('should return an error if there is an error acquiring a connection', async () => {
        sqliteCache.store.client.close();
        await expect(sqliteCache.store.ttl('foo')).rejects.toBeDefined();
    });
});

describe('keys', () => {
    it('should return an array of keys for the given pattern', async () => {
        await sqliteCache.set('foo', 'bar');
        await expect(sqliteCache.store.keys('f*')).resolves.toStrictEqual(['foo']);
    });

    it('should return an array of all keys if called without a pattern', async () => {
        await sqliteCache.store.mset([
            ['foo', 'bar'],
            ['foo2', 'bar2'],
            ['foo3', 'bar3'],
        ]);
        await expect(
            sqliteCache.store
                .keys('f*')
                .then((x) => x.sort((a, b) => a.localeCompare(b))),
        ).resolves.toStrictEqual(['foo', 'foo2', 'foo3']);
    });

    it('should return an array of keys without pattern', async () => {
        await sqliteCache.reset();
        await sqliteCache.set('foo', 'bar');
        await expect(sqliteCache.store.keys()).resolves.toStrictEqual(['foo']);
    });

    it('should return an error if there is an error acquiring a connection', async () => {
        sqliteCache.store.client.close();
        await expect(sqliteCache.store.keys()).rejects.toBeDefined();
    });
});

describe('wrap function', () => {
    // Simulate retrieving a user from a database
    const getUser = (id: number) => Promise.resolve({id});

    it('should work', async () => {
        const id = 123;

        await sqliteCache.wrap('wrap-promise', () => getUser(id));

        // Second call to wrap should retrieve from cache
        await expect(
            sqliteCache.wrap('wrap-promise', () => getUser(id + 1)),
        ).resolves.toStrictEqual({id});
    });
});