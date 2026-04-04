const express = require('express');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const axios = require('axios');
require('dotenv').config();

const db = require('./db');
const { messageQueue } = require('./queue');
const { encrypt } = require('./src/services/cryptoService');
const { refreshToLongLivedToken, getAppSecretProof } = require('./src/services/platformService');
const { importRecentReels, listReelAutomations, saveReelAutomation } = require('./src/controllers/reelsController');
const { captureRawBody, validateWebhookSignature } = require('./src/middleware/auth');
const { attachRequestContext } = require('./src/middleware/requestContext');
const { authenticateSession } = require('./src/middleware/sessionAuth');
const { createRateLimiter } = require('./src/middleware/rateLimit');
const { requireRole } = require('./src/middleware/rbac');
const { createSessionToken, SESSION_TTL_MS } = require('./src/services/sessionService');
const { issueOauthState, isValidOauthState } = require('./src/services/authFlowService');
const { recordSecurityEvent, getSecurityOverview, listPlatformIncidents, getPlatformSecurityStats, resolveIncident } = require('./src/services/securityAgentService');
const { writeAuditLog, getAuditTrail } = require('./src/services/auditLogService');
const { createSession, revokeSession, revokeAllOtherSessions, listUserSessions } = require('./src/services/sessionStoreService');
const { generateCsrfToken, doubleCsrfProtection, invalidCsrfTokenError } = require('./src/services/csrfService');
const { registerRecurringJobs } = require('./src/services/maintenanceScheduler');
const { getSystemHealth } = require('./src/services/systemHealthService');
const { expressesIntent } = require('./src/services/intentService');

const PORT = Number(process.env.PORT || 3001);
const CLIENT_URL = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
const BACKEND_URL = (process.env.BACKEND_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;
const AUTH_PROVIDER = String(process.env.AUTH_PROVIDER || 'facebook').toLowerCase();
const ADMIN_PLATFORM_USER_IDS = new Set(
    [process.env.MASTER_PLATFORM_USER_ID, ...(process.env.ADMIN_PLATFORM_USER_IDS || '').split(',')]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
);
const CLIENT_STATIC_DIR = path.join(__dirname, 'client', 'out');
const CLIENT_INDEX_FILE = path.join(CLIENT_STATIC_DIR, 'index.html');
const generalRateLimit = createRateLimiter({ windowMs: 60 * 1000, max: 120, prefix: 'general' });
const authRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 25, prefix: 'auth' });
const securityRateLimit = createRateLimiter({ windowMs: 60 * 1000, max: 30, prefix: 'security' });
const adminRateLimit = createRateLimiter({ windowMs: 60 * 1000, max: 60, prefix: 'admin' });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: CLIENT_URL,
        methods: ['GET', 'POST'],
        credentials: true
    }
});

const redisSub = new Redis(process.env.REDIS_URL, {
    retryStrategy: (times) => Math.min(times * 50, 2000),
    maxRetriesPerRequest: null
});

