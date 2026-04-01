const cron = require('node-cron');
const db = require('../db');
const { refreshToLongLivedToken } = require('../services/instagramService');
const { decrypt, encrypt } = require('../services/cryptoService');

/**
 * Token Refresh Strategy:
 * Every 45 days, fetch all active users and refresh their long-lived tokens.
 * Instagram long-lived tokens are valid for 60 days.
 */
cron.schedule('0 0 */45 * *', async () => {
    console.log('Running daily token refresh check...');
    
    try {
        const result = await db.query('SELECT id, access_token, full_name FROM Users WHERE is_active = true');
        const users = result.rows;

        for (let user of users) {
            try {
                const currentToken = decrypt(user.access_token);
                console.log(`Refreshing token for user: ${user.full_name || user.id}`);
                
                const newToken = await refreshToLongLivedToken(currentToken);
                const encryptedToken = encrypt(newToken);
                
                await db.query('UPDATE Users SET access_token = $1 WHERE id = $2', [encryptedToken, user.id]);
                console.log(`Token refreshed successfully for user: ${user.full_name || user.id}`);
            } catch (userError) {
                console.error(`Failed to refresh token for user ${user.id}:`, userError.message);
                // Optionally: Notify user or mark as needing attention
            }
        }
    } catch (error) {
        console.error('Global token refresh job error:', error.message);
    }
});

console.log('Token refresh cron job scheduled (every 45 days).');
