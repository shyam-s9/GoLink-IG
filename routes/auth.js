const express = require('express');
const router = express.Router();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { encrypt } = require('../src/services/cryptoService');
const { refreshToLongLivedToken } = require('../src/services/platformService');

const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const BACKEND_URL = (process.env.BACKEND_URL || '').replace(/\/$/, '');
const CALLBACK_URL = `${BACKEND_URL}/`; // Matches the root-redirect point

router.get('/url', (req, res) => {
    const scopes = ['instagram_business_basic','instagram_business_manage_messages','instagram_business_manage_comments','instagram_business_content_publish','instagram_business_manage_insights'];
    const url = `https://www.instagram.com/oauth/authorize?force_reauth=true&client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&response_type=code&scope=${scopes.join(',')}`;
    res.json({ url });
});

router.get('/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('No code');
    try {
        const tokenRes = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
            params: { client_id: FB_APP_ID, client_secret: FB_APP_SECRET, redirect_uri: CALLBACK_URL, code }
        });
        const shortToken = tokenRes.data.access_token;
        const longToken = await refreshToLongLivedToken(shortToken);
        const userRes = await axios.get('https://graph.facebook.com/v19.0/me', { params: { access_token: longToken, fields: 'id,name' } });
        const { id: platformUserId, name: fullName } = userRes.data;
        const encrypted = encrypt(longToken);
        const userQuery = await db.query('INSERT INTO Users (platform_user_id, full_name, access_token) VALUES ($1, $2, $3) ON CONFLICT (platform_user_id) DO UPDATE SET access_token = $3, full_name = $2 RETURNING id', [platformUserId, fullName, encrypted]);
        const token = jwt.sign({ userId: userQuery.rows[0].id, platformUserId }, process.env.JWT_SECRET, { expiresIn: '15m' });
        res.cookie('auth_token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 15 * 60 * 1000 });
        res.redirect(`${process.env.CLIENT_URL || '/'}?auth=success`);
    } catch (err) {
        console.error('Auth logic error:', err.message);
        res.redirect(`${process.env.CLIENT_URL || '/'}?auth=error`);
    }
});

module.exports = router;