process.on('uncaughtException', (err) => {
    console.error('[fatal] uncaught exception', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('[fatal] unhandled rejection', reason);
});

redisSub.on('error', (error) => {
    console.error('[redis] subscriber error', error.message);
});

redisSub.subscribe('lead-health-update');
redisSub.on('message', (channel, message) => {
    if (channel !== 'lead-health-update') {
        return;
    }

    try {
        io.emit('sentiment-push', JSON.parse(message));
    } catch (error) {
        console.error('[socket] failed to forward redis payload', error.message);
    }
});

function setCookie(res, name, value, options = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`];
    if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
    if (options.httpOnly) parts.push('HttpOnly');
    if (options.path) parts.push(`Path=${options.path}`);
    if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
    if (options.secure) parts.push('Secure');
    res.append('Set-Cookie', parts.join('; '));
}

function clearCookie(res, name) {
    res.append('Set-Cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

function sanitizeDisplayName(name) {
    return String(name || 'Creator').replace(/[^a-zA-Z0-9\s._-]/g, '').trim().slice(0, 80) || 'Creator';
}

function determineUserRole(platformUserId) {
    return ADMIN_PLATFORM_USER_IDS.has(String(platformUserId)) ? 'ADMIN' : 'CUSTOMER';
}

function buildAuthUrl(state) {
    const scopes = [
        'instagram_basic',
        'instagram_manage_comments',
        'instagram_manage_messages',
        'pages_show_list',
        'pages_read_engagement'
    ];

    const callbackUrl = `${BACKEND_URL}/auth/callback`;
    if (AUTH_PROVIDER === 'instagram') {
        return `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${encodeURIComponent(FB_APP_ID)}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=${encodeURIComponent(scopes.join(','))}&response_type=code&state=${encodeURIComponent(state)}`;
    }

    return `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(FB_APP_ID)}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=${encodeURIComponent(scopes.join(','))}&response_type=code&state=${encodeURIComponent(state)}`;
}

function ensureEnv() {
    const required = ['DATABASE_URL', 'REDIS_URL', 'ENCRYPTION_KEY', 'FB_APP_ID', 'FB_APP_SECRET', 'FB_VERIFY_TOKEN'];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length) {
        console.warn(`[config] missing env vars: ${missing.join(', ')}`);
    } else {
        console.log('[config] core environment variables detected.');
    }
}

function hasBuiltClient() {
    return fs.existsSync(CLIENT_INDEX_FILE);
}

async function resolvePlatformAccount(longLivedToken) {
    const appSecretProof = getAppSecretProof(longLivedToken);

    const meResponse = await axios.get('https://graph.facebook.com/v19.0/me', {
        params: {
            access_token: longLivedToken,
            appsecret_proof: appSecretProof,
            fields: 'id,name'
        }
    });

    try {
        const pagesResponse = await axios.get('https://graph.facebook.com/v19.0/me/accounts', {
            params: {
                access_token: longLivedToken,
                appsecret_proof: appSecretProof,
                fields: 'id,name,instagram_business_account{id,username,name}'
            }
        });

        const pageWithInstagram = (pagesResponse.data.data || []).find((page) => page.instagram_business_account?.id);
        if (pageWithInstagram?.instagram_business_account?.id) {
            return {
                platformUserId: String(pageWithInstagram.instagram_business_account.id),
                fullName: sanitizeDisplayName(
                    pageWithInstagram.instagram_business_account.name ||
                    pageWithInstagram.instagram_business_account.username ||
                    meResponse.data.name
                ),
                authContext: {
                    source: 'instagram_business_account',
                    pageId: pageWithInstagram.id,
                    pageName: pageWithInstagram.name
                }
            };
        }
    } catch (error) {
        console.warn('[auth] could not resolve page-linked instagram business account, falling back to /me', error.response?.data || error.message);
    }

    return {
        platformUserId: String(meResponse.data.id),
        fullName: sanitizeDisplayName(meResponse.data.name),
        authContext: {
            source: 'me-fallback'
        }
    };
}

async function initializeDatabase() {
    await db.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    await db.query(`ALTER TABLE Users RENAME COLUMN ig_user_id TO platform_user_id;`).catch(() => {});
    await db.query(`ALTER TABLE Analytics RENAME COLUMN follower_ig_id TO follower_platform_id;`).catch(() => {});
    await db.query(`ALTER TABLE Leads RENAME COLUMN ig_handle TO platform_handle;`).catch(() => {});
    await db.query(`ALTER TABLE Users ADD COLUMN IF NOT EXISTS role VARCHAR DEFAULT 'CUSTOMER';`).catch(() => {});
    await db.query(`ALTER TABLE Users ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP;`).catch(() => {});
    await db.query(`ALTER TABLE Reels_Automation ADD COLUMN IF NOT EXISTS user_id UUID;`).catch(() => {});
    await db.query(`ALTER TABLE Reels_Automation ADD CONSTRAINT reels_automation_user_id_fkey FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE;`).catch(() => {});

    await db.query('CREATE INDEX IF NOT EXISTS idx_security_events_user_created ON Security_Events(user_id, created_at DESC)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_security_events_fingerprint_created ON Security_Events(fingerprint, created_at DESC)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_automation_user_enabled ON Reels_Automation(user_id, is_enabled)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_created ON Auth_Sessions(user_id, created_at DESC)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_audit_log_user_created ON Audit_Log(user_id, created_at DESC)');
}

async function bootstrapMasterAccount() {
    const masterToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const masterId = process.env.MASTER_PLATFORM_USER_ID || '17841477997409764';
    if (!masterToken) {
        return;
    }

    const encryptedToken = encrypt(masterToken);
    await db.query(
        `INSERT INTO Users (platform_user_id, full_name, access_token, role, token_expires_at, updated_at)
         VALUES ($1, $2, $3, 'ADMIN', NOW() + INTERVAL '60 days', NOW())
         ON CONFLICT (platform_user_id) DO UPDATE SET access_token = $3, role = 'ADMIN', token_expires_at = NOW() + INTERVAL '60 days', updated_at = NOW()`,
        [masterId, 'Master Admin', encryptedToken]
    );
}

app.set('trust proxy', 1);
app.use(attachRequestContext);
app.use(express.json({ verify: captureRawBody, limit: '1mb' }));
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(generalRateLimit);

app.use(async (req, res, next) => {
    const openRoutes = ['/health', '/auth/url', '/auth/callback', '/webhook/instagram', '/'];
    const shouldMonitor = !openRoutes.includes(req.path) || req.method !== 'GET';

    if (!shouldMonitor) {
        return next();
    }

    try {
        const analysis = await recordSecurityEvent({
            req,
            eventType: `request:${req.method.toLowerCase()}:${req.path}`,
            details: { route: req.path, method: req.method }
        });

        req.securityAnalysis = analysis;
        if (analysis.riskScore >= 92) {
            return res.status(429).json({
                message: 'Request blocked by undercover security agent.',
                riskLevel: analysis.riskLevel,
                requestId: req.requestId
            });
        }
    } catch (error) {
        console.error('[security] request monitoring failed', error.message);
    }

    next();
});

app.get('/health', async (req, res) => {
    const dbCheck = await db.query('SELECT NOW() AS now');
    res.json({
        ok: true,
        service: 'golink-security-backend',
        time: dbCheck.rows[0].now,
        undercoverSecurityAgent: 'active'
    });
});

app.get('/api/csrf-token', async (req, res) => {
    const csrfToken = generateCsrfToken(req, res, {
        overwrite: true,
        validateOnReuse: false
    });
    res.json({ csrfToken });
});

app.get('/', (req, res) => {
    if (hasBuiltClient()) {
        return res.sendFile(CLIENT_INDEX_FILE);
    }

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>GoLink Auto Security Backend</title>
<style>
:root {
  --bg: #07111f;
  --card: rgba(10, 25, 47, 0.82);
  --line: rgba(148, 163, 184, 0.18);
  --text: #e2e8f0;
  --muted: #93a4ba;
  --accent: #2dd4bf;
  --warn: #f59e0b;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  background: radial-gradient(circle at top, #123157 0%, #07111f 58%, #030712 100%);
  color: var(--text);
  min-height: 100vh;
}
main {
  max-width: 980px;
  margin: 0 auto;
  padding: 56px 24px 72px;
}
.hero {
  border: 1px solid var(--line);
  background: linear-gradient(160deg, rgba(14, 35, 64, 0.92), rgba(6, 16, 30, 0.92));
  border-radius: 28px;
  padding: 40px;
  box-shadow: 0 30px 80px rgba(0,0,0,0.35);
}
.kicker {
  display: inline-flex;
  gap: 10px;
  align-items: center;
  border-radius: 999px;
  border: 1px solid rgba(45, 212, 191, 0.35);
  background: rgba(45, 212, 191, 0.08);
  color: var(--accent);
  padding: 8px 14px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-top: 28px;
}
.card {
  border: 1px solid var(--line);
  background: var(--card);
  border-radius: 20px;
  padding: 20px;
}
a.button {
  display: inline-block;
  margin-top: 24px;
  text-decoration: none;
  color: #001018;
  background: linear-gradient(135deg, #2dd4bf, #7dd3fc);
  padding: 14px 20px;
  border-radius: 14px;
  font-weight: 700;
}
small { color: var(--muted); }
</style>
</head>
<body>
<main>
  <section class="hero">
    <span class="kicker">Undercover Security Agent Active</span>
    <h1>Customer-safe automation backend</h1>
    <p>This backend now prioritizes secure account linking, monitored webhook intake, protected reel automation, and risk-based incident tracking to help prevent customer accounts from being abused or hijacked.</p>
    <a class="button" href="/auth/url">Connect Instagram Securely</a>
    <div class="grid">
      <div class="card">
        <h3>Threat Monitoring</h3>
        <small>Every sensitive request is scored and logged before high-risk traffic can reach customer actions.</small>
      </div>
      <div class="card">
        <h3>Safer Sessions</h3>
        <small>Short-lived signed sessions and OAuth state validation reduce token theft and callback abuse.</small>
      </div>
      <div class="card">
        <h3>Automation Guardrails</h3>
        <small>Comment and DM workflows can now create incidents when fraud or compromise signals appear.</small>
      </div>
    </div>
  </section>
</main>
</body>
</html>`);
});

