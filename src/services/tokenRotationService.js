const db = require('../../db');
const { decrypt, encrypt } = require('./cryptoService');
const { refreshToLongLivedToken } = require('./platformService');

async function rotateExpiringTokens() {
    const expiringUsers = await db.query(
        `SELECT id, access_token
         FROM Users
         WHERE token_expires_at IS NOT NULL
           AND token_expires_at <= NOW() + INTERVAL '7 days'
           AND is_active = true`
    );

    let rotated = 0;
    let failed = 0;

    for (const row of expiringUsers.rows) {
        try {
            const decrypted = decrypt(row.access_token);
            const refreshedToken = await refreshToLongLivedToken(decrypted);
            const encryptedToken = encrypt(refreshedToken);

            await db.query(
                `UPDATE Users
                 SET access_token = $2,
                     token_expires_at = NOW() + INTERVAL '60 days',
                     last_security_scan_at = NOW(),
                     updated_at = NOW()
                 WHERE id = $1`,
                [row.id, encryptedToken]
            );

            rotated += 1;
        } catch (error) {
            failed += 1;
            await db.query(
                `INSERT INTO Security_Incidents
                    (user_id, category, status, severity, risk_score, summary, recommended_action, metadata)
                 VALUES ($1, 'token-rotation-failed', 'open', 'medium', 55, $2, $3, $4::jsonb)`,
                [
                    row.id,
                    'Instagram long-lived token refresh failed during proactive rotation.',
                    'Re-authenticate the account and verify Meta token permissions.',
                    JSON.stringify({ error: error.message })
                ]
            ).catch(() => {});
        }
    }

    return { rotated, failed, scanned: expiringUsers.rowCount };
}

module.exports = {
    rotateExpiringTokens
};
