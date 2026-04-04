jest.mock('../src/services/securityAgentService', () => ({
    recordSecurityEvent: jest.fn().mockResolvedValue({})
}));

const express = require('express');
const request = require('supertest');
const { createRateLimiter } = require('../src/middleware/rateLimit');

describe('token bucket rate limiter', () => {
    it('blocks bursts and refills over time', async () => {
        const app = express();
        app.use(createRateLimiter({ windowMs: 100, max: 2, prefix: 'test' }));
        app.get('/limited', (req, res) => res.status(200).json({ ok: true }));

        const first = await request(app).get('/limited');
        const second = await request(app).get('/limited');
        const third = await request(app).get('/limited');

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(third.status).toBe(429);

        await new Promise((resolve) => setTimeout(resolve, 75));

        const fourth = await request(app).get('/limited');
        expect(fourth.status).toBe(200);
    });
});
