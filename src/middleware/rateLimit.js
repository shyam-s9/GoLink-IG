const { recordSecurityEvent } = require('../services/securityAgentService');

const buckets = new Map();

function getKey(req, prefix) {
    const ip = req.headers['x-forwarded-for']
        ? String(req.headers['x-forwarded-for']).split(',')[0].trim()
        : (req.socket?.remoteAddress || 'unknown');
    return `${prefix}:${ip}:${req.path}`;
}

function createRateLimiter({ windowMs, max, prefix }) {
    return async function rateLimit(req, res, next) {
        const now = Date.now();
        const key = getKey(req, prefix);
        const refillRatePerMs = max / windowMs;
        const bucket = buckets.get(key) || {
            tokens: max,
            lastRefillAt: now
        };

        const elapsedMs = now - bucket.lastRefillAt;
        bucket.tokens = Math.min(max, bucket.tokens + elapsedMs * refillRatePerMs);
        bucket.lastRefillAt = now;

        if (bucket.tokens >= 1) {
            bucket.tokens -= 1;
            buckets.set(key, bucket);
            return next();
        }

        buckets.set(key, bucket);

        try {
            await recordSecurityEvent({
                req,
                userId: req.user?.userId || null,
                actorType: req.user ? 'customer' : 'anonymous',
                eventType: 'rate-limit-block',
                baseRisk: 35,
                blocked: true,
                details: {
                    path: req.path,
                    windowMs,
                    max,
                    observedTokens: bucket.tokens
                }
            });
        } catch (error) {
            console.error('[rate-limit] failed to record block', error.message);
        }

        const retryAfterMs = Math.ceil((1 - bucket.tokens) / refillRatePerMs);
        res.setHeader('Retry-After', Math.max(1, Math.ceil(retryAfterMs / 1000)));
        return res.status(429).json({
            message: 'Too many requests. Please slow down and try again shortly.'
        });
    };
}

module.exports = {
    createRateLimiter
};
