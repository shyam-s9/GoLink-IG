const axios = require('axios');
const db = require('../db');
const { decrypt } = require('../services/cryptoService');

/**
 * Manually fetches the 10 most recent Reels from the user's IG media.
 */
async function importRecentReels(req, res) {
    const { userId, igUserId } = req.user;

    try {
        // 1. Fetch User's Encrypted Token
        const userQuery = await db.query('SELECT access_token FROM Users WHERE id = $1', [userId]);
        if (userQuery.rows.length === 0) return res.status(404).json({ message: 'User not found' });

        const accessToken = decrypt(userQuery.rows[0].access_token);

        // 2. Fetch IG Media (v19.0)
        const mediaRes = await axios.get(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
            params: {
                access_token: accessToken,
                fields: 'id,caption,media_type,media_url,thumbnail_url,timestamp',
                limit: 10
            }
        });

        const reels = mediaRes.data.data.filter(m => m.media_type === 'VIDEO'); // Filtering for Reels/Videos
        res.json({ reels });

    } catch (error) {
        console.error('Import Reels Error:', error.response?.data || error.message);
        res.status(500).json({ message: 'Failed to fetch Reels from Instagram.' });
    }
}

/**
 * Saves a selected Reel into the Reels_Automation table for GoLink tracking.
 */
async function saveReelAutomation(req, res) {
    const { userId } = req.user;
    const { reelId, triggerKeyword, affiliateLink, publicReplyText } = req.body;

    if (!reelId || !triggerKeyword || !affiliateLink) {
        return res.status(400).json({ message: 'Missing required configuration fields.' });
    }

    try {
        await db.query(
            'INSERT INTO Reels_Automation (user_id, reel_id, trigger_keyword, affiliate_link, public_reply_text) VALUES ($1, $2, $3, $4, $5)',
            [userId, reelId, triggerKeyword, affiliateLink, publicReplyText]
        );
        res.status(201).json({ message: 'Reel automation saved successfully!' });
    } catch (error) {
        console.error('Save Automation Error:', error.message);
        res.status(500).json({ message: 'Failed to save automation.' });
    }
}

module.exports = {
    importRecentReels,
    saveReelAutomation
};
