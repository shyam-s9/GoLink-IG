const axios = require('axios');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { encrypt } = require('../services/cryptoService');
const { refreshToLongLivedToken } = require('../services/instagramService');

const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const CALLBACK_URL = `${process.env.BACKEND_URL}/auth/callback`;

/**
 * Generates the Meta OAuth Login URL.
 */
function getAuthUrl(req, res) {
    const scopes = ['instagram_basic', 'instagram_manage_comments', 'instagram_manage_messages', 'pages_show_list', 'pages_read_engagement'];
    const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&scope=${scopes.join(',')}&response_type=code`;
    res.json({ url });
}

/**
 * Handles the OAuth Callback, exchanges code for token, and issues a 15m JWT.
 */
async function handleCallback(req, res) {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send('No authorization code provided.');
    }

    try {
        // 1. Exchange Code for Short-Lived Access Token
        const tokenRes = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
            params: {
                client_id: FB_APP_ID,
                client_secret: FB_APP_SECRET,
                redirect_uri: CALLBACK_URL,
                code
            }
        });

        const shortLivedToken = tokenRes.data.access_token;

        // 2. Exchange for Long-Lived Token (60 days)
        const longLivedToken = await refreshToLongLivedToken(shortLivedToken);

        // 3. Get User IG ID (Using the ME endpoint)
        const userRes = await axios.get('https://graph.facebook.com/v19.0/me', {
            params: { access_token: longLivedToken, fields: 'id,name' }
        });

        const igUserId = userRes.data.id;
        const fullName = userRes.data.name;

        // 4. Encrypt and Save/Update User in DB
        const encryptedToken = encrypt(longLivedToken);
        const userQuery = await db.query(
            'INSERT INTO Users (ig_user_id, full_name, access_token) VALUES ($1, $2, $3) ON CONFLICT (ig_user_id) DO UPDATE SET access_token = $3, full_name = $2 RETURNING id',
            [igUserId, fullName, encryptedToken]
        );

        const userId = userQuery.rows[0].id;

        // 5. Issue 15-Minute JWT Session
        const token = jwt.sign({ userId, igUserId }, process.env.JWT_SECRET, { expiresIn: '15m' });

        res.cookie('auth_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 15 * 60 * 1000 // 15 mins
        });

        // Redirect back to the frontend with a success flag
        res.redirect(`${process.env.CLIENT_URL}?auth=success`);

    } catch (error) {
        console.error('OAuth Callback Error:', error.response?.data || error.message);
        res.redirect(`${process.env.CLIENT_URL}?auth=error`);
    }
}

module.exports = {
    getAuthUrl,
    handleCallback
};
