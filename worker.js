const { Worker, Queue } = require('bullmq');
const Redis = require('ioredis');
const db = require('./db');
const { checkIfFollowing, sendDM, replyToComment } = require('./src/services/platformService');
const { analyzeSentiment } = require('./src/services/sentimentService');
const { generateGoLink } = require('./src/services/urlService');
const { decrypt } = require('./src/services/cryptoService');
const { recordAutomationThreat } = require('./src/services/securityAgentService');
const { connection, messageQueue } = require('./queue');
const config = require('./config');

const redisPub = new Redis(process.env.REDIS_URL);

/**
 * Worker Logic for GoLink Auto (Trademark-Free Agent)
 */
const worker = new Worker('messageQueue', async job => {
    const { name, data } = job;
    const { creatorPlatformId, followerPlatformId, link, commentId, automationId, commentText } = data;
    
    try {
        const creatorQuery = await db.query(
            'SELECT u.id as user_id, u.access_token, u.is_active, ra.public_reply_text FROM Users u JOIN Reels_Automation ra ON ra.user_id = u.id WHERE ra.id = $1',
            [automationId]
        );
        if (!creatorQuery.rows || creatorQuery.rows.length === 0) return;
        const creator = creatorQuery.rows[0];
        if (!creator.is_active) return;
        const decryptedToken = decrypt(creator.access_token);

        // --- Sentiment Analysis (EMW SHIELD) ---
        const sentiment = analyzeSentiment(commentText);
        await db.query(
            'UPDATE Analytics SET sentiment_score = $1, sentiment_label = $2 WHERE (follower_platform_id = $3 AND automation_id = $4) OR (id IN (SELECT id FROM Analytics WHERE automation_id = $4 ORDER BY timestamp DESC LIMIT 1))',
            [sentiment.score, sentiment.label, followerPlatformId, automationId]
        );

        // [SOCKET PUSH]: Notify Server to Emit Sentiment Update
        redisPub.publish('lead-health-update', JSON.stringify({
            automationId,
            followerPlatformId,
            sentimentScore: sentiment.score,
            sentimentLabel: sentiment.label,
            timestamp: new Date().toISOString()
        }));

        if (sentiment.label === 'negative') {
            await recordAutomationThreat({
                userId: creator.user_id,
                automationId,
                followerPlatformId,
                commentText,
                eventType: 'blocked-negative-sentiment',
                blocked: true,
                extra: {
                    sentimentScore: sentiment.score,
                    sentimentLabel: sentiment.label
                }
            });
            return;
        }

        const automationRisk = await recordAutomationThreat({
            userId: creator.user_id,
            automationId,
            followerPlatformId,
            commentText,
            eventType: 'automation-trigger-evaluated',
            extra: {
                sentimentScore: sentiment.score,
                sentimentLabel: sentiment.label
            }
        });

        if (automationRisk.riskScore >= 65) {
            return;
        }

        // --- Lead Management (EMW) ---
        await db.query(
            `INSERT INTO Leads (user_id, platform_handle, source)
             SELECT $1, $2, $3
             WHERE NOT EXISTS (
                SELECT 1 FROM Leads WHERE user_id = $1 AND platform_handle = $2
             )`,
            [creator.user_id, followerPlatformId, 'PLATFORM_AUTOMATION']
        );

        if (name === 'process-dm') {
            const { min, max, jitterRange } = config.automation.smartDelay;
            const jitter = Math.floor(Math.random() * jitterRange) + (jitterRange / 2);
            const publicReplyDelay = Math.floor(Math.random() * (max - min) + min) + jitter;
            
            await messageQueue.add('send-public-reply', { commentId, message: creator.public_reply_text || "Sent you details! 🚀", accessToken: decryptedToken }, { delay: publicReplyDelay });

            const customLink = generateGoLink(automationId, followerPlatformId);
            await messageQueue.add('send-private-dm', { creatorPlatformId, followerPlatformId, message: `Here is your requested link: ${customLink}`, accessToken: decryptedToken, automationId }, { delay: 10000 });
        }

        if (name === 'send-public-reply') await replyToComment(data.commentId, data.message, data.accessToken);
        if (name === 'send-private-dm') {
            const sent = await sendDM(data.creatorPlatformId, data.followerPlatformId, data.message, data.accessToken);
            if (sent) {
                await db.query('UPDATE Reels_Automation SET total_delivered = total_delivered + 1 WHERE id = $1', [data.automationId]);
                await db.query('INSERT INTO Analytics (automation_id, follower_platform_id, action_type) VALUES ($1, $2, $3)', [data.automationId, data.followerPlatformId, 'DM_SENT']);
            } else {
                await recordAutomationThreat({
                    userId: creator.user_id,
                    automationId: data.automationId,
                    followerPlatformId: data.followerPlatformId,
                    commentText: data.message,
                    eventType: 'dm-delivery-failed',
                    blocked: true
                });
            }
        }
    } catch (error) { console.error(`Worker error:`, error); throw error; }
}, { connection });

worker.on('failed', (job, err) => console.error(`${job.id} failed with ${err.message}`));
