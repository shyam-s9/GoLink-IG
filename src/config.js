require('dotenv').config();

module.exports = {
    agency: {
        domain: process.env.AGENCY_URL || 'https://agency.golink.ig',
        brandName: 'Extreme Media World',
        shortLinkPath: '/l/'
    },
    automation: {
        smartDelay: {
            min: 2000,   // 2 seconds
            max: 5000,   // 5 seconds
            jitterRange: 500 // 0.5s random offset
        }
    }
};
