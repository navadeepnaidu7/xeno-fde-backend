import { Request, Response, NextFunction } from 'express';
/**
 * Simple sliding window rate limiter using Redis
 * Limits requests per identifier (e.g., shop domain)
 */
export declare function rateLimiter(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=rateLimit.d.ts.map