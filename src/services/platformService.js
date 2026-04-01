const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const APP_SECRET = process.env.FB_APP_SECRET;

/**
 * Generates appsecret_proof for Platform Graph API calls.
 * @param {string} accessToken 
 * @returns {string}
 */
function getAppSecretProof(accessToken) {
    return crypto
        .createHmac('sha256', APP_SECRET)
        .update(accessToken)
        .digest('hex');
}

/**
 * Checks if a user follows the creator using the Platform API.
 * @param {string} creatorId 
 * @param {string} followerId 
 * @param {string} accessToken 
 * @returns {Promise<boolean>}
 */
async function checkIfFollowing(creatorId, followerId, accessToken) {
    try {
        const proof = getAppSecretProof(accessToken);
        const response = await axios.get(`https://graph.facebook.com/v19.0/${creatorId}/followers`, {
            params: {
                access_token: accessToken,
                appsecret_proof: proof
            }
        });
        const followers = response.data.data || [];
        return followers.some(f => f.id === followerId);
    } catch (error) {
        console.error("Follower Check Error:", error.response?.data || error.message);
        return false;
    }
}

/**
 * Sends a DM via Platform API.
 * @param {string} creatorId 
 * @param {string} recipientId 
 * @param {string} message 
 * @param {string} accessToken 
 */
async function sendDM(creatorId, recipientId, message, accessToken) {
    try {
        const proof = getAppSecretProof(accessToken);
        const url = `https://graph.facebook.com/v19.0/${creatorId}/messages`;
        
        await axios.post(url, {
            recipient: { id: recipientId },
            message: { text: message }
        }, {
            params: {
                access_token: accessToken,
                appsecret_proof: proof
            }
        });
        return true;
    } catch (error) {
        console.error("DM Delivery Error:", error.response?.data || error.message);
        return false;
    }
}

/**
 * Replies to a comment publicly on a post.
 * @param {string} commentId 
 * @param {string} message 
 * @param {string} accessToken 
 */
async function replyToComment(commentId, message, accessToken) {
    try {
        const proof = getAppSecretProof(accessToken);
        const url = `https://graph.facebook.com/v19.0/${commentId}/replies`;
        
        await axios.post(url, {
            message: message
        }, {
            params: {
                access_token: accessToken,
                appsecret_proof: proof
            }
        });
        return true;
    } catch (error) {
        console.error("Public Reply Error:", error.response?.data || error.message);
        return false;
    }
}

/**
 * Refreshes a short-lived token to a long-lived token (60 days).
 * @param {string} shortLivedToken 
 */
async function refreshToLongLivedToken(shortLivedToken) {
    try {
        const response = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: process.env.FB_APP_ID,
                client_secret: process.env.FB_APP_SECRET,
                fb_exchange_token: shortLivedToken
            }
        });
        return response.data.access_token;
    } catch (error) {
        console.error("Token Refresh Error:", error.response?.data || error.message);
        throw error;
    }
}

module.exports = {
    checkIfFollowing,
    sendDM,
    replyToComment,
    refreshToLongLivedToken,
    getAppSecretProof
};