app.get('/auth/url', authRateLimit, async (req, res) => {
    const state = issueOauthState(req.requestId);
    setCookie(res, 'oauth_state', state, {
        httpOnly: true,
        maxAge: 10 * 60 * 1000,
        path: '/',
        sameSite: 'Lax',
        secure: process.env.NODE_ENV === 'production'
    });

    await recordSecurityEvent({
        req,
        eventType: 'oauth-start',
        details: { requestId: req.requestId },
        actorType: 'visitor'
    });
    await writeAuditLog({
        actorType: 'visitor',
        action: 'oauth.start',
        requestId: req.requestId,
        metadata: { ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null }
    });

    res.json({ url: buildAuthUrl(state) });
});

app.get('/auth/callback', authRateLimit, async (req, res) => {
    const { code, state } = req.query;
    const stateCookie = req.cookies.oauth_state;

    if (!code || !isValidOauthState(state, stateCookie)) {
        await recordSecurityEvent({
            req,
            eventType: 'oauth-state-mismatch',
            failedAuth: true,
            blocked: true,
            forceCritical: 'OAuth callback state validation failed.',
            details: { hasCode: Boolean(code), hasState: Boolean(state) }
        });
        clearCookie(res, 'oauth_state');
        return res.redirect(`${CLIENT_URL}?auth=error&reason=state_mismatch`);
    }

    try {
        const callbackUrl = `${BACKEND_URL}/auth/callback`;
        const tokenRes = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
            params: {
                client_id: FB_APP_ID,
                client_secret: FB_APP_SECRET,
                redirect_uri: callbackUrl,
                code
            }
        });

        const shortLivedToken = tokenRes.data.access_token;
        const longLivedToken = await refreshToLongLivedToken(shortLivedToken);

        const account = await resolvePlatformAccount(longLivedToken);
        const platformUserId = account.platformUserId;
        const fullName = account.fullName;
        const encryptedToken = encrypt(longLivedToken);
        const role = determineUserRole(platformUserId);

        const userQuery = await db.query(
            `INSERT INTO Users (platform_user_id, full_name, access_token, role, token_expires_at, updated_at, last_login_at, last_login_ip, last_security_scan_at)
             VALUES ($1, $2, $3, $4, NOW() + INTERVAL '60 days', NOW(), NOW(), $5, NOW())
             ON CONFLICT (platform_user_id) DO UPDATE SET
                full_name = EXCLUDED.full_name,
                access_token = EXCLUDED.access_token,
                role = EXCLUDED.role,
                token_expires_at = NOW() + INTERVAL '60 days',
                updated_at = NOW(),
                last_login_at = NOW(),
                last_login_ip = EXCLUDED.last_login_ip,
                last_security_scan_at = NOW()
             RETURNING id, platform_user_id, full_name, role`,
            [platformUserId, fullName, encryptedToken, role, req.headers['x-forwarded-for'] || req.socket.remoteAddress || null]
        );

        const user = userQuery.rows[0];
        const sessionId = await createSession({
            userId: user.id,
            ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null,
            userAgent: req.headers['user-agent'] || 'unknown',
            fingerprint: req.securityAnalysis?.fingerprint || null
        });
        const sessionToken = createSessionToken({
            userId: user.id,
            platformUserId: user.platform_user_id,
            fullName: user.full_name,
            role: user.role,
            sessionId
        });

        setCookie(res, 'auth_token', sessionToken, {
            httpOnly: true,
            maxAge: SESSION_TTL_MS,
            path: '/',
            sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
            secure: process.env.NODE_ENV === 'production'
        });
        clearCookie(res, 'oauth_state');

        await recordSecurityEvent({
            req,
            userId: user.id,
            actorType: 'customer',
            eventType: 'oauth-success',
            details: { platformUserId: user.platform_user_id, authSource: account.authContext.source }
        });
        await writeAuditLog({
            userId: user.id,
            actorType: 'customer',
            action: 'auth.login',
            targetType: 'session',
            targetId: sessionId,
            requestId: req.requestId,
            metadata: {
                platformUserId: user.platform_user_id,
                authContext: account.authContext
            }
        });

        res.redirect(`${CLIENT_URL}?auth=success`);
    } catch (error) {
        console.error('[auth] callback failed', error.response?.data || error.message);
        await recordSecurityEvent({
            req,
            eventType: 'oauth-exchange-failed',
            failedAuth: true,
            details: { upstream: error.response?.data || error.message }
        });
        clearCookie(res, 'oauth_state');
        res.redirect(`${CLIENT_URL}?auth=error`);
    }
});

