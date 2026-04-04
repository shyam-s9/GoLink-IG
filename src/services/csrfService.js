const { doubleCsrf } = require('csrf-csrf');

const {
    generateCsrfToken,
    doubleCsrfProtection,
    invalidCsrfTokenError
} = doubleCsrf({
    getSecret: () => process.env.JWT_SECRET || process.env.FB_APP_SECRET || 'csrf-secret',
    getSessionIdentifier: (req) => req.user?.sessionId || req.requestId || req.ip || 'anonymous',
    getTokenFromRequest: (req) => req.headers['x-csrf-token'],
    cookieName: '__Host-golink.x-csrf-token',
    cookieOptions: {
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true
    },
    size: 64,
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS']
});

module.exports = {
    generateCsrfToken,
    doubleCsrfProtection,
    invalidCsrfTokenError
};
