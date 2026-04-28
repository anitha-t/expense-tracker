import OpenAI from 'openai';
import { ExpenseRepository } from './expense.repository';
import {
  Expense, CreateExpenseInput, UpdateExpenseInput,
  ExpenseQuery, ApproveExpenseInput,
} from './expense.types';
import { cacheGet, cacheSet, cacheDelete, setIdempotencyKey } from '../../config/redis';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';

const LIST_CACHE_TTL = 60; // seconds

export class ExpenseService {
  constructor(private readonly repo: ExpenseRepository = new ExpenseRepository()) {}

  async getExpense(id: string, requestingUserId: string, requestingRole: string): Promise<Expense> {
    const cacheKey = `expense:${id}`;
    const cached = await cacheGet<Expense>(cacheKey);
    if (cached) return cached;

    // Admins/managers can view any expense; employees only their own
    const scopedUserId = requestingRole === 'employee' ? requestingUserId : undefined;
    const expense = await this.repo.findById(id, scopedUserId);
    if (!expense) throw new AppError(404, 'Expense not found');

    await cacheSet(cacheKey, expense);
    return expense;
  }

  async listExpenses(
    userId: string,
    query: ExpenseQuery
  ): Promise<{ items: Expense[]; total: number; page: number; totalPages: number }> {
    const cacheKey = `expenses:${userId}:${JSON.stringify(query)}`;
    const cached = await cacheGet<ReturnType<typeof this.listExpenses> extends Promise<infer T> ? T : never>(cacheKey);
    if (cached) return cached;

    const { items, total } = await this.repo.findMany(userId, query);
    const result = { items, total, page: query.page, totalPages: Math.ceil(total / query.limit) };

    await cacheSet(cacheKey, result, LIST_CACHE_TTL);
    return result;
  }

  async createExpense(userId: string, input: CreateExpenseInput): Promise<Expense> {
    // Idempotency: if the client retries with the same key, return the existing expense
    // instead of creating a duplicate. Key is stored in Redis for 24h.
    if (input.idempotencyKey) {
      const isNew = await setIdempotencyKey(`idempotent:expense:${input.idempotencyKey}`);
      if (!isNew) {
        logger.info({ msg: 'Idempotent request — skipping duplicate create', userId });
        throw new AppError(409, 'Duplicate request: expense with this idempotency key already exists');
      }
    }

    const expense = await this.repo.create(userId, input);
    await this.invalidateUserCache(userId);

    logger.info({ msg: 'Expense created', userId, expenseId: expense.id, amount: expense.amount });
    return expense;
  }

  async updateExpense(id: string, userId: string, input: UpdateExpenseInput): Promise<Expense> {
    const existing = await this.repo.findById(id, userId);
    if (!existing) throw new AppError(404, 'Expense not found');
    if (existing.status !== 'draft') throw new AppError(409, 'Only draft expenses can be edited');

    const updated = await this.repo.update(id, userId, input);
    if (!updated) throw new AppError(404, 'Expense not found');

    await cacheDelete(`expense:${id}`);
    await this.invalidateUserCache(userId);
    return updated;
  }

  async submitExpense(id: string, userId: string): Promise<Expense> {
    const expense = await this.repo.findById(id, userId);
    if (!expense) throw new AppError(404, 'Expense not found');
    if (expense.status !== 'draft') throw new AppError(409, 'Only draft expenses can be submitted');
    if (!expense.receiptUrl) throw new AppError(422, 'A receipt is required before submission');

    await this.repo.updateStatus(id, 'submitted');
    await cacheDelete(`expense:${id}`);
    await this.invalidateUserCache(userId);

    logger.info({ msg: 'Expense submitted for approval', userId, expenseId: id });
    return (await this.repo.findById(id))!;
  }