app.post('/auth/logout', authenticateSession, doubleCsrfProtection, async (req, res) => {
    await revokeSession(req.user.sessionId, 'customer-logout');
    clearCookie(res, 'auth_token');
    await recordSecurityEvent({
        req,
        userId: req.user.userId,
        actorType: 'customer',
        eventType: 'logout'
    });
    await writeAuditLog({
        userId: req.user.userId,
        actorType: 'customer',
        action: 'auth.logout',
        targetType: 'session',
        targetId: req.user.sessionId,
        requestId: req.requestId
    });
    res.json({ ok: true });
});

app.get('/api/me', authenticateSession, async (req, res) => {
    const userQuery = await db.query(
        'SELECT id, platform_user_id, full_name, role, is_active, last_login_at, last_security_scan_at FROM Users WHERE id = $1',
        [req.user.userId]
    );

    if (!userQuery.rows.length) {
        return res.status(404).json({ message: 'User not found.' });
    }

    res.json({
        user: {
            id: userQuery.rows[0].id,
            platformUserId: userQuery.rows[0].platform_user_id,
            fullName: userQuery.rows[0].full_name,
            role: userQuery.rows[0].role,
            isActive: userQuery.rows[0].is_active,
            lastLoginAt: userQuery.rows[0].last_login_at,
            lastSecurityScanAt: userQuery.rows[0].last_security_scan_at
        }
    });
});

