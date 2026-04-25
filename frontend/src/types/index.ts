export const EXPENSE_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'reimbursed'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const EXPENSE_CATEGORIES = [
  'travel', 'accommodation', 'meals', 'transportation',
  'office_supplies', 'software', 'training', 'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type UserRole = 'employee' | 'manager' | 'admin';

export interface Expense {
  id: string;
  userId: string;
  amount: string;
  currency: string;
  category: ExpenseCategory;
  description: string;
  receiptUrl: string | null;
  status: ExpenseStatus;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedExpenses {
  items: Expense[];
  total: number;
  page: number;
  totalPages: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthUser {
  userId: string;
  role: UserRole;
}

export interface CreateExpenseInput {
  amount: number;
  currency: string;
  category: ExpenseCategory;
  description: string;
  receiptUrl?: string;
}

export interface ApproveExpenseInput {
  action: 'approve' | 'reject';
  rejectionReason?: string;
}
