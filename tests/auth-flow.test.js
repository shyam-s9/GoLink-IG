const express = require('express');
const request = require('supertest');

describe('oauth state and callback security', () => {
    beforeEach(() => {
        process.env.JWT_SECRET = 'state-secret';
        jest.resetModules();
    });

    it('rejects callback requests with mismatched state', async () => {
        const { isValidOauthState } = require('../src/services/authFlowService');

        const app = express();
        app.get('/auth/callback', (req, res) => {
            const state = req.query.state;
            const stateCookie = req.headers['x-state-cookie'];
            if (!req.query.code || !isValidOauthState(state, stateCookie)) {
                return res.status(400).json({ message: 'invalid_state' });
            }
            return res.status(200).json({ ok: true });
        });

        const response = await request(app)
            .get('/auth/callback?code=abc123&state=wrong-state')
            .set('x-state-cookie', 'expected-state');

        expect(response.status).toBe(400);
        expect(response.body.message).toBe('invalid_state');
    });

    it('accepts callback requests with a valid signed state token', async () => {
        const { issueOauthState, isValidOauthState } = require('../src/services/authFlowService');
        const state = issueOauthState('req-1');

        const app = express();
        app.get('/auth/callback', (req, res) => {
            const stateCookie = req.headers['x-state-cookie'];
            if (!req.query.code || !isValidOauthState(req.query.state, stateCookie)) {
                return res.status(400).json({ message: 'invalid_state' });
            }
            return res.status(200).json({ ok: true });
        });

        const response = await request(app)
            .get(`/auth/callback?code=abc123&state=${encodeURIComponent(state)}`)
            .set('x-state-cookie', state);

        expect(response.status).toBe(200);
        expect(response.body.ok).toBe(true);
    });
});
