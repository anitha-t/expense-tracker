import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly isOperational = true
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

interface ErrorResponse {
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
  requestId?: string;
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Validation errors from Zod — return field-level detail to the client
  // (not a security risk: these are input shape errors, not internals)
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: err.flatten().fieldErrors,
      },
      requestId: req.requestId,
    } satisfies ErrorResponse);
    return;
  }

  // Our own operational errors (404, 403, 409, etc.)
  if (err instanceof AppError && err.isOperational) {
    res.status(err.statusCode).json({
      error: { message: err.message },
      requestId: req.requestId,
    } satisfies ErrorResponse);
    return;
  }

  // Unexpected errors — log full detail internally, return opaque message externally.
  // OWASP A05: never expose internals to clients.
  logger.error({
    msg: 'Unhandled error',
    err: err.message,
    stack: err.stack,
    requestId: req.requestId,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    error: {
      message: 'An unexpected error occurred',
      code: 'INTERNAL_SERVER_ERROR',
    },
    requestId: req.requestId,
  } satisfies ErrorResponse);
}