app.get('/api/health/system', authenticateSession, async (req, res) => {
    const systemHealth = await getSystemHealth();
    res.json({
        worker: {
            healthy: Boolean(systemHealth.worker?.healthy),
            lastHeartbeat: systemHealth.worker?.lastHeartbeat || null
        }
    });
});

app.get('/api/reels/import', authenticateSession, importRecentReels);
app.get('/api/reels/list', authenticateSession, listReelAutomations);
app.post('/api/reels/save', authenticateSession, doubleCsrfProtection, saveReelAutomation);

app.get('/api/leads', authenticateSession, async (req, res) => {
    const requestedStatus = String(req.query.status || '').trim();
    const params = [req.user.userId];
    let sql = `
        SELECT id, platform_handle, email, lead_score, source, status, created_at
        FROM Leads
        WHERE user_id = $1
    `;

    if (requestedStatus && requestedStatus.toLowerCase() !== 'all') {
        params.push(requestedStatus.toUpperCase());
        sql += ` AND UPPER(status) = $2`;
    }

    sql += ` ORDER BY created_at DESC`;

    const result = await db.query(sql, params);
    res.json({ leads: result.rows });
});

app.get('/api/security/overview', authenticateSession, securityRateLimit, async (req, res) => {
    const overview = await getSecurityOverview(req.user.userId);
    res.json(overview);
});

