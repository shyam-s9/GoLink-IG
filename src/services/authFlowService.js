const crypto = require('crypto');
const { createStateToken, verifyStateToken } = require('./sessionService');

function issueOauthState(requestId) {
    return createStateToken({
        nonce: crypto.randomUUID(),
        requestId
    });
}

function isValidOauthState(state, stateCookie) {
    if (!state || !stateCookie || state !== stateCookie) {
        return false;
    }

    return Boolean(verifyStateToken(state));
}

module.exports = {
    issueOauthState,
    isValidOauthState
};