  async approveOrRejectExpense(
    id: string,
    approverId: string,
    approverRole: string,
    input: ApproveExpenseInput
  ): Promise<Expense> {
    if (approverRole === 'employee') throw new AppError(403, 'Insufficient permissions to approve expenses');

    const expense = await this.repo.findById(id);
    if (!expense) throw new AppError(404, 'Expense not found');
    if (expense.status !== 'submitted') throw new AppError(409, 'Only submitted expenses can be approved or rejected');

    const newStatus = input.action === 'approve' ? 'approved' : 'rejected';
    await this.repo.updateStatus(id, newStatus, approverId, input.rejectionReason);
    await cacheDelete(`expense:${id}`);
    await this.invalidateUserCache(expense.userId);

    logger.info({ msg: `Expense ${newStatus}`, approverId, expenseId: id });
    return (await this.repo.findById(id))!;
  }

  async deleteExpense(id: string, userId: string): Promise<void> {
    const deleted = await this.repo.delete(id, userId);
    if (!deleted) throw new AppError(404, 'Expense not found or cannot be deleted');

    await cacheDelete(`expense:${id}`);
    await this.invalidateUserCache(userId);
  }

  async getWeeklySummary(userId: string): Promise<{ summary: string; data: object }> {
    const { apiKey, baseURL, model } = this.resolveAIProvider();

    const cacheKey = `weekly-summary:${userId}`;
    const cached = await cacheGet<{ summary: string; data: object }>(cacheKey);
    if (cached) return cached;

    const data = await this.repo.getWeeklySummaryData(userId);

    if (data.expenseCount === 0) {
      return { summary: 'You have no expenses recorded in the past 7 days.', data };
    }

    const categoryLines = data.byCategory
      .map((c) => `  - ${c.category}: ${data.currency} ${c.total.toFixed(2)} across ${c.count} expense(s)`)
      .join('\n');

    const statusLines = data.statusBreakdown
      .map((s) => `  - ${s.count} ${s.status}`)
      .join('\n');

    const prompt = `You are a helpful financial assistant. Generate a concise, friendly weekly spending summary in 3–4 sentences based on this data:

Total spent: ${data.currency} ${data.totalAmount.toFixed(2)} across ${data.expenseCount} expense(s)

Breakdown by category:
${categoryLines}

Status breakdown:
${statusLines}

${data.largestExpense ? `Largest single expense: ${data.currency} ${data.largestExpense.amount.toFixed(2)} for "${data.largestExpense.description}" (${data.largestExpense.category})` : ''}

Write in second person ("You spent…"). Mention the top spending category, highlight the largest expense if notable, and end with one practical observation or tip.`;

    try {
      const client = new OpenAI({ apiKey, baseURL });
      const completion = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.7,
      });

      const summary = completion.choices[0]?.message?.content?.trim() ?? 'Unable to generate summary.';
      logger.info({ msg: 'Weekly summary generated', userId, expenseCount: data.expenseCount, model });

      const result = { summary, data };
      await cacheSet(cacheKey, result, 3600);
      return result;
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429) throw new AppError(503, 'AI provider quota exceeded — add billing or switch to GROQ_API_KEY');
      if (status === 401) throw new AppError(503, 'AI provider key is invalid — check GROQ_API_KEY or OPENAI_API_KEY');
      throw err;
    }
  }

  private resolveAIProvider(): { apiKey: string; baseURL?: string; model: string } {
    if (env.GROQ_API_KEY) {
      return {
        apiKey: env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
        model: 'llama-3.1-8b-instant',
      };
    }
    if (env.OPENAI_API_KEY) {
      return { apiKey: env.OPENAI_API_KEY, model: 'gpt-3.5-turbo' };
    }
    throw new AppError(503, 'Weekly summary is not configured — set GROQ_API_KEY (free) or OPENAI_API_KEY in .env');
  }

  private async invalidateUserCache(userId: string): Promise<void> {
    // Wildcard invalidation — clears all cached list pages for this user
    // In production with Redis cluster you'd use a tag-based invalidation strategy
    await cacheDelete(`expenses:${userId}:*`);
  }
}
