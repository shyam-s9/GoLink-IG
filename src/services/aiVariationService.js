const axios = require('axios');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const ANTHROPIC_VERSION = '2023-06-01';

function clampText(value, maxLength) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function buildFallbackCopy({ automationContext = {}, commentText = '' }) {
    const normalizedComment = clampText(commentText, 120);
    const creatorName = clampText(automationContext.creatorName || 'the creator', 60);
    const publicReply = clampText(
        automationContext.publicReplyText || `Thanks ${normalizedComment ? 'for the comment' : 'so much'} - sending the details your way now.`,
        300
    );
    const dmLink = automationContext.customLink || automationContext.affiliateLink || automationContext.link || '';
    const dmMessage = clampText(
        dmLink
            ? `Hey! ${creatorName} asked me to send this over: ${dmLink}`
            : `Hey! ${creatorName} asked me to send over the details you requested.`,
        500
    );

    return {
        publicReply,
        directMessage: dmMessage,
        source: 'fallback'
    };
}

function extractTextContent(data) {
    const blocks = Array.isArray(data?.content) ? data.content : [];
    return blocks
        .filter((block) => block?.type === 'text' && block?.text)
        .map((block) => block.text)
        .join('\n')
        .trim();
}

function parseJsonPayload(raw) {
    if (!raw) return null;

    const cleaned = raw
        .replace(/^```json/i, '')
        .replace(/^```/i, '')
        .replace(/```$/i, '')
        .trim();

    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
        return null;
    }

    try {
        return JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
    } catch (error) {
        return null;
    }
}

async function generateMessageVariations({ commentText, automationContext = {}, creatorTone = '' }) {
    const fallback = buildFallbackCopy({ commentText, automationContext });
    if (!ANTHROPIC_API_KEY) {
        return fallback;
    }

    const prompt = [
        'Create one public Instagram reply and one DM reply as strict JSON.',
        'Return only JSON with keys publicReply and directMessage.',
        `Comment: ${clampText(commentText, 220) || 'No comment text provided.'}`,
        `Creator tone: ${clampText(creatorTone || automationContext.publicReplyText || 'casual, warm, human', 180)}`,
        `Trigger keyword: ${clampText(automationContext.triggerKeyword || '', 80)}`,
        `Creator name: ${clampText(automationContext.creatorName || '', 80)}`,
        `Link to include in DM: ${automationContext.customLink || automationContext.affiliateLink || automationContext.link || 'No link available.'}`,
        'Public reply must be under 300 characters.',
        'DM must be under 500 characters.',
        'Do not use hashtags. Do not mention being an AI or bot. The DM should feel personal and naturally include the link if one is available.'
    ].join('\n');

    try {
        const response = await axios.post('https://api.anthropic.com/v1/messages', {
            model: ANTHROPIC_MODEL,
            max_tokens: 220,
            temperature: 0.9,
            system: 'You are writing on behalf of an Instagram creator. Respond naturally to this comment. Never sound like a bot. Vary your phrasing every time. Match the energy of the comment.',
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ]
        }, {
            headers: {
                'content-type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': ANTHROPIC_VERSION
            },
            timeout: 20_000
        });

        const parsed = parseJsonPayload(extractTextContent(response.data));
        if (!parsed) {
            return fallback;
        }

        const publicReply = clampText(parsed.publicReply || fallback.publicReply, 300);
        const directMessage = clampText(parsed.directMessage || fallback.directMessage, 500);

        if (!publicReply || !directMessage) {
            return fallback;
        }

        return {
            publicReply,
            directMessage,
            source: 'anthropic'
        };
    } catch (error) {
        console.error('[ai-variation] generation failed', error.response?.data || error.message);
        return fallback;
    }
}

module.exports = {
    generateMessageVariations
};
