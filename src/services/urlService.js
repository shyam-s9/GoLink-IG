const crypto = require('crypto');
const config = require('../config');

/**
 * Generates a unique, dynamic tracking URL for the lead.
 * @param {string} automationId 
 * @param {string} followerIgId 
 * @returns {string} 
 */
function generateGoLink(automationId, followerIgId) {
    const hash = crypto.createHash('md5')
        .update(`${automationId}-${followerIgId}-${Date.now()}`)
        .digest('hex')
        .substring(0, 8);
        
    // Import domain and path from the established config file
    const { domain, shortLinkPath } = config.agency;
    return `${domain}${shortLinkPath}${hash}`;
}

module.exports = {
    generateGoLink
};
