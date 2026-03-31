require('dotenv').config();

module.exports = {
    agency: {
        domain: process.env.AGENCY_URL || 'https://agency.golink.ig',
        brandName: 'Extreme Media World',
        shortLinkPath: '/l/'
    },
    automation: {
        smartDelay: {
            min: 120000, // 2 mins
            max: 300000, // 5 mins
            jitterRange: 15000 // 15s random offset
        }
    }
};
