import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import { env } from '../../src/config/env';
import * as db from '../../src/config/database';
import * as redis from '../../src/config/redis';

// Integration tests: real Express + real middleware, but mocked DB and Redis.
// This catches auth/validation/routing issues that pure unit tests miss.
jest.mock('../../src/config/database');
jest.mock('../../src/config/redis');
jest.mock('../../src/modules/expenses/expense.repository');

// Sign tokens with the same secret env.ts loaded — avoids signing/verification mismatch.
function makeToken(userId = 'user-123', role = 'employee'): string {
  return jwt.sign({ sub: userId, role }, env.JWT_SECRET, { expiresIn: '1h' });
}

const validExpense = {
  amount: 99.99,
  currency: 'USD',
  category: 'meals',
  description: 'Team lunch',
};

describe('POST /api/v1/expenses', () => {
  beforeEach(() => {
    jest.spyOn(redis, 'cacheGet').mockResolvedValue(null);
    jest.spyOn(redis, 'cacheSet').mockResolvedValue();
    jest.spyOn(redis, 'setIdempotencyKey').mockResolvedValue(true);
  });

  it('returns 401 when no Authorization header', async () => {
    const res = await request(app).post('/api/v1/expenses').send(validExpense);
    expect(res.status).toBe(401);
  });

  it('returns 400 for a negative amount', async () => {
    const res = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validExpense, amount: -50 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.amount).toBeDefined();
  });

  it('returns 400 for a missing description', async () => {
    const res = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ amount: 50, currency: 'USD', category: 'meals' });

    expect(res.status).toBe(400);
    expect(res.body.error.details.description).toBeDefined();
  });

  it('returns 400 for an invalid category', async () => {
    const res = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validExpense, category: 'pizza' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/expenses/:id/approve', () => {
  it('returns 403 when an employee tries to approve', async () => {
    const res = await request(app)
      .post('/api/v1/expenses/550e8400-e29b-41d4-a716-446655440000/approve')
      .set('Authorization', `Bearer ${makeToken('user-123', 'employee')}`)
      .send({ action: 'approve' });

    expect(res.status).toBe(403);
  });
});

describe('GET /health', () => {
  it('returns 200 when DB and Redis are healthy', async () => {
    jest.spyOn(db, 'checkDatabaseHealth').mockResolvedValue(true);
    jest.spyOn(redis, 'checkRedisHealth').mockResolvedValue(true);

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('returns 503 when DB is down', async () => {
    jest.spyOn(db, 'checkDatabaseHealth').mockResolvedValue(false);
    jest.spyOn(redis, 'checkRedisHealth').mockResolvedValue(true);

    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.db).toBe('down');
  });
});
