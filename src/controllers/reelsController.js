const axios = require('axios');
const db = require('../db');
const { decrypt } = require('../services/cryptoService');

async function fetchRecentMedia(accessToken, platformUserId, limit = 25) {
    const mediaRes = await axios.get(`https://graph.facebook.com/v19.0/${platformUserId}/media`, {
        params: {
            access_token: accessToken,
            fields: 'id,caption,media_type,media_url,thumbnail_url,timestamp',
            limit
        }
    });

    return (mediaRes.data.data || []).filter((media) => media.media_type === 'VIDEO');
}

/**
 * Manually fetches the 10 most recent Reels from the user's IG media.
 */
async function importRecentReels(req, res) {
    const { userId, platformUserId } = req.user;

    try {
        // 1. Fetch User's Encrypted Token
        const userQuery = await db.query('SELECT access_token FROM Users WHERE id = $1', [userId]);
        if (userQuery.rows.length === 0) return res.status(404).json({ message: 'User not found' });

        const accessToken = decrypt(userQuery.rows[0].access_token);

        // 2. Fetch IG Media (v19.0)
        const reels = await fetchRecentMedia(accessToken, platformUserId, 10);
        res.json({ reels });

    } catch (error) {
        console.error('Import Reels Error:', error.response?.data || error.message);
        res.status(500).json({ message: 'Failed to fetch Reels from Instagram.' });
    }
}

async function listReelAutomations(req, res) {
    const { userId, platformUserId } = req.user;

    try {
        const [userQuery, automationQuery] = await Promise.all([
            db.query('SELECT access_token FROM Users WHERE id = $1', [userId]),
            db.query(
                `SELECT id, reel_id, trigger_keyword, public_reply_text, affiliate_link, is_enabled, total_delivered, created_at
                 FROM Reels_Automation
                 WHERE user_id = $1
                 ORDER BY created_at DESC`,
                [userId]
            )
        ]);

        if (!userQuery.rows.length) {
            return res.status(404).json({ message: 'User not found' });
        }

        const accessToken = decrypt(userQuery.rows[0].access_token);
        let mediaMap = new Map();

        try {
            const recentMedia = await fetchRecentMedia(accessToken, platformUserId, 25);
            mediaMap = new Map(recentMedia.map((media) => [String(media.id), media]));
        } catch (error) {
            console.warn('[reels] could not hydrate media metadata', error.response?.data || error.message);
        }

        const automations = automationQuery.rows.map((row) => {
            const media = mediaMap.get(String(row.reel_id));
            return {
                id: row.id,
                reelId: row.reel_id,
                triggerKeyword: row.trigger_keyword,
                publicReplyText: row.public_reply_text,
                affiliateLink: row.affiliate_link,
                isEnabled: row.is_enabled,
                totalDelivered: row.total_delivered,
                createdAt: row.created_at,
                thumbnailUrl: media?.thumbnail_url || media?.media_url || null,
                mediaUrl: media?.media_url || null,
                caption: media?.caption || null,
                timestamp: media?.timestamp || null
            };
        });

        res.json({ automations });
    } catch (error) {
        console.error('List Reels Error:', error.response?.data || error.message);
        res.status(500).json({ message: 'Failed to load reel automations.' });
    }
}

/**
 * Saves a selected Reel into the Reels_Automation table for GoLink tracking.
 */
async function saveReelAutomation(req, res) {
    const { userId } = req.user;
    const { reelId, triggerKeyword, affiliateLink, publicReplyText, isEnabled = true } = req.body;

    if (!reelId || !triggerKeyword || !affiliateLink) {
        return res.status(400).json({ message: 'Missing required configuration fields.' });
    }

    const sanitizedKeyword = String(triggerKeyword).trim().toLowerCase();
    const sanitizedReply = publicReplyText ? String(publicReplyText).trim().slice(0, 280) : null;
    const sanitizedLink = String(affiliateLink).trim();

    if (sanitizedKeyword.length < 2 || sanitizedKeyword.length > 80) {
        return res.status(400).json({ message: 'Trigger keyword must be between 2 and 80 characters.' });
    }

    try {
        const parsedUrl = new URL(sanitizedLink);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            throw new Error('invalid');
        }
    } catch (error) {
        return res.status(400).json({ message: 'Affiliate link must be a valid HTTP or HTTPS URL.' });
    }

    try {
        const existing = await db.query(
            'SELECT id FROM Reels_Automation WHERE user_id = $1 AND reel_id = $2 LIMIT 1',
            [userId, reelId]
        );

        let result;
        if (existing.rows.length) {
            result = await db.query(
                `UPDATE Reels_Automation
                 SET trigger_keyword = $3,
                     affiliate_link = $4,
                     public_reply_text = $5,
                     is_enabled = $6
                 WHERE id = $1 AND user_id = $2
                 RETURNING id, reel_id, trigger_keyword, public_reply_text, affiliate_link, is_enabled, total_delivered, created_at`,
                [existing.rows[0].id, userId, sanitizedKeyword, sanitizedLink, sanitizedReply, Boolean(isEnabled)]
            );
        } else {
            result = await db.query(
                `INSERT INTO Reels_Automation (user_id, reel_id, trigger_keyword, affiliate_link, public_reply_text, is_enabled)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id, reel_id, trigger_keyword, public_reply_text, affiliate_link, is_enabled, total_delivered, created_at`,
                [userId, reelId, sanitizedKeyword, sanitizedLink, sanitizedReply, Boolean(isEnabled)]
            );
        }

        res.status(existing.rows.length ? 200 : 201).json({
            message: 'Reel automation saved successfully!',
            automation: result.rows[0]
        });
    } catch (error) {
        console.error('Save Automation Error:', error.message);
        res.status(500).json({ message: 'Failed to save automation.' });
    }
}

module.exports = {
    importRecentReels,
    listReelAutomations,
    saveReelAutomation
};
