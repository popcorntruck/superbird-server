import { LRUCache } from "lru-cache";
import {
  cachified,
  type CacheEntry,
  type Cache,
  totalTtl,
} from "@epic-web/cachified";

/* lru cache is not part of this package but a simple non-persistent cache */
const lruInstance = new LRUCache<string, CacheEntry>({ max: 1000 });

export const lruCache: Cache = {
  set(key, value) {
    const ttl = totalTtl(value?.metadata);
    return lruInstance.set(key, value, {
      ttl: ttl === Infinity ? undefined : ttl,
      start: value?.metadata?.createdTime,
    });
  },
  get(key) {
    return lruInstance.get(key);
  },
  delete(key) {
    return lruInstance.delete(key);
  },
};