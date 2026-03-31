const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const helmet = require('helmet');
const db = require('./db');
const { messageQueue } = require('./queue');
const { validateWebhookSignature, captureRawBody } = require('./middleware/auth');
require('./jobs/tokenRefresh');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

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

app.use(express.json({ verify: captureRawBody }));
app.use(helmet());

app.get('/webhook/instagram', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode && token === process.env.FB_VERIFY_TOKEN) res.status(200).send(challenge);
    else res.sendStatus(403);
});

app.post('/webhook/instagram', validateWebhookSignature, async (req, res) => {
    const { entry } = req.body;
    res.sendStatus(200);
    for (let event of entry) {
        const commentData = event.changes?.[0]?.value;
        if (!commentData) continue;
        const { id: commentId, text, from, media_id } = commentData;
        const creatorIgId = event.id;
        try {
            const configQuery = await db.query('SELECT * FROM Reels_Automation WHERE reel_id = $1 AND is_enabled = true', [media_id]);
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
                }
            }
        } catch (error) { console.error('Webhook error:', error.message); }
    }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Socket.io Server listening on port ${PORT}`);
});
