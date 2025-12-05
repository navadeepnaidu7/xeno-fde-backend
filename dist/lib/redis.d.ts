import Redis from 'ioredis';
declare let redis: Redis | null;
export declare function getRedis(): Redis | null;
export declare const CACHE_KEYS: {
    metrics: (tenantId: string) => string;
    rateLimit: (identifier: string) => string;
};
export declare const CACHE_TTL: {
    metrics: number;
};
export declare function getCache<T>(key: string): Promise<T | null>;
export declare function setCache(key: string, data: unknown, ttlSeconds: number): Promise<void>;
export declare function deleteCache(key: string): Promise<void>;
export default redis;
//# sourceMappingURL=redis.d.ts.map