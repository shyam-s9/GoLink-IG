const express = require('express');
const http = require('http');
const crypto = require('crypto');
const helmet = require('helmet');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const axios = require('axios');
require('dotenv').config();

const db = require('./db');
const { messageQueue } = require('./queue');
const { encrypt } = require('./src/services/cryptoService');
const { refreshToLongLivedToken } = require('./src/services/platformService');
const { importRecentReels, saveReelAutomation } = require('./src/controllers/reelsController');
const { captureRawBody, validateWebhookSignature } = require('./src/middleware/auth');
const { attachRequestContext } = require('./src/middleware/requestContext');
const { authenticateSession } = require('./src/middleware/sessionAuth');
const { createSessionToken, createStateToken, verifyStateToken, SESSION_TTL_MS } = require('./src/services/sessionService');
const { recordSecurityEvent, getSecurityOverview } = require('./src/services/securityAgentService');

const PORT = Number(process.env.PORT || 3001);
const CLIENT_URL = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
const BACKEND_URL = (process.env.BACKEND_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;

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

function buildAuthUrl(state) {
    const scopes = [
        'instagram_basic',
        'instagram_manage_comments',
        'instagram_manage_messages',
        'pages_show_list',
        'pages_read_engagement'
    ];

    const callbackUrl = `${BACKEND_URL}/auth/callback`;
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

async function initializeDatabase() {
    await db.query(`
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

        CREATE TABLE IF NOT EXISTS Users (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            platform_user_id VARCHAR UNIQUE NOT NULL,
            full_name VARCHAR,
            access_token TEXT NOT NULL,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            last_login_at TIMESTAMP,
            last_login_ip VARCHAR,
            last_security_scan_at TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS Reels_Automation (
            id SERIAL PRIMARY KEY,
            user_id UUID REFERENCES Users(id) ON DELETE CASCADE,
            reel_id VARCHAR NOT NULL,
            trigger_keyword VARCHAR NOT NULL,
            public_reply_text TEXT,
            affiliate_link TEXT NOT NULL,
            is_enabled BOOLEAN DEFAULT true,
            total_delivered INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS Analytics (
            id SERIAL PRIMARY KEY,
            automation_id INTEGER REFERENCES Reels_Automation(id) ON DELETE CASCADE,
            follower_platform_id VARCHAR,
            action_type VARCHAR,
            sentiment_score FLOAT,
            sentiment_label VARCHAR,
            timestamp TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS Leads (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID REFERENCES Users(id) ON DELETE CASCADE,
            platform_handle VARCHAR,
            email VARCHAR,
            lead_score INTEGER DEFAULT 0,
            source VARCHAR DEFAULT 'PLATFORM_AUTOMATION',
            status VARCHAR DEFAULT 'NEW',
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS Customer_Security_Posture (
            user_id UUID PRIMARY KEY REFERENCES Users(id) ON DELETE CASCADE,
            risk_level VARCHAR DEFAULT 'normal',
            last_risk_score INTEGER DEFAULT 0,
            suspicious_request_count INTEGER DEFAULT 0,
            blocked_request_count INTEGER DEFAULT 0,
            compromised_signals INTEGER DEFAULT 0,
            last_incident_at TIMESTAMP,
            last_seen_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS Security_Events (
            id BIGSERIAL PRIMARY KEY,
            user_id UUID REFERENCES Users(id) ON DELETE SET NULL,
            actor_type VARCHAR DEFAULT 'anonymous',
            event_type VARCHAR NOT NULL,
            severity VARCHAR DEFAULT 'low',
            risk_score INTEGER DEFAULT 0,
            blocked BOOLEAN DEFAULT false,
            ip_address VARCHAR,
            user_agent TEXT,
            fingerprint VARCHAR,
            details JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS Security_Incidents (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID REFERENCES Users(id) ON DELETE CASCADE,
            category VARCHAR NOT NULL,
            status VARCHAR DEFAULT 'open',
            severity VARCHAR DEFAULT 'medium',
            risk_score INTEGER DEFAULT 0,
            summary TEXT,
            recommended_action TEXT,
            metadata JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );

        ALTER TABLE Users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
        ALTER TABLE Users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
        ALTER TABLE Users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR;
        ALTER TABLE Users ADD COLUMN IF NOT EXISTS last_security_scan_at TIMESTAMP;
        ALTER TABLE Reels_Automation ADD COLUMN IF NOT EXISTS user_id UUID;
        ALTER TABLE Reels_Automation ADD COLUMN IF NOT EXISTS public_reply_text TEXT;
        ALTER TABLE Reels_Automation ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
        ALTER TABLE Analytics ADD COLUMN IF NOT EXISTS sentiment_score FLOAT;
        ALTER TABLE Analytics ADD COLUMN IF NOT EXISTS sentiment_label VARCHAR;
        ALTER TABLE Leads ADD COLUMN IF NOT EXISTS source VARCHAR DEFAULT 'PLATFORM_AUTOMATION';
        ALTER TABLE Leads ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'NEW';
    `);

    await db.query(`ALTER TABLE Users RENAME COLUMN ig_user_id TO platform_user_id;`).catch(() => {});
    await db.query(`ALTER TABLE Analytics RENAME COLUMN follower_ig_id TO follower_platform_id;`).catch(() => {});
    await db.query(`ALTER TABLE Leads RENAME COLUMN ig_handle TO platform_handle;`).catch(() => {});
    await db.query(`ALTER TABLE Reels_Automation ADD CONSTRAINT reels_automation_user_id_fkey FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE;`).catch(() => {});

    await db.query('CREATE INDEX IF NOT EXISTS idx_security_events_user_created ON Security_Events(user_id, created_at DESC)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_security_events_fingerprint_created ON Security_Events(fingerprint, created_at DESC)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_automation_user_enabled ON Reels_Automation(user_id, is_enabled)');
}

async function bootstrapMasterAccount() {
    const masterToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const masterId = process.env.MASTER_PLATFORM_USER_ID || '17841477997409764';
    if (!masterToken) {
        return;
    }

    const encryptedToken = encrypt(masterToken);
    await db.query(
        `INSERT INTO Users (platform_user_id, full_name, access_token, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (platform_user_id) DO UPDATE SET access_token = $3, updated_at = NOW()`,
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

app.get('/', (req, res) => {
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

app.get('/auth/url', async (req, res) => {
    const state = createStateToken({ nonce: crypto.randomUUID(), requestId: req.requestId });
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

    res.json({ url: buildAuthUrl(state) });
});

app.get('/auth/callback', async (req, res) => {
    const { code, state } = req.query;
    const stateCookie = req.cookies.oauth_state;

    if (!code || !state || !stateCookie || state !== stateCookie || !verifyStateToken(state)) {
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

        const userRes = await axios.get('https://graph.facebook.com/v19.0/me', {
            params: {
                access_token: longLivedToken,
                fields: 'id,name'
            }
        });

        const platformUserId = String(userRes.data.id);
        const fullName = sanitizeDisplayName(userRes.data.name);
        const encryptedToken = encrypt(longLivedToken);

        const userQuery = await db.query(
            `INSERT INTO Users (platform_user_id, full_name, access_token, updated_at, last_login_at, last_login_ip, last_security_scan_at)
             VALUES ($1, $2, $3, NOW(), NOW(), $4, NOW())
             ON CONFLICT (platform_user_id) DO UPDATE SET
                full_name = EXCLUDED.full_name,
                access_token = EXCLUDED.access_token,
                updated_at = NOW(),
                last_login_at = NOW(),
                last_login_ip = EXCLUDED.last_login_ip,
                last_security_scan_at = NOW()
             RETURNING id, platform_user_id, full_name`,
            [platformUserId, fullName, encryptedToken, req.headers['x-forwarded-for'] || req.socket.remoteAddress || null]
        );

        const user = userQuery.rows[0];
        const sessionToken = createSessionToken({
            userId: user.id,
            platformUserId: user.platform_user_id,
            fullName: user.full_name
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
            details: { platformUserId: user.platform_user_id }
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

app.post('/auth/logout', authenticateSession, async (req, res) => {
    clearCookie(res, 'auth_token');
    await recordSecurityEvent({
        req,
        userId: req.user.userId,
        actorType: 'customer',
        eventType: 'logout'
    });
    res.json({ ok: true });
});

app.get('/api/me', authenticateSession, async (req, res) => {
    const userQuery = await db.query(
        'SELECT id, platform_user_id, full_name, is_active, last_login_at, last_security_scan_at FROM Users WHERE id = $1',
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
            isActive: userQuery.rows[0].is_active,
            lastLoginAt: userQuery.rows[0].last_login_at,
            lastSecurityScanAt: userQuery.rows[0].last_security_scan_at
        }
    });
});

app.get('/api/reels/import', authenticateSession, importRecentReels);
app.post('/api/reels/save', authenticateSession, saveReelAutomation);

app.get('/api/security/overview', authenticateSession, async (req, res) => {
    const overview = await getSecurityOverview(req.user.userId);
    res.json(overview);
});

app.get('/api/security/recommendations', authenticateSession, async (req, res) => {
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

app.get('/webhook/instagram', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === FB_VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }

    res.status(403).send('Verification failed');
});

app.post('/webhook/instagram', validateWebhookSignature, async (req, res) => {
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
                if (!commentText.toLowerCase().includes(String(config.trigger_keyword).toLowerCase())) {
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

app.use(async (err, req, res, next) => {
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

    server.listen(PORT, () => {
        console.log(`[server] GoLink security backend listening on ${PORT}`);
    });
}

start().catch((error) => {
    console.error('[server] startup failed', error);
    process.exit(1);
});
