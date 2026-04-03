const crypto = require('crypto');

const SESSION_TTL_MS = 15 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;

function getSecret() {
    const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || process.env.FB_APP_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET, SESSION_SECRET, or FB_APP_SECRET must be configured.');
    }
    return secret;
}

function base64UrlEncode(input) {
    return Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function base64UrlDecode(input) {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
}

function signPayload(payload) {
    const payloadPart = base64UrlEncode(JSON.stringify(payload));
    const signature = crypto.createHmac('sha256', getSecret()).update(payloadPart).digest('base64url');
    return `${payloadPart}.${signature}`;
}

function verifySignedPayload(token) {
    if (!token || !token.includes('.')) {
        return null;
    }

    const [payloadPart, signature] = token.split('.');
    const expected = crypto.createHmac('sha256', getSecret()).update(payloadPart).digest('base64url');

    if (!signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return null;
    }

    const payload = JSON.parse(base64UrlDecode(payloadPart));
    if (!payload.exp || payload.exp < Date.now()) {
        return null;
    }

    return payload;
}

function createSessionToken(data, ttlMs = SESSION_TTL_MS) {
    return signPayload({
        ...data,
        kind: 'session',
        exp: Date.now() + ttlMs
    });
}

function verifySessionToken(token) {
    const payload = verifySignedPayload(token);
    return payload && payload.kind === 'session' ? payload : null;
}

function createStateToken(data, ttlMs = STATE_TTL_MS) {
    return signPayload({
        ...data,
        kind: 'oauth_state',
        exp: Date.now() + ttlMs
    });
}

function verifyStateToken(token) {
    const payload = verifySignedPayload(token);
    return payload && payload.kind === 'oauth_state' ? payload : null;
}

module.exports = {
    SESSION_TTL_MS,
    createSessionToken,
    verifySessionToken,
    createStateToken,
    verifyStateToken
};
