const jwt = require('jsonwebtoken');

/**
 * Middleware to verify the 15-minute JWT session.
 * Protects dashboard routes and ensures Meta Review compliance for session security.
 */
function authenticateJWT(req, res, next) {
    const token = req.cookies.auth_token;

    if (!token) {
        // Redirect to login if user is not authorized
        return res.status(401).redirect('/?auth=expired');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        console.error('JWT Verification Error:', err.message);
        res.clearCookie('auth_token');
        return res.status(403).redirect('/?auth=invalid');
    }
}

module.exports = {
    authenticateJWT
};
