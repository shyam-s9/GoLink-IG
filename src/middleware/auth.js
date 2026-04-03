const crypto = require('crypto');
require('dotenv').config();

const FB_APP_SECRET = process.env.FB_APP_SECRET;

/**
 * Validates the X-Hub-Signature-256 header sent by Meta.
 * @param {Express.Request} req 
 * @param {Express.Response} res 
 * @param {Function} next 
 */
function validateWebhookSignature(req, res, next) {
    const signature = req.headers['x-hub-signature-256'];
    
    if (!signature) {
        console.warn('Webhook received without signature.');
        return res.sendStatus(401);
    }

    const [algorithm, hash] = signature.split('=');
    
    if (algorithm !== 'sha256') {
        console.warn(`Unsupported signature algorithm: ${algorithm}`);
        return res.sendStatus(403);
    }

    // Hash the raw body using the app secret
    const expectedHash = crypto
        .createHmac('sha256', FB_APP_SECRET)
        .update(req.rawBody)
        .digest('hex');

    if (!hash || hash.length !== expectedHash.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash))) {
        console.warn('Webhook signature mismatch!');
        return res.sendStatus(403);
    }

    next();
}

/**
 * Custom body parser to capture raw body for signature validation.
 */
function captureRawBody(req, res, buf, encoding) {
    if (buf && buf.length) {
        req.rawBody = buf.toString(encoding || 'utf8');
    }
}

module.exports = {
    validateWebhookSignature,
    captureRawBody
};
