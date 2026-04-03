const db = require('../../db');

async function writeAuditLog({
    userId = null,
    actorType = 'system',
    action,
    targetType = null,
    targetId = null,
    requestId = null,
    metadata = {}
}) {
    await db.query(
        `INSERT INTO Audit_Log
            (user_id, actor_type, action, target_type, target_id, request_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
            userId,
            actorType,
            action,
            targetType,
            targetId,
            requestId,
            JSON.stringify(metadata)
        ]
    );
}

async function getAuditTrail(userId, limit = 50) {
    const result = await db.query(
        `SELECT id, actor_type, action, target_type, target_id, request_id, metadata, created_at
         FROM Audit_Log
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit]
    );

    return result.rows;
}

module.exports = {
    writeAuditLog,
    getAuditTrail
};
