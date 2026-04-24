import { z } from 'zod';

export const ExpenseStatus = z.enum(['draft', 'submitted', 'approved', 'rejected', 'reimbursed']);
export type ExpenseStatus = z.infer<typeof ExpenseStatus>;

export const ExpenseCategory = z.enum([
  'travel', 'accommodation', 'meals', 'transportation',
  'office_supplies', 'software', 'training', 'other',
]);
export type ExpenseCategory = z.infer<typeof ExpenseCategory>;

// The database row shape — what comes back from SQL queries
export interface ExpenseRow {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  description: string;
  receipt_url: string | null;
  status: ExpenseStatus;
  submitted_at: Date | null;
  approved_by: string | null;
  approved_at: Date | null;
  rejection_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

// The API-facing shape — camelCase, no internal fields
export interface Expense {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  description: string;
  receiptUrl: string | null;
  status: ExpenseStatus;
  submittedAt: Date | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// --- Request/Response schemas (used in middleware validate() and controllers) ---

export const CreateExpenseSchema = z.object({
  amount: z.number().positive().max(1_000_000, 'Amount exceeds single-expense limit'),
  currency: z.string().length(3).toUpperCase(),
  category: ExpenseCategory,
  description: z.string().min(3).max(500),
  receiptUrl: z.string().url().optional(),
  idempotencyKey: z.string().uuid('idempotencyKey must be a UUID').optional(),
});
export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>;

export const UpdateExpenseSchema = CreateExpenseSchema.partial().omit({ idempotencyKey: true });
export type UpdateExpenseInput = z.infer<typeof UpdateExpenseSchema>;

export const ExpenseQuerySchema = z.object({
  status: ExpenseStatus.optional(),
  category: ExpenseCategory.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ExpenseQuery = z.infer<typeof ExpenseQuerySchema>;

export const ApproveExpenseSchema = z.object({
  action: z.enum(['approve', 'reject']),
  rejectionReason: z.string().min(10).optional(),
}).refine(
  (data) => data.action !== 'reject' || !!data.rejectionReason,
  { message: 'rejectionReason is required when rejecting', path: ['rejectionReason'] }
);
export type ApproveExpenseInput = z.infer<typeof ApproveExpenseSchema>;
