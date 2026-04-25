import { http, HttpResponse } from 'msw';
import { Expense } from '@/types';

export const mockExpense: Expense = {
  id: 'exp-001',
  userId: 'user-123',
  amount: '89.50',
  currency: 'USD',
  category: 'meals',
  description: 'Client dinner',
  receiptUrl: null,
  status: 'draft',
  submittedAt: null,
  approvedBy: null,
  approvedAt: null,
  rejectionReason: null,
  createdAt: '2026-04-25T10:00:00.000Z',
  updatedAt: '2026-04-25T10:00:00.000Z',
};

export const handlers = [
  // List expenses
  http.get('/api/v1/expenses', () =>
    HttpResponse.json({ items: [mockExpense], total: 1, page: 1, totalPages: 1 })
  ),

  // Create expense — returns the new expense with status 'draft'
  http.post('/api/v1/expenses', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...mockExpense, ...body, id: 'exp-new' }, { status: 201 });
  }),

  // Submit
  http.post('/api/v1/expenses/:id/submit', ({ params }) =>
    HttpResponse.json({ ...mockExpense, id: params.id as string, status: 'submitted' })
  ),

  // Approve/reject
  http.post('/api/v1/expenses/:id/approve', async ({ params, request }) => {
    const body = await request.json() as { action: string };
    return HttpResponse.json({
      ...mockExpense,
      id: params.id as string,
      status: body.action === 'approve' ? 'approved' : 'rejected',
    });
  }),

  // Delete
  http.delete('/api/v1/expenses/:id', () => new HttpResponse(null, { status: 204 })),
];
