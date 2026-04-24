import { Request, Response } from 'express';
import { ExpenseService } from './expense.service';
import { ExpenseQuery } from './expense.types';

export class ExpenseController {
  constructor(private readonly service: ExpenseService = new ExpenseService()) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.listExpenses(req.userId, req.query as unknown as ExpenseQuery);
    res.json(result);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const expense = await this.service.getExpense(req.params.id, req.userId, req.userRole);
    res.json(expense);
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const expense = await this.service.createExpense(req.userId, req.body);
    res.status(201).json(expense);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const expense = await this.service.updateExpense(req.params.id, req.userId, req.body);
    res.json(expense);
  };

  submit = async (req: Request, res: Response): Promise<void> => {
    const expense = await this.service.submitExpense(req.params.id, req.userId);
    res.json(expense);
  };

  approve = async (req: Request, res: Response): Promise<void> => {
    const expense = await this.service.approveOrRejectExpense(
      req.params.id,
      req.userId,
      req.userRole,
      req.body
    );
    res.json(expense);
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    await this.service.deleteExpense(req.params.id, req.userId);
    res.status(204).send();
  };
}
