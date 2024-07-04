# SQLite store for cache manager

A new SQLite cache store for [cache-manager](https://github.com/BryanDonovan/node-cache-manager).

## Featuring:

- using [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- 100% test coverage and production ready
- Optimized `mset`/`mget` support
- ESM only

## Installation

```
npm i @resolid/cache-manager-sqlite
```

## Requirements

- SQLite 3 with [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- Node 18+

## Usage

```js
import {sqliteStore} from '@resolid/cache-manager-sqlite';
import {createCache} from 'cache-manager';
import {join} from 'node:path';

// SQLite :memory: cache store
const memStoreCache = createCache(sqliteStore({cacheTableName: 'caches'}));

// On disk cache on caches table
const sqliteStoreCache = createCache(sqliteStore({sqliteFile: join(process.cwd(), 'cache.sqlite3'), cacheTableName: 'caches'}))
```

## License

[MIT](./LICENSE).

## Thanks

Thanks to JetBrains for the [OSS development license](https://jb.gg/OpenSourceSupport).

![JetBrain](.github/assets/jetbrain-logo.svg)
