const { recordSecurityEvent } = require('../services/securityAgentService');

async function authenticateAdmin(req, res, next) {
    const suppliedKey = req.headers['x-admin-api-key'];
    const expectedKey = process.env.ADMIN_API_KEY;

    if (!expectedKey || !suppliedKey || suppliedKey !== expectedKey) {
        await recordSecurityEvent({
            req,
            eventType: 'admin-auth-failed',
            failedAuth: true,
            blocked: true,
            baseRisk: 45,
            details: { path: req.path }
        });
        return res.status(403).json({ message: 'Admin authorization failed.' });
    }

    req.admin = { role: 'platform-admin' };
    next();
}

module.exports = {
    authenticateAdmin
};
