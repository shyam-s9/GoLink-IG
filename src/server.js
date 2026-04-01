const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const db = require('./db');
const { messageQueue } = require('./queue');
const { validateWebhookSignature, captureRawBody } = require('./middleware/auth');
const { authenticateJWT } = require('./middleware/jwtAuth');

require('./jobs/tokenRefresh');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Middlewares
app.use(express.json({ verify: captureRawBody }));
app.use(cookieParser());
app.use(helmet({
    contentSecurityPolicy: false, // Disabled for inline dashboard styles as per requirement
}));

// Redis Subscriber for Real-Time Dashboard Events
const redisSub = new Redis(process.env.REDIS_URL);
redisSub.subscribe('lead-health-update');
redisSub.on('message', (channel, message) => {
    if (channel === 'lead-health-update') {
        const data = JSON.parse(message);
        io.emit('sentiment-push', data);
    }
});

// --- Professional Dashboard (Meta Review Ready) ---
app.get('/', (req, res) => {
    const dashboardHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>GoLink Auto | Professional Instagram Automation</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
        <style>
            :root {
                --bg: #0f172a;
                --card-bg: #1e293b;
                --primary: #38bdf8;
                --text: #f8fafc;
                --text-dim: #94a3b8;
                --accent: #22c55e;
            }
            body { 
                margin: 0; 
                font-family: 'Inter', sans-serif; 
                background: var(--bg); 
                color: var(--text); 
                display: flex; 
                flex-direction: column; 
                min-height: 100vh;
            }
            .container { max-width: 800px; margin: auto; padding: 2rem; text-align: center; }
            .header { margin-bottom: 3rem; }
            h1 { font-weight: 700; font-size: 2.5rem; letter-spacing: -1px; margin-bottom: 0.5rem; }
            .status-badge { 
                display: inline-flex; 
                align-items: center; 
                background: rgba(34, 197, 94, 0.1); 
                color: var(--accent); 
                padding: 0.5rem 1rem; 
                border-radius: 99px; 
                font-size: 0.875rem; 
                font-weight: 600;
                margin-bottom: 2rem;
            }
            .status-dot { width: 8px; height: 8px; background: var(--accent); border-radius: 50%; margin-right: 8px; box-shadow: 0 0 10px var(--accent); }
            .card { 
                background: var(--card-bg); 
                padding: 3rem; 
                border-radius: 24px; 
                border: 1px solid rgba(255,255,255,0.05);
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
            }
            p { color: var(--text-dim); line-height: 1.6; font-size: 1.1rem; }
            .btn { 
                display: inline-block; 
                background: var(--primary); 
                color: #000; 
                padding: 1rem 2.5rem; 
                border-radius: 12px; 
                text-decoration: none; 
                font-weight: 700; 
                margin-top: 2rem;
                transition: transform 0.2s, background 0.2s;
            }
            .btn:hover { background: #7dd3fc; transform: translateY(-2px); }
            footer { margin-top: auto; padding: 2rem; border-top: 1px solid rgba(255,255,255,0.05); font-size: 0.875rem; color: var(--text-dim); }
            footer a { color: var(--text-dim); text-decoration: none; margin: 0 10px; }
            footer a:hover { color: var(--primary); }
            .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-top: 3rem; text-align: left; }
            .feature-item { padding: 1rem; border-radius: 12px; background: rgba(255,255,255,0.02); }
            .feature-item h3 { font-size: 1rem; margin-bottom: 0.25rem; color: var(--text); }
            .feature-item p { font-size: 0.875rem; margin: 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="status-badge">
                    <span class="status-dot"></span>
                    System Online
                </div>
                <h1>GoLink Auto</h1>
                <p>Automate your Instagram engagement with AI-powered comment-to-DM funnels.</p>
            </div>
            
            <div class="card">
                <h2>Connect Your Account</h2>
                <p>Securely link your Instagram Business account via Meta to begin automating your growth.</p>
                <a href="/auth/url" class="btn">Connect Instagram</a>
                
                <div class="features">
                    <div class="feature-item">
                        <h3>Comment-to-DM</h3>
                        <p>Instantly send links to commenters who use your keywords.</p>
                    </div>
                    <div class="feature-item">
                        <h3>Sentiment Analysis</h3>
                        <p>Shield your brand by filtering negative interactions automatically.</p>
                    </div>
                    <div class="feature-item">
                        <h3>Lead Scoring</h3>
                        <p>Identify high-intent followers based on engagement patterns.</p>
                    </div>
                </div>
            </div>
        </div>
        <footer>
            <p>&copy; 2026 GoLink Auto. All rights reserved.</p>
            <a href="/privacy-policy">Privacy Policy</a> | 
            <a href="/terms">Terms of Service</a> | 
            <a href="/data-deletion">Data Deletion</a>
        </footer>
    </body>
    </html>
    `;
    res.send(dashboardHtml);
});

// --- Mandatory SaaS Routes ---
app.get('/privacy-policy', (req, res) => {
    res.send(`
        <body style="font-family:sans-serif; line-height:1.6; padding:40px; color:#333;">
            <h1>Privacy Policy for GoLink Auto</h1>
            <p>Last Updated: April 1, 2026</p>
            <p>GoLink Auto ("we", "our", or "us") respects your privacy and is committed to protecting your personal data. This policy explains how we handle your Instagram data when you use our service.</p>
            <h2>1. Data Collection</h2>
            <p>We access your Instagram account via Meta OAuth to monitor comments on your posts and send DMs on your behalf. We store your Instagram User ID and encrypted Access Tokens safely in our database.</p>
            <h2>2. Data Usage</h2>
            <p>Your data is used solely to provide the automated comment-to-DM service you configured. We do not sell or share your data with third parties.</p>
            <h2>3. Data Protection</h2>
            <p>All access tokens are encrypted using AES-256-GCM. We use industry-standard security protocols to prevent unauthorized access.</p>
            <h2>4. Your Rights</h2>
            <p>You can revoke access to GoLink Auto at any time via your Instagram settings. You can also request data deletion by following the instructions on our Data Deletion page.</p>
        </body>
    `);
});

app.get('/terms', (req, res) => {
    res.send(`
        <body style="font-family:sans-serif; line-height:1.6; padding:40px; color:#333;">
            <h1>Terms of Service</h1>
            <p>By using GoLink Auto, you agree to comply with Instagram's Community Guidelines and Platform Policies. GoLink Auto is not responsible for any actions taken by Instagram against your account due to misuse of automation.</p>
            <p>You agree to use this tool for legitimate marketing purposes and not for spamming users.</p>
        </body>
    `);
});

app.get('/data-deletion', (req, res) => {
    res.send(`
        <body style="font-family:sans-serif; line-height:1.6; padding:40px; color:#333;">
            <h1>Data Deletion Instructions</h1>
            <p>To request the deletion of your data from GoLink Auto, please follow these steps:</p>
            <ol>
                <li>Go to your Facebook Profile's "Settings & Privacy" menu.</li>
                <li>Click on "Settings" and then "Apps and Websites".</li>
                <li>Find "GoLink Auto" and click "Remove".</li>
                <li>Alternatively, send an email to support@golink-auto.com with your Instagram handle to request manual deletion of all records.</li>
            </ol>
        </body>
    `);
});

// --- Public Webhooks (Meta/Razorpay) ---
app.get('/webhook/instagram', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) res.status(200).send(challenge);
    else res.sendStatus(403);
});

app.post('/webhook/instagram', validateWebhookSignature, async (req, res) => {
    const { entry } = req.body;
    res.sendStatus(200);
    for (let event of entry) {
        const commentData = event.changes?.[0]?.value;
        if (!commentData) continue;
        const { id: commentId, text, from, media_id } = commentData;
        const creatorIgId = event.id; // The Page/User ID that received the comment

        try {
            // Meta Review Compliance: Verify the creator exists in our DB before processing
            const userQuery = await db.query('SELECT id FROM Users WHERE ig_user_id = $1 AND is_active = true', [creatorIgId]);
            if (userQuery.rows.length === 0) continue;

            const configQuery = await db.query('SELECT * FROM Reels_Automation WHERE reel_id = $1 AND is_enabled = true', [media_id]);
            for (let config of configQuery.rows) {
                if (text.toLowerCase().includes(config.trigger_keyword.toLowerCase())) {
                    await messageQueue.add('process-dm', {
                        creatorIgId, followerIgId: from.id, link: config.affiliate_link,
                        commentId, automationId: config.id, commentText: text
                    }, { delay: Math.floor(Math.random() * 3000) + 2000 });
                }
            }
        } catch (error) { console.error('Webhook error:', error.message); }
    }
});

// --- Auth Routes ---
const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

// --- Protected API Routes (15m Session) ---
app.get('/api/reels/import', authenticateJWT, importRecentReels);
app.post('/api/reels/save', authenticateJWT, saveReelAutomation);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`EMW Multi-Tenant Server running on port ${PORT}`);
});