app.get('/api/security/recommendations', authenticateSession, securityRateLimit, async (req, res) => {
    const overview = await getSecurityOverview(req.user.userId);
    const recommendations = [];

    if (overview.posture.last_risk_score >= 65) {
        recommendations.push('Rotate customer platform tokens and review recent incidents immediately.');
    }
    if ((overview.posture.suspicious_request_count || 0) > 10) {
        recommendations.push('Investigate repeated suspicious request patterns and tighten admin access.');
    }
    if ((overview.posture.blocked_request_count || 0) === 0) {
        recommendations.push('Run a webhook replay test to validate the blocking path before production launch.');
    }
    if (!recommendations.length) {
        recommendations.push('Security posture is stable. Continue monitoring login callbacks and webhook events.');
    }

    res.json({ recommendations, posture: overview.posture });
});

app.get('/api/security/sessions', authenticateSession, securityRateLimit, async (req, res) => {
    const sessions = await listUserSessions(req.user.userId);
    res.json({
        currentSessionId: req.user.sessionId,
        sessions: sessions.map((session) => ({
            id: session.id,
            ipAddress: session.ip_address,
            userAgent: session.user_agent,
            expiresAt: session.expires_at,
            revokedAt: session.revoked_at,
            revokeReason: session.revoke_reason,
            lastSeenAt: session.last_seen_at,
            createdAt: session.created_at,
            isCurrent: req.user.sessionDbId === session.id
        }))
    });
});

app.post('/api/security/sessions/revoke-others', authenticateSession, securityRateLimit, doubleCsrfProtection, async (req, res) => {
    const revokedCount = await revokeAllOtherSessions(req.user.userId, req.user.sessionId, 'customer-security-hardening');
    await writeAuditLog({
        userId: req.user.userId,
        actorType: 'customer',
        action: 'security.revoke_other_sessions',
        targetType: 'session',
        targetId: req.user.sessionId,
        requestId: req.requestId,
        metadata: { revokedCount }
    });
    res.json({ ok: true, revokedCount });
});

app.get('/api/security/audit-trail', authenticateSession, securityRateLimit, async (req, res) => {
    const logs = await getAuditTrail(req.user.userId, 50);
    res.json({ logs });
});

app.post('/api/security/incidents/:incidentId/resolve', authenticateSession, securityRateLimit, doubleCsrfProtection, async (req, res) => {
    const incident = await resolveIncident(req.user.userId, req.params.incidentId, req.body?.note);
    if (!incident) {
        return res.status(404).json({ message: 'Incident not found.' });
    }

    await writeAuditLog({
        userId: req.user.userId,
        actorType: 'customer',
        action: 'security.resolve_incident',
        targetType: 'incident',
        targetId: req.params.incidentId,
        requestId: req.requestId,
        metadata: { note: req.body?.note || null }
    });
    res.json({ ok: true, incident });
});

app.get('/api/admin/security/overview', authenticateSession, requireRole('ADMIN', 'ANALYST'), adminRateLimit, async (req, res) => {
    const [stats, incidents] = await Promise.all([
        getPlatformSecurityStats(),
        listPlatformIncidents(20)
    ]);

    await writeAuditLog({
        actorType: 'admin',
        action: 'admin.view_security_overview',
        requestId: req.requestId
    });

    res.json({ stats, incidents });
});

app.get('/api/admin/system-health', authenticateSession, requireRole('ADMIN', 'ANALYST'), adminRateLimit, async (req, res) => {
    const systemHealth = await getSystemHealth();
    await writeAuditLog({
        userId: req.user.userId,
        actorType: 'admin',
        action: 'admin.view_system_health',
        requestId: req.requestId
    });
    res.json(systemHealth);
});

app.post('/api/admin/users/:userId/security-lock', authenticateSession, requireRole('ADMIN'), adminRateLimit, doubleCsrfProtection, async (req, res) => {
    const { lock = true, note = null } = req.body || {};
    const result = await db.query(
        `UPDATE Users
         SET is_active = $2,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, platform_user_id, full_name, is_active`,
        [req.params.userId, !lock]
    );

    if (!result.rows.length) {
        return res.status(404).json({ message: 'User not found.' });
    }

    if (lock) {
        await revokeAllOtherSessions(req.params.userId, null, 'admin-security-lock');
    }

    await writeAuditLog({
        userId: req.params.userId,
        actorType: 'admin',
        action: lock ? 'admin.lock_user' : 'admin.unlock_user',
        targetType: 'user',
        targetId: req.params.userId,
        requestId: req.requestId,
        metadata: { note }
    });

    res.json({ ok: true, user: result.rows[0] });
});

