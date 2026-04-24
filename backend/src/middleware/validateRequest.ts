import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';

// ZodTypeAny (not AnyZodObject) so schemas using .refine() / .superRefine() are accepted.
// AnyZodObject only covers plain ZodObject shapes and rejects ZodEffects wrappers.
interface RequestSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

// Factory: returns an Express middleware that validates the specified request parts.
// Throws ZodError on failure — the global errorHandler serializes it to a 400 response.
//
// Usage:
//   router.post('/', validate({ body: CreateExpenseSchema }), controller.create)
export function validate(schemas: RequestSchemas) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (schemas.body) {
      req.body = await schemas.body.parseAsync(req.body);
    }
    if (schemas.query) {
      req.query = await schemas.query.parseAsync(req.query);
    }
    if (schemas.params) {
      req.params = await schemas.params.parseAsync(req.params);
    }
    next();
  };
}
