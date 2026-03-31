const { Queue } = require('bullmq');
const IORedis = require('ioredis');
require('dotenv').config();

const connection = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
});

const messageQueue = new Queue('messageQueue', { connection });

module.exports = {
    messageQueue,
    connection
};
