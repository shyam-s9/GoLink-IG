function parseCookies(cookieHeader = '') {
    return cookieHeader
        .split(';')
        .map((pair) => pair.trim())
        .filter(Boolean)
        .reduce((acc, pair) => {
            const index = pair.indexOf('=');
            if (index === -1) {
                return acc;
            }

            const key = pair.slice(0, index).trim();
            const value = pair.slice(index + 1).trim();
            acc[key] = decodeURIComponent(value);
            return acc;
        }, {});
}

function attachRequestContext(req, res, next) {
    req.cookies = parseCookies(req.headers.cookie || '');
    req.requestId = req.headers['x-request-id'] || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    res.setHeader('x-request-id', req.requestId);
    next();
}

module.exports = {
    attachRequestContext
};
