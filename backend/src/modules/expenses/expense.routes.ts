import { Router } from 'express';
import { ExpenseController } from './expense.controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validateRequest';
import { submissionRateLimiter } from '../../middleware/rateLimiter';
import {
  CreateExpenseSchema, UpdateExpenseSchema,
  ExpenseQuerySchema, ApproveExpenseSchema,
} from './expense.types';
import { z } from 'zod';

const router = Router();
const controller = new ExpenseController();

const IdParam = z.object({ id: z.string().uuid() });

// All expense routes require authentication
router.use(authenticate);

router.get('/summary/weekly', controller.weeklySummary);
router.get('/', validate({ query: ExpenseQuerySchema }), controller.list);
router.get('/:id', validate({ params: IdParam }), controller.getById);

router.post(
  '/',
  submissionRateLimiter,
  validate({ body: CreateExpenseSchema }),
  controller.create
);

router.patch(
  '/:id',
  validate({ params: IdParam, body: UpdateExpenseSchema }),
  controller.update
);

router.post(
  '/:id/submit',
  validate({ params: IdParam }),
  controller.submit
);

// Approval is a manager/admin action
router.post(
  '/:id/approve',
  requireRole('manager', 'admin'),
  validate({ params: IdParam, body: ApproveExpenseSchema }),
  controller.approve
);

router.delete(
  '/:id',
  validate({ params: IdParam }),
  controller.delete
);

export default router;
