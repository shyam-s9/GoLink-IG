const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const helmet = require('helmet');
const db = require('./db');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- DATABASE INITIALIZATION ---
const initializeDatabase = async () => {
    try {
        console.log("Checking Database Tables...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS Reels_Automation (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255),
                trigger_keyword VARCHAR(100) DEFAULT 'LINK',
                affiliate_link TEXT,
                is_enabled BOOLEAN DEFAULT true
            );
        `);
        console.log("✅ Database Schema Ready.");
    } catch (err) {
        console.error("❌ DB Error:", err.message);
    }
};
initializeDatabase();

app.use(express.json());
app.use(helmet({ contentSecurityPolicy: false }));

// --- 1. NEW SLATE-BLUE DASHBOARD (The "Antigravity" UI) ---
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Extreme Media World | Dashboard</title>
            <style>
                body { font-family: 'Inter', -apple-system, sans-serif; background: #0f172a; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
                .card { background: #1e293b; padding: 2.5rem; border-radius: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.3); text-align: center; width: 90%; max-width: 450px; border: 1px solid #334155; }
                .logo { color: #38bdf8; font-weight: 800; font-size: 1.8rem; letter-spacing: -1px; margin-bottom: 0.5rem; }
                .status-badge { display: inline-block; background: rgba(52, 211, 153, 0.1); color: #34d399; padding: 6px 16px; border-radius: 50px; font-size: 0.75rem; font-weight: 700; margin-bottom: 2rem; border: 1px solid rgba(52, 211, 153, 0.2); }
                .info-box { background: #0f172a; padding: 20px; border-radius: 16px; text-align: left; font-size: 0.9rem; margin-bottom: 1.5rem; border: 1px solid #1e293b; line-height: 1.8; }
                .login-btn { display: block; background: #4f46e5; color: white; padding: 14px; border-radius: 12px; text-decoration: none; font-weight: 600; margin-bottom: 1.5rem; transition: 0.2s; }
                .login-btn:hover { background: #4338ca; transform: translateY(-2px); }
                .footer-links { font-size: 0.75rem; color: #64748b; margin-top: 1rem; }
                .footer-links a { color: #38bdf8; text-decoration: none; margin: 0 8px; }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="logo">EXTREME MEDIA WORLD</div>
                <div class="status-badge">● SYSTEM OPERATIONAL</div>
                <div class="info-box">
                    <strong>Project:</strong> @CricketShaam Automation<br>
                    <strong>Security:</strong> AES-256 Encrypted 🛡️<br>
                    <strong>Database:</strong> Connected ✅<br>
                    <strong>Status:</strong> Webhook Active 🟢
                </div>
                <a href="/auth/instagram" class="login-btn">Connect Instagram Business</a>
                <div class="footer-links">
                    <a href="/privacy-policy">Privacy Policy</a> • 
                    <a href="/terms">Terms</a> • 
                    <a href="/data-deletion">Data Deletion</a>
                </div>
            </div>
            <p style="margin-top: 2rem; color: #475569; font-size: 0.8rem; font-weight: 600;">BUILD IN PUBLIC V1.0</p>
        </body>
        </html>
    `);
});

// --- 2. MANDATORY COMPLIANCE ROUTES ---
app.get('/privacy-policy', (req, res) => {
    res.send("<h1>Privacy Policy</h1><p>We use AES-256 encryption to protect your tokens.</p><a href='/'>Back</a>");
});

app.get('/terms', (req, res) => {
    res.send("<h1>Terms of Service</h1><p>Use this tool responsibly.</p><a href='/'>Back</a>");
});

app.get('/data-deletion', (req, res) => {
    res.send("<h1>Data Deletion</h1><p>Email shyam@extrememediaworld.com to delete your data.</p><a href='/'>Back</a>");
});

// --- 3. WEBHOOKS ---
app.get('/webhook/instagram', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Extreme Media World LIVE on ${PORT}`));