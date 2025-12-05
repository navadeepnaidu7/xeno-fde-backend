import { Request, Response, NextFunction } from 'express';
import { getRedis, CACHE_KEYS } from '../lib/redis';

// Rate limit configuration
const RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 100, // 100 requests per window
};

/**
 * Simple sliding window rate limiter using Redis
 * Limits requests per identifier (e.g., shop domain)
 */
export async function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const redis = getRedis();

  // If Redis is not available, skip rate limiting
  if (!redis) {
    return next();
  }

  // Use shop domain from header as identifier, fallback to IP
  const shopDomain = req.headers['x-shopify-shop-domain'] as string;
  const identifier = shopDomain || req.ip || 'unknown';
  const key = CACHE_KEYS.rateLimit(identifier);

  try {
    // Increment counter and set expiry if new
    const count = await redis.incr(key);

    // Set expiry on first request in window
    if (count === 1) {
      await redis.pexpire(key, RATE_LIMIT.windowMs);
    }

    // Get TTL for headers
    const ttl = await redis.pttl(key);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', RATE_LIMIT.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT.maxRequests - count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000 + ttl / 1000));

    // Check if over limit
    if (count > RATE_LIMIT.maxRequests) {
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil(ttl / 1000),
      });
      return;
    }

    next();
  } catch (err) {
    console.error('Rate limit error:', err);
    // On error, allow the request through
    next();
  }
}
