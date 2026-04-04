const crypto = require('crypto');
const axios = require('axios');
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null
});

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const ANTHROPIC_VERSION = '2023-06-01';

function fallbackMatch(commentText, triggerKeyword) {
    return String(commentText || '').toLowerCase().includes(String(triggerKeyword || '').trim().toLowerCase());
}

function getCacheKey(commentText, triggerKeyword) {
    const hash = crypto
        .createHash('sha256')
        .update(`${String(commentText || '').toLowerCase()}::${String(triggerKeyword || '').toLowerCase()}`)
        .digest('hex');

    return `intent:${hash}`;
}

async function queryIntent(commentText, triggerKeyword) {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
        model: ANTHROPIC_MODEL,
        max_tokens: 8,
        temperature: 0,
        messages: [
            {
                role: 'user',
                content: `Does this comment express interest in: ${triggerKeyword}? Reply only YES or NO.\n\nComment: ${commentText}`
            }
        ]
    }, {
        headers: {
            'content-type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': ANTHROPIC_VERSION
        },
        timeout: 12_000
    });

    const text = Array.isArray(response.data?.content)
        ? response.data.content.map((block) => block?.text || '').join(' ').trim().toUpperCase()
        : '';

    return text.startsWith('YES');
}

async function expressesIntent({ commentText, triggerKeyword }) {
    const fallback = fallbackMatch(commentText, triggerKeyword);
    const cacheKey = getCacheKey(commentText, triggerKeyword);

    try {
        const cached = await redis.get(cacheKey);
        if (cached === 'YES') return true;
        if (cached === 'NO') return false;
    } catch (error) {
        console.error('[intent] cache read failed', error.message);
    }

    if (!ANTHROPIC_API_KEY) {
        return fallback;
    }

    try {
        const matched = await queryIntent(commentText, triggerKeyword);
        await redis.set(cacheKey, matched ? 'YES' : 'NO', 'EX', 300).catch(() => {});
        return matched;
    } catch (error) {
        console.error('[intent] semantic match failed', error.response?.data || error.message);
        return fallback;
    }
}

module.exports = {
    expressesIntent
};
