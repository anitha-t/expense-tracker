import { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getPool } from '../../config/database';
import {
  Expense, ExpenseRow, CreateExpenseInput,
  UpdateExpenseInput, ExpenseQuery, ExpenseStatus,
} from './expense.types';

// Map snake_case DB columns → camelCase domain object.
// Centralised here so callers always work with consistent shapes.
function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    userId: row.user_id,
    amount: row.amount,
    currency: row.currency,
    category: row.category,
    description: row.description,
    receiptUrl: row.receipt_url,
    status: row.status,
    submittedAt: row.submitted_at,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ExpenseRepository {
  private pool: Pool;

  constructor(pool?: Pool) {
    // Allow injection for tests — fall back to singleton pool in production
    this.pool = pool ?? getPool();
  }

  // mysql2 TypeScript types don't model named placeholder values as a valid
  // ExecuteValues variant (known open issue). The runtime supports them when
  // namedPlaceholders: true is set in the pool config. This wrapper isolates
  // the single `any` cast so all call sites stay type-safe for everything else.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private exec<T extends RowDataPacket[] | ResultSetHeader>(sql: string, params?: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.pool.execute<T>(sql, params as any);
  }

  async findById(id: string, userId?: string): Promise<Expense | null> {
    // If userId is provided, scope to that user (employees can't read others' expenses)
    const [rows] = await this.exec<(ExpenseRow & RowDataPacket)[]>(
      userId
        ? 'SELECT * FROM expenses WHERE id = :id AND user_id = :userId LIMIT 1'
        : 'SELECT * FROM expenses WHERE id = :id LIMIT 1',
      { id, userId }
    );
    return rows[0] ? toExpense(rows[0]) : null;
  }

  async findMany(userId: string, query: ExpenseQuery): Promise<{ items: Expense[]; total: number }> {
    const conditions: string[] = ['user_id = :userId'];
    const params: Record<string, unknown> = { userId };

    if (query.status) { conditions.push('status = :status'); params.status = query.status; }
    if (query.category) { conditions.push('category = :category'); params.category = query.category; }
    if (query.from) { conditions.push('created_at >= :from'); params.from = query.from; }
    if (query.to) { conditions.push('created_at <= :to'); params.to = query.to; }

    const where = conditions.join(' AND ');
    const offset = (query.page - 1) * query.limit;

    const [[{ total }]] = await this.exec<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) AS total FROM expenses WHERE ${where}`,
      params
    );

    // LIMIT/OFFSET cannot use named placeholders in MySQL prepared statements.
    // Both values are validated integers from Zod (min 1, max 100), so interpolation is safe.
    const [rows] = await this.exec<(ExpenseRow & RowDataPacket)[]>(
      `SELECT * FROM expenses WHERE ${where} ORDER BY created_at DESC LIMIT ${query.limit} OFFSET ${offset}`,
      params
    );

    return { items: rows.map(toExpense), total };
  }

  async create(userId: string, input: CreateExpenseInput): Promise<Expense> {
    const id = crypto.randomUUID();
    await this.exec(
      `INSERT INTO expenses (id, user_id, amount, currency, category, description, receipt_url, status)
       VALUES (:id, :userId, :amount, :currency, :category, :description, :receiptUrl, 'draft')`,
      { id, userId, ...input, receiptUrl: input.receiptUrl ?? null }
    );
    const expense = await this.findById(id);
    if (!expense) throw new Error('Failed to retrieve expense after insert');
    return expense;
  }

  async update(id: string, userId: string, input: UpdateExpenseInput): Promise<Expense | null> {
    const fields = Object.entries(input)
      .filter(([, v]) => v !== undefined)
      .map(([k]) => `${toSnake(k)} = :${k}`)
      .join(', ');

    if (!fields) return this.findById(id, userId);

    await this.exec(
      `UPDATE expenses SET ${fields}, updated_at = NOW() WHERE id = :id AND user_id = :userId AND status = 'draft'`,
      { ...input, id, userId }
    );
    return this.findById(id, userId);
  }

  async updateStatus(
    id: string,
    status: ExpenseStatus,
    approvedBy?: string,
    rejectionReason?: string
  ): Promise<void> {
    await this.exec(
      `UPDATE expenses
       SET status = :status,
           approved_by = :approvedBy,
           approved_at = CASE WHEN :status = 'approved' THEN NOW() ELSE NULL END,
           rejection_reason = :rejectionReason,
           submitted_at = CASE WHEN :status = 'submitted' THEN NOW() ELSE submitted_at END,
           updated_at = NOW()
       WHERE id = :id`,
      { id, status, approvedBy: approvedBy ?? null, rejectionReason: rejectionReason ?? null }
    );
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const [result] = await this.exec<ResultSetHeader>(
      `DELETE FROM expenses WHERE id = :id AND user_id = :userId AND status = 'draft'`,
      { id, userId }
    );
    return result.affectedRows > 0;
  }
}

function toSnake(camel: string): string {
  return camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}
