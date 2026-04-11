declare module "lru-cache" {
  class LRUCache<K = string, V = any> {
    constructor(options?: { max?: number; maxAge?: number; stale?: boolean });
    get(key: K): V | undefined;
    set(key: K, value: V, maxAge?: number): boolean;
    del(key: K): void;
    reset(): void;
    keys(): K[];
    readonly length: number;
    readonly itemCount: number;
  }
  export = LRUCache;
}
