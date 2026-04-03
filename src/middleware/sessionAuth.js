const { verifySessionToken } = require('../services/sessionService');
const { recordSecurityEvent } = require('../services/securityAgentService');

async function authenticateSession(req, res, next) {
    const token = req.cookies?.auth_token;
    if (!token) {
        await recordSecurityEvent({
            req,
            eventType: 'missing-session',
            failedAuth: true,
            blocked: true,
            details: { route: req.originalUrl }
        });
        return res.status(401).json({ message: 'Authentication required.' });
    }

    const payload = verifySessionToken(token);
    if (!payload) {
        res.setHeader('Set-Cookie', 'auth_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
        await recordSecurityEvent({
            req,
            eventType: 'invalid-session',
            failedAuth: true,
            blocked: true,
            details: { route: req.originalUrl }
        });
        return res.status(403).json({ message: 'Session expired or invalid.' });
    }

    req.user = payload;
    next();
}

module.exports = {
    authenticateSession
};
