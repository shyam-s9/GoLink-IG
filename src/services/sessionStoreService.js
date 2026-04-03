const crypto = require('crypto');
const db = require('../../db');
const { SESSION_TTL_MS } = require('./sessionService');

function hashSessionId(sessionId) {
    return crypto.createHash('sha256').update(sessionId).digest('hex');
}

function generateSessionId() {
    return crypto.randomUUID();
}

async function createSession({
    userId,
    ipAddress,
    userAgent,
    fingerprint
}) {
    const sessionId = generateSessionId();
    const sessionHash = hashSessionId(sessionId);

    await db.query(
        `INSERT INTO Auth_Sessions
            (session_hash, user_id, ip_address, user_agent, fingerprint, expires_at, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' milliseconds')::interval, NOW())`,
        [sessionHash, userId, ipAddress, userAgent, fingerprint, String(SESSION_TTL_MS)]
    );

    return sessionId;
}

async function getActiveSession(sessionId) {
    const result = await db.query(
        `SELECT id, user_id, revoked_at, expires_at, ip_address, user_agent, fingerprint, last_seen_at
         FROM Auth_Sessions
         WHERE session_hash = $1`,
        [hashSessionId(sessionId)]
    );

    const session = result.rows[0];
    if (!session) {
        return null;
    }

    if (session.revoked_at || new Date(session.expires_at).getTime() < Date.now()) {
        return null;
    }

    return session;
}

async function touchSession(sessionId) {
    await db.query(
        `UPDATE Auth_Sessions
         SET last_seen_at = NOW(),
             expires_at = NOW() + ($2 || ' milliseconds')::interval
         WHERE session_hash = $1`,
        [hashSessionId(sessionId), String(SESSION_TTL_MS)]
    );
}

async function revokeSession(sessionId, reason = 'manual') {
    const result = await db.query(
        `UPDATE Auth_Sessions
         SET revoked_at = NOW(),
             revoke_reason = $2
         WHERE session_hash = $1
           AND revoked_at IS NULL
         RETURNING id, user_id`,
        [hashSessionId(sessionId), reason]
    );

    return result.rows[0] || null;
}

async function revokeAllOtherSessions(userId, keepSessionId = null, reason = 'security-hardening') {
    const params = [userId, reason];
    let query = `
        UPDATE Auth_Sessions
        SET revoked_at = NOW(),
            revoke_reason = $2
        WHERE user_id = $1
          AND revoked_at IS NULL`;

    if (keepSessionId) {
        params.push(hashSessionId(keepSessionId));
        query += ' AND session_hash <> $3';
    }

    query += ' RETURNING id';
    const result = await db.query(query, params);
    return result.rowCount;
}

async function listUserSessions(userId) {
    const result = await db.query(
        `SELECT id, ip_address, user_agent, fingerprint, expires_at, revoked_at, revoke_reason, last_seen_at, created_at
         FROM Auth_Sessions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [userId]
    );

    return result.rows;
}

module.exports = {
    createSession,
    getActiveSession,
    touchSession,
    revokeSession,
    revokeAllOtherSessions,
    listUserSessions
};
