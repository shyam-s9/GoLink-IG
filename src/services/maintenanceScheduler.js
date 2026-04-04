const { messageQueue } = require('../../queue');

async function registerRecurringJobs() {
    await Promise.all([
        messageQueue.add('prune-expired-sessions', {}, {
            repeat: { every: 24 * 60 * 60 * 1000 },
            jobId: 'prune-expired-sessions'
        }),
        messageQueue.add('rotate-platform-tokens', {}, {
            repeat: { every: 12 * 60 * 60 * 1000 },
            jobId: 'rotate-platform-tokens'
        })
    ]);
}

module.exports = {
    registerRecurringJobs
};
