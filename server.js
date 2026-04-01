const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const db = require('./db');
const { messageQueue } = require('./queue');
const { encrypt } = require('./src/services/cryptoService');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- CRITICAL SECURITY & CONNECTION LOGGING ---
if (!process.env.FB_APP_ID) {
    console.error("❌ CRITICAL ERROR: FB_APP_ID is missing from your environment variables!");
    console.error("Please add FB_APP_ID to your .env file or Render settings. Current ID:", process.env.FB_APP_ID);
} else if (!process.env.BACKEND_URL) {
    console.error("❌ CRITICAL ERROR: BACKEND_URL is missing! Redirects will fail.");
} else {
    console.log("✅ OAuth Connected. FB_APP_ID & BACKEND_URL Initialized.");
}
// --- DATABASE INITIALIZATION ---
const initializeDatabase = async () => {
    try {
        console.log("Checking Database Tables & Migrations...");
        
        // 1. Core Tables
        await db.query(`
            CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
            CREATE TABLE IF NOT EXISTS Users (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                platform_user_id VARCHAR UNIQUE NOT NULL,
                full_name VARCHAR,
                access_token TEXT NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS Reels_Automation (
                id SERIAL PRIMARY KEY,
                user_id UUID REFERENCES Users(id),
                reel_id VARCHAR NOT NULL,
                trigger_keyword VARCHAR NOT NULL,
                affiliate_link TEXT NOT NULL,
                is_enabled BOOLEAN DEFAULT true,
                total_delivered INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS Analytics (
                id SERIAL PRIMARY KEY,
                automation_id INTEGER REFERENCES Reels_Automation(id),
                follower_platform_id VARCHAR,
                action_type VARCHAR,
                sentiment_score FLOAT,
                sentiment_label VARCHAR,
                timestamp TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS Leads (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID REFERENCES Users(id),
                platform_handle VARCHAR,
                email VARCHAR,
                lead_score INTEGER DEFAULT 0,
                source VARCHAR DEFAULT 'PLATFORM_AUTOMATION',
                status VARCHAR DEFAULT 'NEW',
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // 2. SELF-HEALING MIGRATIONS (Renaming old columns if they exist)
        try {
            await db.query(`ALTER TABLE Users RENAME COLUMN ig_user_id TO platform_user_id;`).catch(() => {});
            await db.query(`ALTER TABLE Analytics RENAME COLUMN follower_ig_id TO follower_platform_id;`).catch(() => {});
            await db.query(`ALTER TABLE Leads RENAME COLUMN ig_handle TO platform_handle;`).catch(() => {});
            console.log("✅ Database Migrations Applied (Trademark Purge).");
        } catch (migErr) {
            // Silently ignore if columns already renamed
        }

        console.log("✅ Database Schema Ready.");
    } catch (err) {
        console.error("❌ DB Error:", err.message);
    }
};

// --- BOOTSTRAP MASTER ACCOUNT (Account Safety) ---
const bootstrapMasterAccount = async () => {
    const masterToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const masterId = "17841477997409764"; // Hardcoded from user request
    if (masterToken) {
        try {
            console.log("Checking Master Account Bootstrap...");
            const encryptedToken = encrypt(masterToken);
            await db.query(
                `INSERT INTO Users (platform_user_id, full_name, access_token) 
                 VALUES ($1, $2, $3) 
                 ON CONFLICT (platform_user_id) DO UPDATE SET access_token = $3`,
                [masterId, "Master Admin", encryptedToken]
            );
            console.log("✅ Master Account 17841477997409764 Bootstrapped.");
        } catch (err) {
            console.error("❌ Bootstrap Error:", err.message);
        }
    }
};

initializeDatabase().then(() => bootstrapMasterAccount());

// Redis Subscriber for Real-Time Activity Feed
const redisSub = new Redis(process.env.REDIS_URL);
redisSub.subscribe('lead-health-update');
redisSub.on('message', (channel, message) => {
    if (channel === 'lead-health-update') {
        const data = JSON.parse(message);
        io.emit('activity-feed', data); // Real-time push to dashboard
    }
});

app.use(express.json());
app.use(cookieParser());
app.use(helmet({ contentSecurityPolicy: false }));

// --- 1. PREMIUM SLATE-BLUE GLASSMORPHISM DASHBOARD ---
app.get('/', (req, res) => {
    // If Meta redirects here with a code, pass it to the callback logic
    if (req.query.code) {
        return res.redirect(`/auth/callback?code=${req.query.code}`);
    }
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>GoLink Auto | Premium Automation</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
            <style>
                :root {
                    --bg: #0f172a;
                    --glass: rgba(30, 41, 59, 0.7);
                    --glass-border: rgba(255, 255, 255, 0.08);
                    --primary: #38bdf8;
                    --secondary: #818cf8;
                    --accent: #22c55e;
                    --text: #f8fafc;
                    --text-dim: #94a3b8;
                }
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Inter', sans-serif; 
                    background: radial-gradient(circle at top left, #1e1b4b, #0f172a); 
                    color: var(--text); 
                    min-height: 100vh; 
                    display: flex; 
                    flex-direction: column; 
                    align-items: center;
                    overflow-x: hidden;
                }
                .container { 
                    width: 100%; 
                    max-width: 1200px; 
                    padding: 2rem; 
                    display: flex; 
                    flex-direction: column; 
                    gap: 2rem;
                }
                header {
                    text-align: center;
                    padding: 4rem 0 2rem;
                }
                .logo { 
                    font-size: 2.5rem; 
                    font-weight: 800; 
                    letter-spacing: -2px; 
                    background: linear-gradient(to right, var(--primary), var(--secondary));
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    margin-bottom: 0.5rem;
                }
                .status-pill {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid rgba(34, 197, 94, 0.2);
                    color: var(--accent);
                    padding: 6px 16px;
                    border-radius: 99px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                }
                .status-dot { width: 8px; height: 8px; background: var(--accent); border-radius: 50%; box-shadow: 0 0 12px var(--accent); }
                
                .main-grid {
                    display: grid;
                    grid-template-columns: 1fr 350px;
                    gap: 2rem;
                }
                @media (max-width: 900px) { .main-grid { grid-template-columns: 1fr; } }

                .glass-card {
                    background: var(--glass);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid var(--glass-border);
                    border-radius: 24px;
                    padding: 2rem;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                }

                .hero-content h2 { font-size: 2rem; margin-bottom: 1rem; }
                .hero-content p { color: var(--text-dim); line-height: 1.6; font-size: 1.1rem; margin-bottom: 2rem; }

                .btn-connect {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    background: linear-gradient(135deg, #4f46e5, #0ea5e9);
                    color: white;
                    padding: 16px 32px;
                    border-radius: 16px;
                    text-decoration: none;
                    font-weight: 700;
                    font-size: 1.1rem;
                    transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 10px 20px -5px rgba(79, 70, 229, 0.4);
                }
                .btn-connect:hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 20px 30px -10px rgba(79, 70, 229, 0.6); }

                .feed-section h3 { font-size: 1.25rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; }
                .feed-container {
                    height: 400px;
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    padding-right: 10px;
                }
                .feed-container::-webkit-scrollbar { width: 4px; }
                .feed-container::-webkit-scrollbar-thumb { background: var(--glass-border); border-radius: 10px; }
                
                .feed-item {
                    background: rgba(15, 23, 42, 0.5);
                    border: 1px solid var(--glass-border);
                    padding: 14px;
                    border-radius: 16px;
                    font-size: 0.85rem;
                    animation: slideIn 0.4s ease-out forwards;
                }
                @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
                
                .feed-item .time { color: var(--text-dim); font-size: 0.75rem; margin-bottom: 4px; display: block; }
                .feed-item .user { color: var(--primary); font-weight: 600; }
                .feed-item .action { color: var(--accent); }

                footer {
                    margin-top: auto;
                    padding: 3rem 0;
                    text-align: center;
                    width: 100%;
                    border-top: 1px solid var(--glass-border);
                }
                .footer-links { display: flex; justify-content: center; gap: 2rem; margin-top: 1rem; flex-wrap: wrap; }
                .footer-links a { color: var(--text-dim); text-decoration: none; font-size: 0.875rem; transition: 0.2s; }
                .footer-links a:hover { color: var(--primary); }

                .legal-content { max-width: 800px; text-align: left; margin: 4rem auto; display: none; }
                .legal-content h1 { font-size: 2.5rem; margin-bottom: 1.5rem; color: var(--primary); }
                .legal-content h2 { font-size: 1.5rem; margin: 2rem 0 1rem; color: var(--secondary); }
                .legal-content p, .legal-content li { color: var(--text-dim); line-height: 1.8; margin-bottom: 1rem; }
                .legal-content ul { padding-left: 1.5rem; }
                .back-btn { cursor: pointer; color: var(--primary); font-weight: 600; margin-bottom: 2rem; display: inline-block; }
            </style>
        </head>
        <body>
            <div class="container" id="main-view">
                <header>
                    <div class="status-pill">
                        <span class="status-dot"></span>
                        GoLink Auto System Operational
                    </div>
                    <div class="logo">GO LINK AUTO</div>
                    <p style="color: var(--text-dim); margin-top: 0.5rem;">Professional Platform Automation</p>
                </header>

                <div class="main-grid">
                    <div class="glass-card hero-content">
                        <h2>Automate Your Growth</h2>
                        <p>Join hundreds of creators scaling their engagement with our AI-powered sentiment-aware comment-to-DM engine. Secure, fast, and 100% compliant.</p>
                        <a href="/auth/instagram" class="btn-connect">Connect Business Profile</a>
                        
                        <div style="margin-top: 4rem; display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                            <div style="padding: 1.5rem; background: rgba(255,255,255,0.02); border-radius: 20px;">
                                <h4 style="color: var(--primary);">Security 🛡️</h4>
                                <p style="font-size: 0.85rem; margin-top: 0.5rem;">AES-256 GCM Encryption for all access tokens.</p>
                            </div>
                            <div style="padding: 1.5rem; background: rgba(255,255,255,0.02); border-radius: 20px;">
                                <h4 style="color: var(--accent);">Speed 🚀</h4>
                                <p style="font-size: 0.85rem; margin-top: 0.5rem;">Near-instant replies with smart mimicry delays.</p>
                            </div>
                        </div>
                    </div>

                    <div class="glass-card feed-section">
                        <h3>Live Activity <span style="font-size: 0.8rem; font-weight: 400; color: var(--text-dim);">Real-time</span></h3>
                        <div class="feed-container" id="activity-feed">
                            <div class="feed-item">
                                <span class="time">Just now</span>
                                <span class="user">System</span> initialized... ready for traffic.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Legal Views -->
            <div class="container legal-content" id="privacy-view">
                <span class="back-btn" onclick="showView('main-view')">← Back to Dashboard</span>
                <h1>Privacy Policy</h1>
                <p>Last updated: April 1, 2026</p>
                <p>At GoLink Auto, we take your privacy seriously. This policy explains how we collect, use, and protect your data when using our automation platform.</p>
                <h2>1. Data We Collect</h2>
                <ul>
                    <li><strong>Platform Data:</strong> We access your public comments and basic profile info via the social media OAuth provider.</li>
                    <li><strong>Tokens:</strong> We store your 60-day Long-Lived Access Tokens using AES-256 encryption.</li>
                </ul>
                <h2>2. How We Use Data</h2>
                <p>Data is used exclusively to provide the automated DM services you configure. We never sell your data to third parties.</p>
                <h2>3. Security</h2>
                <p>We use industry-standard encryption and secure database protocols. Tokens are never stored in plain text.</p>
                <p>Contact us at <strong>shyam52404@gmail.com</strong> for privacy inquiries.</p>
            </div>

            <div class="container legal-content" id="terms-view">
                <span class="back-btn" onclick="showView('main-view')">← Back to Dashboard</span>
                <h1>Terms of Service</h1>
                <h2>1. Acceptance of Terms</h2>
                <p>By connecting your account, you agree to these terms and the Instagram Platform Policy.</p>
                <h2>2. Usage Rules</h2>
                <p>Automation must be used responsibly. Spamming is strictly prohibited. You are responsible for ensuring your trigger keywords comply with Instagram Community Guidelines.</p>
                <h2>3. Liability</h2>
                <p>Extreme Media World is not responsible for any platform-side actions taken against accounts that post violating content.</p>
            </div>

            <div class="container legal-content" id="deletion-view">
                <span class="back-btn" onclick="showView('main-view')">← Back to Dashboard</span>
                <h1>Data Deletion & Deauthorize</h1>
                <p>To request deletion of your data or deauthorize the app, proceed with one of the following:</p>
                <h2>Option A: Manual Request</h2>
                <p>Email <strong>shyam52404@gmail.com</strong> with your handle and the subject "DATA DELETION REQUEST".</p>
                <h2>Option B: Meta Platform Settings</h2>
                <p>Go to your Facebook/Instagram Settings -> Apps and Websites -> GoLink Auto -> Remove.</p>
                <p style="margin-top: 2rem; font-size: 0.8rem; color: var(--text-dim);">Callback URL: https://golink-ig.onrender.com/</p>
            </div>

            <footer>
                <p>&copy; 2026 GoLink Auto. All Rights Reserved.</p>
                <div class="footer-links">
                    <a href="javascript:void(0)" onclick="showView('privacy-view')">Privacy Policy</a>
                    <a href="javascript:void(0)" onclick="showView('terms-view')">Terms of Service</a>
                    <a href="javascript:void(0)" onclick="showView('deletion-view')">Data Deletion</a>
                </div>
            </footer>

            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                const feed = document.getElementById('activity-feed');

                socket.on('activity-feed', (data) => {
                    const item = document.createElement('div');
                    item.className = 'feed-item';
                    item.innerHTML = \`
                        <span class="time">\${new Date().toLocaleTimeString()}</span>
                        New Lead <span class="user">@\${data.followerIgId}</span> triggered automation on id \${data.automationId}. 
                        Sentiment: <span class="action" style="color: \${data.sentimentLabel === 'positive' ? '#22c55e' : '#f87171'}">\${data.sentimentLabel}</span>
                    \`;
                    feed.prepend(item);
                });

                function showView(viewId) {
                    document.querySelectorAll('.container').forEach(c => c.style.display = 'none');
                    document.getElementById(viewId).style.display = 'block';
                    window.scrollTo(0,0);
                }
            </script>
        </body>
        </html>
    `);
});

