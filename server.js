const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const helmet = require('helmet');
const db = require('./db'); // Database connection
const { messageQueue } = require('./queue');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// --- EMERGENCY TABLE CREATOR ---
const initializeDatabase = async () => {
    try {
        console.log("Checking Database Tables...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS Reels_Automation (
                id SERIAL PRIMARY KEY,
                reel_id VARCHAR(255),
                trigger_keyword VARCHAR(100),
                affiliate_link TEXT,
                is_enabled BOOLEAN DEFAULT true
            );
        `);
        
        const checkData = await db.query('SELECT COUNT(*) FROM Reels_Automation');
        if (parseInt(checkData.rows[0].count) === 0) {
            await db.query(`
                INSERT INTO Reels_Automation (trigger_keyword, affiliate_link)
                VALUES ('LINK', 'https://extrememediaworld.com');
            `);
            console.log("✅ Default trigger 'LINK' added to Database.");
        }
        console.log("✅ Database Schema is Ready.");
    } catch (err) {
        console.error("❌ Database Initialization Error:", err.message);
    }
};
initializeDatabase();

// Redis Subscriber
const redisSub = new Redis(process.env.REDIS_URL);
redisSub.subscribe('lead-health-update', (err, count) => {
    if (err) console.error("Redis Subscribe Error:", err.message);
    else console.log(`Subscribed to ${count} channels.`);
});

redisSub.on('message', (channel, message) => {
    if (channel === 'lead-health-update') {
        const data = JSON.parse(message);
        io.emit('sentiment-push', data);
        console.log(`[SOCKET EMIT]: Live push sent for ${data.followerIgId}`);
    }
});

app.use(express.json());
app.use(helmet({
    contentSecurityPolicy: false, // Allows the inline dashboard style to load
}));

// --- MOBILE DASHBOARD INTERFACE ---
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>EMW | CricketShaam Bot</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .card { background: #1e293b; padding: 2rem; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center; width: 85%; max-width: 400px; border: 1px solid #334155; }
                .logo { color: #38bdf8; font-weight: 800; font-size: 1.5rem; margin-bottom: 0.5rem; }
                .status-badge { display: inline-block; background: #064e3b; color: #34d399; padding: 5px 15px; border-radius: 50px; font-size: 0.8rem; font-weight: bold; margin-bottom: 1.5rem; border: 1px solid #059669; }
                .info { background: #0f172a; padding: 15px; border-radius: 12px; text-align: left; font-size: 0.9rem; line-height: 1.6; }
                .footer { margin-top: 1.5rem; font-size: 0.7rem; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="logo">EXTREME MEDIA WORLD</div>
                <div class="status-badge">● SYSTEM ONLINE</div>
                <div class="info">
                    <strong>Project:</strong> @CricketShaam Automation<br>
                    <strong>Database:</strong> Connected ✅<br>
                    <strong>Webhook:</strong> Active 🟢<br>
                    <strong>Keyword:</strong> "LINK"
                </div>
                <div class="footer">Build in Public v1.0</div>
            </div>
        </body>
        </html>
    `);
});

// GET: The Handshake
app.get('/webhook/instagram', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
        console.log('[WEBHOOK]: Verification Successful');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// POST: The Logic
app.post('/webhook/instagram', async (req, res) => {
    const { entry } = req.body;
    res.sendStatus(200); 
    
    if (!entry) return;

    for (let event of entry) {
        const commentData = event.changes?.[0]?.value;
        if (!commentData) continue;
        
        const { id: commentId, text, from, media_id } = commentData;
        const creatorIgId = event.id;

        try {
            const configQuery = await db.query(
                'SELECT * FROM Reels_Automation WHERE is_enabled = true'
            );

            if (configQuery.rows.length === 0) continue;

            for (let config of configQuery.rows) {
                if (text.toLowerCase().includes(config.trigger_keyword.toLowerCase())) {
                    await messageQueue.add('process-dm', {
                        creatorIgId,
                        followerIgId: from.id,
                        link: config.affiliate_link,
                        commentId: commentId,
                        automationId: config.id,
                        commentText: text
                    }, { delay: Math.floor(Math.random() * (5000 - 2000) + 2000) });
                    
                    console.log(`[WEBHOOK]: Incoming comment: ${text}`);
                }
            }
        } catch (error) { 
            console.error('Webhook processing error:', error.message); 
        }
    }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
