const { verifySessionToken } = require('../services/sessionService');
const { recordSecurityEvent } = require('../services/securityAgentService');
const { getActiveSession, touchSession } = require('../services/sessionStoreService');
const db = require('../../db');

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

    const activeSession = payload.sessionId ? await getActiveSession(payload.sessionId) : null;
    if (!activeSession || activeSession.user_id !== payload.userId) {
        res.setHeader('Set-Cookie', 'auth_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
        await recordSecurityEvent({
            req,
            userId: payload.userId || null,
            eventType: 'revoked-session',
            failedAuth: true,
            blocked: true,
            details: { route: req.originalUrl }
        });
        return res.status(403).json({ message: 'Session has been revoked.' });
    }

    const userStatus = await db.query('SELECT is_active FROM Users WHERE id = $1', [payload.userId]);
    if (!userStatus.rows.length || userStatus.rows[0].is_active === false) {
        await recordSecurityEvent({
            req,
            userId: payload.userId,
            eventType: 'locked-account-session-use',
            failedAuth: true,
            blocked: true,
            baseRisk: 55,
            details: { route: req.originalUrl }
        });
        return res.status(403).json({ message: 'Account is locked for security review.' });
    }

    await touchSession(payload.sessionId);
    req.user = {
        ...payload,
        sessionDbId: activeSession.id,
        sessionFingerprint: activeSession.fingerprint
    };
    next();
}

module.exports = {
    authenticateSession
};
