import { Response } from 'express';

export const sendSuccess = (res: Response, data: unknown, statusCode = 200, meta: Record<string, unknown> = {}) => {
  res.status(statusCode).json({
    success: true,
    data,
    meta,
  });
};
