const crypto = require('crypto');
const db = require('../../db');

const THRESHOLDS = {
    elevated: 35,
    high: 65,
    critical: 85
};

function parseIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return String(forwarded).split(',')[0].trim();
    }
    return req.socket?.remoteAddress || req.ip || 'unknown';
}

function getFingerprint(req) {
    const base = [
        parseIp(req),
        req.headers['user-agent'] || 'unknown-agent',
        req.headers['accept-language'] || 'unknown-lang'
    ].join('|');

    return crypto.createHash('sha256').update(base).digest('hex');
}

function collectPayloadStrings(value, collector = []) {
    if (typeof value === 'string') {
        collector.push(value.toLowerCase());
        return collector;
    }

    if (Array.isArray(value)) {
        value.forEach((item) => collectPayloadStrings(item, collector));
        return collector;
    }

    if (value && typeof value === 'object') {
        Object.values(value).forEach((item) => collectPayloadStrings(item, collector));
    }

    return collector;
}

function toSeverity(score) {
    if (score >= THRESHOLDS.critical) return 'critical';
    if (score >= THRESHOLDS.high) return 'high';
    if (score >= THRESHOLDS.elevated) return 'medium';
    return 'low';
}

function toRiskLevel(score) {
    if (score >= THRESHOLDS.critical) return 'critical';
    if (score >= THRESHOLDS.high) return 'high';
    if (score >= THRESHOLDS.elevated) return 'guarded';
    return 'normal';
}

function summarizeSignals(signals) {
    if (!signals.length) {
        return 'No suspicious indicators detected.';
    }

    return signals.map((signal) => signal.reason).join(' ');
}

async function getRecentFingerprintPressure(fingerprint) {
    const result = await db.query(
        `SELECT COUNT(*)::int AS total
         FROM Security_Events
         WHERE fingerprint = $1
           AND created_at >= NOW() - INTERVAL '10 minutes'`,
        [fingerprint]
    );

    return result.rows[0]?.total || 0;
}

