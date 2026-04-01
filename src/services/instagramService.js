const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const APP_SECRET = process.env.FB_APP_SECRET;

/**
 * Generates appsecret_proof for Meta Graph API calls.
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
 * Checks if a user follows the creator using the Graph API.
 * @param {string} creatorIgId 
 * @param {string} followerIgId 
 * @param {string} accessToken 
 * @returns {Promise<boolean>}
 */
async function checkIfFollowing(creatorIgId, followerIgId, accessToken) {
    try {
        const proof = getAppSecretProof(accessToken);
        // Using the user/follows endpoint to check relationship
        // Ref: https://developers.facebook.com/docs/instagram-api/reference/ig-user/follows
        const response = await axios.get(`https://graph.facebook.com/v19.0/${creatorIgId}/followers`, {
            params: {
                access_token: accessToken,
                appsecret_proof: proof
            }
        });

        // Note: For large follower lists, this might need pagination or 
        // a more specific endpoint if available in the future.
        const followers = response.data.data || [];
        return followers.some(f => f.id === followerIgId);
    } catch (error) {
        console.error("Follower Check Error:", error.response?.data || error.message);
        return false;
    }
}

/**
 * Sends a DM via Instagram Graph API.
 * @param {string} creatorIgId 
 * @param {string} recipientIgId 
 * @param {string} message 
 * @param {string} accessToken 
 */
async function sendDM(creatorIgId, recipientIgId, message, accessToken) {
    try {
        const proof = getAppSecretProof(accessToken);
        const url = `https://graph.facebook.com/v19.0/${creatorIgId}/messages`;
        
        await axios.post(url, {
            recipient: { id: recipientIgId },
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
