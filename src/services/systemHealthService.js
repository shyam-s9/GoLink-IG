const Redis = require('ioredis');
const db = require('../../db');

const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null
});

async function getWorkerHeartbeat() {
    const raw = await redis.get('system:worker-heartbeat');
    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw);
    } catch (error) {
        return null;
    }
}

async function createAutomationOfflineIncidentIfNeeded(lastHeartbeat) {
    const existing = await db.query(
        `SELECT id
         FROM Security_Incidents
         WHERE category = 'automation-offline'
           AND status = 'open'
         LIMIT 1`
    );

    if (existing.rows.length) {
        return existing.rows[0];
    }

    const detail = lastHeartbeat ? `Last worker heartbeat: ${lastHeartbeat.timestamp}` : 'No worker heartbeat detected.';
    const result = await db.query(
        `INSERT INTO Security_Incidents
            (category, status, severity, risk_score, summary, recommended_action, metadata)
         VALUES ('automation-offline', 'open', 'high', 80, $1, $2, $3::jsonb)
         RETURNING id, status`,
        [
            'Automation worker heartbeat is stale or missing.',
            'Restart the worker service and verify BullMQ + Redis connectivity.',
            JSON.stringify({ lastHeartbeat })
        ]
    );

    return result.rows[0];
}

async function getSystemHealth() {
    const heartbeat = await getWorkerHeartbeat();
    const now = Date.now();
    const stale = !heartbeat || !heartbeat.timestamp || (now - new Date(heartbeat.timestamp).getTime()) > 90_000;

    if (stale) {
        await createAutomationOfflineIncidentIfNeeded(heartbeat);
    }

    return {
        worker: {
            healthy: !stale,
            lastHeartbeat: heartbeat?.timestamp || null,
            pid: heartbeat?.pid || null,
            hostname: heartbeat?.hostname || null
        }
    };
}

module.exports = {
    getSystemHealth
};