async function analyzeRequest(req, options = {}) {
    const fingerprint = getFingerprint(req);
    const payloadStrings = collectPayloadStrings(req.body || {});
    const userAgent = String(req.headers['user-agent'] || '').toLowerCase();
    const signals = [];
    let riskScore = options.baseRisk || 0;

    if (!userAgent) {
        signals.push({ reason: 'Missing user agent header.', score: 10 });
        riskScore += 10;
    }

    if (/(curl|wget|sqlmap|python-requests|postmanruntime|insomnia)/.test(userAgent)) {
        signals.push({ reason: 'Automation-style client detected.', score: 18 });
        riskScore += 18;
    }

    if ((req.originalUrl || '').includes('/webhook/') && !req.headers['x-hub-signature-256']) {
        signals.push({ reason: 'Webhook call arrived without a signature.', score: 40 });
        riskScore += 40;
    }

    if (JSON.stringify(req.body || {}).length > 5000) {
        signals.push({ reason: 'Unusually large payload submitted.', score: 12 });
        riskScore += 12;
    }

    const suspiciousPatterns = [
        /<script/i,
        /union\s+select/i,
        /\.\.\//,
        /drop\s+table/i,
        /\$where/i,
        /benchmark\(/i,
        /access[_-]?token/i,
        /password/i
    ];

    if (payloadStrings.some((value) => suspiciousPatterns.some((pattern) => pattern.test(value)))) {
        signals.push({ reason: 'Payload contained exploit or credential-hunting patterns.', score: 25 });
        riskScore += 25;
    }

    const recentPressure = await getRecentFingerprintPressure(fingerprint);
    if (recentPressure >= 15) {
        const pressureScore = Math.min(25, 8 + recentPressure - 15);
        signals.push({ reason: `Fingerprint has generated ${recentPressure} events in the last 10 minutes.`, score: pressureScore });
        riskScore += pressureScore;
    }

    if (options.failedAuth) {
        signals.push({ reason: 'Authentication validation failed.', score: 22 });
        riskScore += 22;
    }

    if (options.forceCritical) {
        signals.push({ reason: options.forceCritical });
        riskScore = Math.max(riskScore, THRESHOLDS.critical);
    }

    return {
        fingerprint,
        ipAddress: parseIp(req),
        userAgent: req.headers['user-agent'] || 'unknown',
        riskScore: Math.min(100, riskScore),
        severity: toSeverity(riskScore),
        riskLevel: toRiskLevel(riskScore),
        blocked: Boolean(options.blocked),
        signals,
        summary: summarizeSignals(signals)
    };
}

async function upsertSecurityPosture(userId, analysis) {
    if (!userId) {
        return;
    }

    await db.query(
        `INSERT INTO Customer_Security_Posture
            (user_id, risk_level, last_risk_score, suspicious_request_count, blocked_request_count, last_seen_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
            risk_level = CASE
                WHEN EXCLUDED.last_risk_score >= Customer_Security_Posture.last_risk_score THEN EXCLUDED.risk_level
                ELSE Customer_Security_Posture.risk_level
            END,
            last_risk_score = GREATEST(Customer_Security_Posture.last_risk_score, EXCLUDED.last_risk_score),
            suspicious_request_count = Customer_Security_Posture.suspicious_request_count + $4,
            blocked_request_count = Customer_Security_Posture.blocked_request_count + $5,
            last_seen_at = NOW(),
            updated_at = NOW()`,
        [
            userId,
            analysis.riskLevel,
            analysis.riskScore,
            analysis.riskScore >= THRESHOLDS.elevated ? 1 : 0,
            analysis.blocked ? 1 : 0
        ]
    );
}

async function createIncidentIfNeeded(userId, eventType, analysis, details) {
    if (!userId || analysis.riskScore < THRESHOLDS.high) {
        return;
    }

    await db.query(
        `INSERT INTO Security_Incidents
            (user_id, category, status, severity, risk_score, summary, recommended_action, metadata)
         VALUES ($1, $2, 'open', $3, $4, $5, $6, $7::jsonb)`,
        [
            userId,
            eventType,
            analysis.severity,
            analysis.riskScore,
            analysis.summary,
            analysis.blocked
                ? 'Request was blocked automatically. Review token integrity, login activity, and automation ownership.'
                : 'Review activity, rotate sensitive tokens if needed, and confirm the actor is legitimate.',
            JSON.stringify({
                signals: analysis.signals,
                details: details || {}
            })
        ]
    );

    await db.query(
        `UPDATE Customer_Security_Posture
         SET compromised_signals = compromised_signals + 1,
             last_incident_at = NOW(),
             updated_at = NOW()
         WHERE user_id = $1`,
        [userId]
    );
}

async function recordSecurityEvent({
    req,
    userId = null,
    actorType = 'anonymous',
    eventType,
    details = {},
    baseRisk = 0,
    failedAuth = false,
    blocked = false,
    forceCritical = null
}) {
    const analysis = await analyzeRequest(req, {
        baseRisk,
        failedAuth,
        blocked,
        forceCritical
    });

    await db.query(
        `INSERT INTO Security_Events
            (user_id, actor_type, event_type, severity, risk_score, blocked, ip_address, user_agent, fingerprint, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
        [
            userId,
            actorType,
            eventType,
            analysis.severity,
            analysis.riskScore,
            analysis.blocked,
            analysis.ipAddress,
            analysis.userAgent,
            analysis.fingerprint,
            JSON.stringify({
                summary: analysis.summary,
                signals: analysis.signals,
                ...details
            })
        ]
    );

    await upsertSecurityPosture(userId, analysis);
    await createIncidentIfNeeded(userId, eventType, analysis, details);

    return analysis;
}

function analyzeAutomationMessage(commentText = '') {
    const normalized = String(commentText || '').toLowerCase();
    const signals = [];
    let riskScore = 0;

    if (/(refund|chargeback|scam|hack|fake|fraud|stolen)/.test(normalized)) {
        signals.push('Comment contains security or fraud language.');
        riskScore += 35;
    }

    if (/(whatsapp|telegram|dm me|call me)/.test(normalized)) {
        signals.push('Comment tries to move the conversation off-platform quickly.');
        riskScore += 15;
    }

    if (normalized.length > 350) {
        signals.push('Comment is unusually long for an automation trigger.');
        riskScore += 10;
    }

    return {
        riskScore: Math.min(100, riskScore),
        severity: toSeverity(riskScore),
        signals
    };
}

async function recordAutomationThreat({
    userId,
    automationId,
    followerPlatformId,
    commentText,
    eventType,
    blocked = false,
    extra = {}
}) {
    const analysis = analyzeAutomationMessage(commentText);
    const details = {
        automationId,
        followerPlatformId,
        commentPreview: String(commentText || '').slice(0, 240),
        automationSignals: analysis.signals,
        ...extra
    };

    await db.query(
        `INSERT INTO Security_Events
            (user_id, actor_type, event_type, severity, risk_score, blocked, ip_address, user_agent, fingerprint, details)
         VALUES ($1, 'platform-user', $2, $3, $4, $5, 'platform', 'platform-webhook', $6, $7::jsonb)`,
        [
            userId,
            eventType,
            analysis.severity,
            analysis.riskScore,
            blocked,
            crypto.createHash('sha256').update(`${automationId}:${followerPlatformId}`).digest('hex'),
            JSON.stringify(details)
        ]
    );

    await upsertSecurityPosture(userId, {
        riskLevel: toRiskLevel(analysis.riskScore),
        riskScore: analysis.riskScore,
        blocked
    });

    if (analysis.riskScore >= THRESHOLDS.high || blocked) {
        await createIncidentIfNeeded(userId, eventType, {
            ...analysis,
            blocked,
            summary: analysis.signals.join(' ') || 'Automation risk exceeded safe threshold.'
        }, details);
    }

    return analysis;
}

async function getSecurityOverview(userId) {
    const [postureResult, eventResult, incidentResult] = await Promise.all([
        db.query('SELECT * FROM Customer_Security_Posture WHERE user_id = $1', [userId]),
        db.query(
            `SELECT id, event_type, severity, risk_score, blocked, details, created_at
             FROM Security_Events
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 25`,
            [userId]
        ),
        db.query(
            `SELECT id, category, status, severity, risk_score, summary, recommended_action, created_at
             FROM Security_Incidents
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 10`,
            [userId]
        )
    ]);

    return {
        posture: postureResult.rows[0] || {
            risk_level: 'normal',
            last_risk_score: 0,
            suspicious_request_count: 0,
            blocked_request_count: 0,
            compromised_signals: 0
        },
        recentEvents: eventResult.rows,
        incidents: incidentResult.rows
    };
}

async function listPlatformIncidents(limit = 25) {
    const result = await db.query(
        `SELECT si.id, si.user_id, u.full_name, u.platform_user_id, si.category, si.status, si.severity, si.risk_score, si.summary, si.created_at
         FROM Security_Incidents si
         LEFT JOIN Users u ON u.id = si.user_id
         ORDER BY si.created_at DESC
         LIMIT $1`,
        [limit]
    );

    return result.rows;
}

async function getPlatformSecurityStats() {
    const result = await db.query(`
        SELECT
            (SELECT COUNT(*)::int FROM Users WHERE is_active = true) AS active_users,
            (SELECT COUNT(*)::int FROM Security_Incidents WHERE status = 'open') AS open_incidents,
            (SELECT COUNT(*)::int FROM Security_Events WHERE blocked = true AND created_at >= NOW() - INTERVAL '24 hours') AS blocked_24h,
            (SELECT COUNT(*)::int FROM Auth_Sessions WHERE revoked_at IS NULL AND expires_at > NOW()) AS active_sessions
    `);

    return result.rows[0];
}

async function resolveIncident(userId, incidentId, resolutionNote) {
    const result = await db.query(
        `UPDATE Security_Incidents
         SET status = 'resolved',
             metadata = metadata || jsonb_build_object('resolutionNote', $3, 'resolvedAt', NOW()),
             updated_at = NOW()
         WHERE id = $1
           AND user_id = $2
         RETURNING id, status, updated_at`,
        [incidentId, userId, resolutionNote || 'Resolved by customer']
    );

    return result.rows[0] || null;
}

module.exports = {
    THRESHOLDS,
    getFingerprint,
    analyzeRequest,
    recordSecurityEvent,
    recordAutomationThreat,
    getSecurityOverview,
    listPlatformIncidents,
    getPlatformSecurityStats,
    resolveIncident
};