// --- 2. LOGIC ROUTES (OAuth, Webhooks) ---
app.get('/auth/instagram', (req, res) => {
    const scopes = 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish,instagram_business_manage_insights';
    const redirectUri = `${process.env.BACKEND_URL}/`; // Using ROOT as redirect point
    const url = `https://www.instagram.com/oauth/authorize?force_reauth=true&client_id=${process.env.FB_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scopes}`;
    res.redirect(url);
});

// --- 3. WEBHOOKS (Diagnostics Added) ---
app.get('/webhook/instagram', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log("--- WEBHOOK VERIFICATION ATTEMPT ---");
    console.log("Mode:", mode);
    console.log("Token Received:", token);
    console.log("Expected Token (Render):", process.env.FB_VERIFY_TOKEN);

    if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
        console.log("✅ Webhook Verification SUCCESS.");
        res.status(200).send(challenge);
    } else {
        console.error("❌ Webhook Verification FAILED. Token mismatch or missing.");
        res.status(403).send('Verification failed');
    }
});

// --- DEBUG: Verify Config (Hidden) ---
app.get('/check-config', (req, res) => {
    res.json({
        FB_APP_ID: process.env.FB_APP_ID ? "✅ Defined" : "❌ MISSING",
        FB_APP_SECRET: process.env.FB_APP_SECRET ? "✅ Defined" : "❌ MISSING",
        BACKEND_URL: process.env.BACKEND_URL ? "✅ Defined" : "❌ MISSING"
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`GoLink Auto LIVE on ${PORT}`));
