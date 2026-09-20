const cache = new Map();

export class CacheManager {
  getCache(namespace, opts = {}) {
    const timeout = opts.timeout || 1000;
    return {
      async get(key, factory, options) {
        const cacheKey = `${namespace}:${key}`;
        const t = options?.timeout || timeout;
        const existing = cache.get(cacheKey);
        if (existing && Date.now() - existing.ts < t) {
          return existing.value;
        }
        const value = await factory(key);
        cache.set(cacheKey, { value, ts: Date.now() });
        return value;
      },
    };
  }

  delCache(namespace) {
    for (const key of cache.keys()) {
      if (key.startsWith(`${namespace}:`)) {
        cache.delete(key);
      }
    }
  }
}

export const $CacheManager = new CacheManager();
