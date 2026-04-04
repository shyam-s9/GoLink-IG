const { Worker } = require('bullmq');
const os = require('os');
const Redis = require('ioredis');
const db = require('./db');
const { sendDM, replyToComment } = require('./src/services/platformService');
const { analyzeSentiment } = require('./src/services/sentimentService');
const { generateGoLink } = require('./src/services/urlService');
const { decrypt } = require('./src/services/cryptoService');
const { recordAutomationThreat } = require('./src/services/securityAgentService');
const { rotateExpiringTokens } = require('./src/services/tokenRotationService');
const { generateMessageVariations } = require('./src/services/aiVariationService');
const { connection, messageQueue } = require('./queue');
const config = require('./config');

const redisPub = new Redis(process.env.REDIS_URL);
const redisOps = new Redis(process.env.REDIS_URL);

async function pruneExpiredSessions() {
    const result = await db.query(
        `DELETE FROM Auth_Sessions
         WHERE expires_at < NOW()
            OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '30 days')`
    );

    return { pruned: result.rowCount };
}

async function publishWorkerHeartbeat() {
    await redisOps.set('system:worker-heartbeat', JSON.stringify({
        pid: process.pid,
        hostname: os.hostname(),
        timestamp: new Date().toISOString()
    }), 'EX', 120);
}

const worker = new Worker('messageQueue', async (job) => {
    const { name, data } = job;
    const { creatorPlatformId, followerPlatformId, commentId, automationId, commentText } = data;

    try {
        if (name === 'prune-expired-sessions') {
            return pruneExpiredSessions();
        }

        if (name === 'rotate-platform-tokens') {
            return rotateExpiringTokens();
        }

        if (name === 'send-public-reply') {
            return replyToComment(data.commentId, data.message, data.accessToken);
        }

        if (name === 'send-private-dm') {
            const sent = await sendDM(data.creatorPlatformId, data.followerPlatformId, data.message, data.accessToken);
            if (sent) {
                await db.query('UPDATE Reels_Automation SET total_delivered = total_delivered + 1 WHERE id = $1', [data.automationId]);
                await db.query('INSERT INTO Analytics (automation_id, follower_platform_id, action_type) VALUES ($1, $2, $3)', [data.automationId, data.followerPlatformId, 'DM_SENT']);
            } else {
                const owner = await db.query(
                    `SELECT user_id FROM Reels_Automation WHERE id = $1`,
                    [data.automationId]
                );
                await recordAutomationThreat({
                    userId: owner.rows[0]?.user_id || null,
                    automationId: data.automationId,
                    followerPlatformId: data.followerPlatformId,
                    commentText: data.message,
                    eventType: 'dm-delivery-failed',
                    blocked: true
                });
            }
            return sent;
        }

        const creatorQuery = await db.query(
            `SELECT
                u.id AS user_id,
                u.access_token,
                u.is_active,
                u.full_name,
                ra.public_reply_text,
                ra.affiliate_link,
                ra.trigger_keyword
             FROM Users u
             JOIN Reels_Automation ra ON ra.user_id = u.id
             WHERE ra.id = $1`,
            [automationId]
        );
        if (!creatorQuery.rows.length) return null;

        const creator = creatorQuery.rows[0];
        if (!creator.is_active) return null;

        const decryptedToken = decrypt(creator.access_token);
        const sentiment = analyzeSentiment(commentText);

        await db.query(
            'UPDATE Analytics SET sentiment_score = $1, sentiment_label = $2 WHERE (follower_platform_id = $3 AND automation_id = $4) OR (id IN (SELECT id FROM Analytics WHERE automation_id = $4 ORDER BY timestamp DESC LIMIT 1))',
            [sentiment.score, sentiment.label, followerPlatformId, automationId]
        );

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
            return null;
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
            return null;
        }

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
            const customLink = generateGoLink(automationId, followerPlatformId);
            const messageVariations = await generateMessageVariations({
                commentText,
                creatorTone: creator.public_reply_text || 'casual, warm, human',
                automationContext: {
                    creatorName: creator.full_name,
                    triggerKeyword: creator.trigger_keyword,
                    publicReplyText: creator.public_reply_text,
                    affiliateLink: creator.affiliate_link,
                    customLink
                }
            });

            await messageQueue.add('send-public-reply', {
                commentId,
                message: messageVariations.publicReply,
                accessToken: decryptedToken
            }, { delay: publicReplyDelay });

            await messageQueue.add('send-private-dm', {
                creatorPlatformId,
                followerPlatformId,
                message: messageVariations.directMessage,
                accessToken: decryptedToken,
                automationId
            }, { delay: 10_000 });
        }

        return null;
    } catch (error) {
        console.error('Worker error:', error);
        throw error;
    }
}, { connection });

worker.on('failed', (job, err) => console.error(`${job.id} failed with ${err.message}`));
worker.on('ready', () => console.log('[worker] GoLink Auto worker ready'));

publishWorkerHeartbeat().catch((error) => console.error('[worker] heartbeat bootstrap failed', error.message));
setInterval(() => {
    publishWorkerHeartbeat().catch((error) => console.error('[worker] heartbeat failed', error.message));
}, 30_000);
