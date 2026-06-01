import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from '../../config/config';
import { routes } from './routes';
import { errorMiddleware } from './middlewares/errorMiddleware';

export const createServer = () => {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({
    origin: config.corsOrigin.includes('*') ? true : config.corsOrigin,
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));

  app.use(routes);
  app.use(errorMiddleware);

  return app;
};
