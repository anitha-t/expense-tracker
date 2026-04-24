import { Router, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validateRequest';
import { authRateLimiter } from '../../middleware/rateLimiter';
import { RegisterSchema, LoginSchema, RefreshSchema } from './auth.types';

const router = Router();
const service = new AuthService();

router.post('/register', authRateLimiter, validate({ body: RegisterSchema }), async (req: Request, res: Response) => {
  const tokens = await service.register(req.body);
  res.status(201).json(tokens);
});

router.post('/login', authRateLimiter, validate({ body: LoginSchema }), async (req: Request, res: Response) => {
  const tokens = await service.login(req.body);
  res.json(tokens);
});

router.post('/refresh', validate({ body: RefreshSchema }), async (req: Request, res: Response) => {
  const tokens = await service.refresh(req.body.refreshToken);
  res.json(tokens);
});

router.post('/logout', authenticate, async (req: Request, res: Response) => {
  await service.logout(req.userId, req.body.refreshToken ?? '');
  res.status(204).send();
});

export default router;
