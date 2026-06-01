import { Router } from 'express';

export const healthRoutes = Router();

healthRoutes.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      service: 'doradrink-backend',
      timestamp: new Date().toISOString(),
    },
    meta: {},
  });
});
