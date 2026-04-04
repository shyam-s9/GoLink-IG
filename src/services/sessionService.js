const jwt = require('jsonwebtoken');

const SESSION_TTL_MS = 15 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;

function getSecret() {
    const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || process.env.FB_APP_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET, SESSION_SECRET, or FB_APP_SECRET must be configured.');
    }
    return secret;
}

function createSessionToken(data, ttlMs = SESSION_TTL_MS) {
    return jwt.sign({
        ...data,
        kind: 'session',
        issuedAt: Date.now(),
    }, getSecret(), {
        algorithm: 'HS256',
        expiresIn: Math.floor(ttlMs / 1000)
    });
}

function verifySessionToken(token) {
    try {
        const payload = jwt.verify(token, getSecret(), { algorithms: ['HS256'] });
        return payload && payload.kind === 'session' ? payload : null;
    } catch (error) {
        return null;
    }
}

function createStateToken(data, ttlMs = STATE_TTL_MS) {
    return jwt.sign({
        ...data,
        kind: 'oauth_state',
    }, getSecret(), {
        algorithm: 'HS256',
        expiresIn: Math.floor(ttlMs / 1000)
    });
}

function verifyStateToken(token) {
    try {
        const payload = jwt.verify(token, getSecret(), { algorithms: ['HS256'] });
        return payload && payload.kind === 'oauth_state' ? payload : null;
    } catch (error) {
        return null;
    }
}

module.exports = {
    SESSION_TTL_MS,
    createSessionToken,
    verifySessionToken,
    createStateToken,
    verifyStateToken
};
