const { messageQueue } = require('../../queue');

async function getQueueMetrics() {
    const counts = await messageQueue.getJobCounts('waiting', 'active', 'failed', 'completed');
    const completedJobs = await messageQueue.getJobs(['completed'], 0, 0, false);
    const lastCompleted = completedJobs[0]?.finishedOn
        ? new Date(completedJobs[0].finishedOn).toISOString()
        : null;

    return {
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        failed: counts.failed || 0,
        lastCompleted
    };
}

module.exports = {
    getQueueMetrics
};
