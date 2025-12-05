"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CACHE_TTL = exports.CACHE_KEYS = void 0;
exports.getRedis = getRedis;
exports.getCache = getCache;
exports.setCache = setCache;
exports.deleteCache = deleteCache;
const ioredis_1 = __importDefault(require("ioredis"));
// Redis client singleton
// Uses REDIS_URL from environment (Railway auto-provides this)
const redisUrl = process.env.REDIS_URL;
let redis = null;
function getRedis() {
    if (!redisUrl) {
        console.warn('REDIS_URL not set - caching disabled');
        return null;
    }
    if (!redis) {
        redis = new ioredis_1.default(redisUrl, {
            maxRetriesPerRequest: 3,
            lazyConnect: true,
        });
        redis.on('error', (err) => {
            console.error('Redis connection error:', err.message);
        });
        redis.on('connect', () => {
            console.log('Redis connected');
        });
    }
    return redis;
}
// Cache keys
exports.CACHE_KEYS = {
    metrics: (tenantId) => `metrics:${tenantId}`,
    rateLimit: (identifier) => `ratelimit:${identifier}`,
};
// Cache TTL in seconds
exports.CACHE_TTL = {
    metrics: 120, // 2 minutes
};
// Helper to get cached data
async function getCache(key) {
    const client = getRedis();
    if (!client)
        return null;
    try {
        const data = await client.get(key);
        return data ? JSON.parse(data) : null;
    }
    catch (err) {
        console.error('Redis get error:', err);
        return null;
    }
}
// Helper to set cached data
async function setCache(key, data, ttlSeconds) {
    const client = getRedis();
    if (!client)
        return;
    try {
        await client.set(key, JSON.stringify(data), 'EX', ttlSeconds);
    }
    catch (err) {
        console.error('Redis set error:', err);
    }
}
// Helper to delete cached data
async function deleteCache(key) {
    const client = getRedis();
    if (!client)
        return;
    try {
        await client.del(key);
    }
    catch (err) {
        console.error('Redis delete error:', err);
    }
}
exports.default = redis;
//# sourceMappingURL=redis.js.map