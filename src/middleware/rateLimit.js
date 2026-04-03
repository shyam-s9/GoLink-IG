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
        const bucket = buckets.get(key);

        if (!bucket || bucket.resetAt <= now) {
            buckets.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }

        bucket.count += 1;
        if (bucket.count <= max) {
            return next();
        }

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
                    observed: bucket.count
                }
            });
        } catch (error) {
            console.error('[rate-limit] failed to record block', error.message);
        }

        res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
        return res.status(429).json({
            message: 'Too many requests. Please slow down and try again shortly.'
        });
    };
}

module.exports = {
    createRateLimiter
};
