const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const helmet = require('helmet');
const db = require('./db'); // This is your database connection
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

// --- EMERGENCY TABLE CREATOR (The Fix) ---
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
        
        // Add a default trigger for testing if the table is empty
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
// ------------------------------------------

// Redis Subscriber for Real-Time Dashboard Events
const redisSub = new Redis(process.env.REDIS_URL);
redisSub.subscribe('lead-health-update', (err, count) => {
    if (err) console.error("Redis Subscribe Error:", err.message);
    else console.log(`Subscribed to ${count} channels. Listening for updates...`);
});

redisSub.on('message', (channel, message) => {
    if (channel === 'lead-health-update') {
        const data = JSON.parse(message);
        io.emit('sentiment-push', data);
        console.log(`[SOCKET EMIT]: Live push sent for ${data.followerIgId}`);
    }
});

app.use(express.json());
app.use(helmet());

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
            // Updated query: Removed reel_id check temporarily to test all comments, 
            // OR ensure you have the correct reel_id in DB.
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
                    
                    console.log(`[WEBHOOK]: Incoming comment detected: ${text}`);
                    console.log(`[QUEUE]: Job added for keyword match: ${config.trigger_keyword}`);
                }
            }
        } catch (error) { 
            console.error('Webhook processing error:', error.message); 
        }
    }
});

const PORT = process.env.PORT || 10000; // Default to Render's preferred port
server.listen(PORT, () => {
    console.log(`Socket.io Server listening on port ${PORT}`);
});
