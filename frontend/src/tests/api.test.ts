import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import { expensesApi } from '@/services/api';

describe('expensesApi.create', () => {
  beforeEach(() => localStorage.setItem('accessToken', 'test-token'));
  afterEach(() => localStorage.clear());

  it('POSTs to /api/v1/expenses and returns the created expense', async () => {
    const result = await expensesApi.create({
      amount: 89.5,
      currency: 'USD',
      category: 'meals',
      description: 'Client dinner',
    });

    expect(result.id).toBe('exp-new');
    expect(result.status).toBe('draft');
  });

  it('sends the Authorization header with the stored token', async () => {
    let capturedAuth = '';
    server.use(
      http.post('/api/v1/expenses', ({ request }) => {
        capturedAuth = request.headers.get('authorization') ?? '';
        return HttpResponse.json({ id: 'exp-new', status: 'draft' }, { status: 201 });
      })
    );

    await expensesApi.create({ amount: 50, currency: 'USD', category: 'meals', description: 'Test' });
    expect(capturedAuth).toBe('Bearer test-token');
  });

  it('throws when the server returns 400', async () => {
    server.use(
      http.post('/api/v1/expenses', () =>
        HttpResponse.json({ error: { message: 'Validation failed', code: 'VALIDATION_ERROR' } }, { status: 400 })
      )
    );

    await expect(
      expensesApi.create({ amount: -1, currency: 'USD', category: 'meals', description: 'Bad' })
    ).rejects.toThrow();
  });
});

describe('expensesApi.list', () => {
  beforeEach(() => localStorage.setItem('accessToken', 'test-token'));
  afterEach(() => localStorage.clear());

  it('GETs /api/v1/expenses and returns paginated result', async () => {
    const result = await expensesApi.list({ page: 1, limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
  });
});

describe('expensesApi.submit', () => {
  beforeEach(() => localStorage.setItem('accessToken', 'test-token'));
  afterEach(() => localStorage.clear());

  it('POSTs to /:id/submit and returns submitted expense', async () => {
    const result = await expensesApi.submit('exp-001');
    expect(result.status).toBe('submitted');
  });
});
