const Redis = require('ioredis');
const db = require('../../db');

const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null
});

const CACHE_KEY = 'platform-config:all';
const CACHE_TTL_SECONDS = 300;
const DEFAULT_CONFIG = {
    ai_tone: 'casual, warm, human',
    ai_max_length: '300',
    ai_safety_mode: 'on'
};

async function loadConfigFromDb() {
    const result = await db.query(
        'SELECT key, value, updated_at FROM platform_config ORDER BY key ASC'
    );

    return result.rows.reduce((acc, row) => {
        acc[row.key] = row.value;
        return acc;
    }, { ...DEFAULT_CONFIG });
}

async function getPlatformConfig(forceRefresh = false) {
    if (!forceRefresh) {
        try {
            const cached = await redis.get(CACHE_KEY);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (error) {
            console.error('[platform-config] cache read failed', error.message);
        }
    }

    const config = await loadConfigFromDb();
    try {
        await redis.set(CACHE_KEY, JSON.stringify(config), 'EX', CACHE_TTL_SECONDS);
    } catch (error) {
        console.error('[platform-config] cache write failed', error.message);
    }
    return config;
}

async function savePlatformConfig(entries) {
    const pairs = Object.entries(entries || {}).filter(([key]) => key);
    for (const [key, value] of pairs) {
        await db.query(
            `INSERT INTO platform_config (key, value, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
            [String(key), String(value)]
        );
    }

    try {
        await redis.del(CACHE_KEY);
    } catch (error) {
        console.error('[platform-config] cache clear failed', error.message);
    }

    return getPlatformConfig(true);
}

module.exports = {
    DEFAULT_CONFIG,
    getPlatformConfig,
    savePlatformConfig
};
