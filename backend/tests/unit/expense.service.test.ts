import { ExpenseService } from '../../src/modules/expenses/expense.service';
import { ExpenseRepository } from '../../src/modules/expenses/expense.repository';
import * as redis from '../../src/config/redis';
import { AppError } from '../../src/middleware/errorHandler';
import { Expense } from '../../src/modules/expenses/expense.types';

// Mock the entire repository and Redis — unit tests don't touch real infrastructure
jest.mock('../../src/modules/expenses/expense.repository');
jest.mock('../../src/config/redis');

const MockRepository = ExpenseRepository as jest.MockedClass<typeof ExpenseRepository>;

const mockExpense: Expense = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  userId: 'user-123',
  amount: 150.00,
  currency: 'USD',
  category: 'meals',
  description: 'Client lunch',
  receiptUrl: 'https://s3.amazonaws.com/receipts/lunch.jpg',
  status: 'draft',
  submittedAt: null,
  approvedBy: null,
  approvedAt: null,
  rejectionReason: null,
  createdAt: new Date('2024-01-15'),
  updatedAt: new Date('2024-01-15'),
};

describe('ExpenseService', () => {
  let service: ExpenseService;
  let repoMock: jest.Mocked<ExpenseRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Stub Redis to always return cache miss so tests exercise the DB path
    jest.spyOn(redis, 'cacheGet').mockResolvedValue(null);
    jest.spyOn(redis, 'cacheSet').mockResolvedValue();
    jest.spyOn(redis, 'cacheDelete').mockResolvedValue();
    jest.spyOn(redis, 'setIdempotencyKey').mockResolvedValue(true);

    repoMock = new MockRepository() as jest.Mocked<ExpenseRepository>;
    service = new ExpenseService(repoMock);
  });

  describe('getExpense', () => {
    it('returns expense when found and requester is the owner', async () => {
      repoMock.findById.mockResolvedValue(mockExpense);
      const result = await service.getExpense(mockExpense.id, 'user-123', 'employee');
      expect(result).toEqual(mockExpense);
      expect(repoMock.findById).toHaveBeenCalledWith(mockExpense.id, 'user-123');
    });

    it('throws 404 when expense not found', async () => {
      repoMock.findById.mockResolvedValue(null);
      await expect(service.getExpense('nonexistent', 'user-123', 'employee'))
        .rejects.toThrow(new AppError(404, 'Expense not found'));
    });

    it('allows managers to view any expense (no user scope)', async () => {
      repoMock.findById.mockResolvedValue(mockExpense);
      await service.getExpense(mockExpense.id, 'manager-456', 'manager');
      expect(repoMock.findById).toHaveBeenCalledWith(mockExpense.id, undefined);
    });
  });

  describe('createExpense', () => {
    const input = {
      amount: 150, currency: 'USD', category: 'meals' as const,
      description: 'Client lunch',
    };

    it('creates and returns a new expense', async () => {
      repoMock.create.mockResolvedValue(mockExpense);
      const result = await service.createExpense('user-123', input);
      expect(result).toEqual(mockExpense);
    });

    it('rejects duplicate idempotency keys', async () => {
      jest.spyOn(redis, 'setIdempotencyKey').mockResolvedValue(false);
      await expect(service.createExpense('user-123', { ...input, idempotencyKey: 'some-uuid' }))
        .rejects.toThrow(AppError);
    });
  });

  describe('submitExpense', () => {
    it('throws 409 when expense is not in draft status', async () => {
      repoMock.findById.mockResolvedValue({ ...mockExpense, status: 'submitted' });
      await expect(service.submitExpense(mockExpense.id, 'user-123'))
        .rejects.toThrow(new AppError(409, 'Only draft expenses can be submitted'));
    });

    it('throws 422 when no receipt is attached', async () => {
      repoMock.findById.mockResolvedValue({ ...mockExpense, receiptUrl: null });
      await expect(service.submitExpense(mockExpense.id, 'user-123'))
        .rejects.toThrow(new AppError(422, 'A receipt is required before submission'));
    });

    it('updates status to submitted when valid', async () => {
      repoMock.findById
        .mockResolvedValueOnce(mockExpense)
        .mockResolvedValueOnce({ ...mockExpense, status: 'submitted' });
      repoMock.updateStatus.mockResolvedValue();

      const result = await service.submitExpense(mockExpense.id, 'user-123');
      expect(result.status).toBe('submitted');
      expect(repoMock.updateStatus).toHaveBeenCalledWith(mockExpense.id, 'submitted');
    });
  });

  describe('approveOrRejectExpense', () => {
    it('throws 403 when an employee tries to approve', async () => {
      await expect(
        service.approveOrRejectExpense('id', 'user-123', 'employee', { action: 'approve' })
      ).rejects.toThrow(new AppError(403, 'Insufficient permissions to approve expenses'));
    });

    it('throws 409 when expense is not submitted', async () => {
      repoMock.findById.mockResolvedValue({ ...mockExpense, status: 'draft' });
      await expect(
        service.approveOrRejectExpense(mockExpense.id, 'mgr-1', 'manager', { action: 'approve' })
      ).rejects.toThrow(new AppError(409, 'Only submitted expenses can be approved or rejected'));
    });

    it('approves a submitted expense', async () => {
      const submitted = { ...mockExpense, status: 'submitted' as const };
      repoMock.findById
        .mockResolvedValueOnce(submitted)
        .mockResolvedValueOnce({ ...submitted, status: 'approved' });
      repoMock.updateStatus.mockResolvedValue();

      const result = await service.approveOrRejectExpense(
        mockExpense.id, 'mgr-1', 'manager', { action: 'approve' }
      );
      expect(result.status).toBe('approved');
    });
  });
});
