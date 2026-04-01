const Sentiment = require('sentiment');
const sentiment = new Sentiment();

/**
 * Analyzes the sentiment of a piece of text.
 * @param {string} text 
 * @returns {object} { score, label }
 */
function analyzeSentiment(text) {
    if (!text) return { score: 0, label: 'neutral' };
    
    const result = sentiment.analyze(text);
    const score = result.score;
    
    let label = 'neutral';
    if (score > 0) label = 'positive';
    else if (score < 0) label = 'negative';
    
    return {
        score,
        label
    };
}

module.exports = {
    analyzeSentiment
};
