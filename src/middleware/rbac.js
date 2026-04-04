const { recordSecurityEvent } = require('../services/securityAgentService');

function requireRole(...allowedRoles) {
    const normalized = allowedRoles.map((role) => String(role).toUpperCase());

    return async function roleGuard(req, res, next) {
        const currentRole = String(req.user?.role || '').toUpperCase();
        if (normalized.includes(currentRole)) {
            return next();
        }

        await recordSecurityEvent({
            req,
            userId: req.user?.userId || null,
            actorType: req.user ? 'customer' : 'anonymous',
            eventType: 'rbac-denied',
            failedAuth: true,
            blocked: true,
            baseRisk: 30,
            details: {
                requiredRoles: normalized,
                currentRole
            }
        });

        return res.status(403).json({ message: 'Insufficient permissions.' });
    };
}

module.exports = {
    requireRole
};