app.get('/webhook/instagram', authRateLimit, (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === FB_VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }

    res.status(403).send('Verification failed');
});

app.post('/webhook/instagram', authRateLimit, validateWebhookSignature, async (req, res) => {
    const entries = Array.isArray(req.body.entry) ? req.body.entry : [];
    res.sendStatus(200);

    for (const entry of entries) {
        const commentData = entry.changes?.[0]?.value;
        if (!commentData) {
            continue;
        }

        const creatorPlatformId = String(entry.id || '');
        const commentId = commentData.id;
        const commentText = String(commentData.text || '');
        const followerPlatformId = String(commentData.from?.id || '');
        const mediaId = String(commentData.media_id || '');

        try {
            const userQuery = await db.query(
                'SELECT id FROM Users WHERE platform_user_id = $1 AND is_active = true',
                [creatorPlatformId]
            );

            if (!userQuery.rows.length) {
                await recordSecurityEvent({
                    req,
                    eventType: 'webhook-unknown-creator',
                    blocked: true,
                    baseRisk: 45,
                    details: { creatorPlatformId, mediaId }
                });
                continue;
            }

            const userId = userQuery.rows[0].id;
            await recordSecurityEvent({
                req,
                userId,
                actorType: 'platform-webhook',
                eventType: 'webhook-comment-received',
                details: { creatorPlatformId, followerPlatformId, mediaId }
            });

            const configQuery = await db.query(
                'SELECT id, trigger_keyword, affiliate_link FROM Reels_Automation WHERE reel_id = $1 AND user_id = $2 AND is_enabled = true',
                [mediaId, userId]
            );

            for (const config of configQuery.rows) {
                const matchedIntent = await expressesIntent({
                    commentText,
                    triggerKeyword: config.trigger_keyword
                });

                if (!matchedIntent) {
                    continue;
                }

                await messageQueue.add('process-dm', {
                    creatorPlatformId,
                    followerPlatformId,
                    link: config.affiliate_link,
                    commentId,
                    automationId: config.id,
                    commentText
                }, {
                    delay: Math.floor(Math.random() * 3000) + 1000,
                    attempts: 3,
                    removeOnComplete: 100,
                    removeOnFail: 100
                });
            }
        } catch (error) {
            console.error('[webhook] processing failed', error.message);
            await recordSecurityEvent({
                req,
                eventType: 'webhook-processing-error',
                baseRisk: 30,
                details: { error: error.message, creatorPlatformId, mediaId }
            });
        }
    }
});

if (hasBuiltClient()) {
    app.use(express.static(CLIENT_STATIC_DIR, {
        extensions: ['html']
    }));

    app.get(/^\/(security|reels|leads|settings|login)(?:\/)?$/, (req, res) => {
        const relativePath = req.path === '/' ? 'index.html' : `${req.path.replace(/^\//, '')}.html`;
        const candidate = path.join(CLIENT_STATIC_DIR, relativePath);
        if (fs.existsSync(candidate)) {
            return res.sendFile(candidate);
        }
        return res.sendFile(CLIENT_INDEX_FILE);
    });
}

app.use(async (err, req, res, next) => {
    if (err === invalidCsrfTokenError || err?.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({ message: 'Invalid CSRF token.' });
    }

    console.error('[server] unhandled route error', err);
    try {
        await recordSecurityEvent({
            req,
            userId: req.user?.userId || null,
            eventType: 'application-error',
            baseRisk: 20,
            details: { message: err.message }
        });
    } catch (securityError) {
        console.error('[security] failed to record app error', securityError.message);
    }
    res.status(500).json({ message: 'Internal server error.' });
});

async function start() {
    ensureEnv();
    await initializeDatabase();
    await bootstrapMasterAccount();
    await registerRecurringJobs();

    server.listen(PORT, () => {
        console.log(`[server] GoLink security backend listening on ${PORT}`);
    });
}

start().catch((error) => {
    console.error('[server] startup failed', error);
    process.exit(1);
});
