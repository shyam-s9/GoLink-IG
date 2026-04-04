const express = require('express');
const request = require('supertest');
const crypto = require('crypto');

describe('webhook signature verification', () => {
    let app;

    beforeEach(() => {
        process.env.FB_APP_SECRET = 'test-webhook-secret';
        jest.resetModules();
        const { captureRawBody, validateWebhookSignature } = require('../src/middleware/auth');

        app = express();
        app.use(express.json({ verify: captureRawBody }));
        app.post('/webhook/instagram', validateWebhookSignature, (req, res) => {
            res.status(200).json({ ok: true });
        });
    });

    it('accepts a valid Meta X-Hub-Signature-256 header', async () => {
        const payload = { entry: [{ id: '1' }] };
        const raw = JSON.stringify(payload);
        const digest = crypto.createHmac('sha256', process.env.FB_APP_SECRET).update(raw).digest('hex');

        const response = await request(app)
            .post('/webhook/instagram')
            .set('x-hub-signature-256', `sha256=${digest}`)
            .set('Content-Type', 'application/json')
            .send(raw);

        expect(response.status).toBe(200);
        expect(response.body.ok).toBe(true);
    });

    it('rejects an invalid signature', async () => {
        const response = await request(app)
            .post('/webhook/instagram')
            .set('x-hub-signature-256', 'sha256=badbadbad')
            .send({ entry: [] });

        expect(response.status).toBe(403);
    });
});
