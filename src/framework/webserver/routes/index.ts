import { Router } from 'express';
import { authRoutes } from './authRoutes';
import { healthRoutes } from './healthRoutes';
import { userRoutes } from './userRoutes';
import { walletRoutes } from './walletRoutes';
import { adminRoutes } from './adminRoutes';
import { competitionRoutes } from './competitionRoutes';
import { notificationRoutes } from './notificationRoutes';
import { voucherRoutes } from './voucherRoutes';

export const routes = Router();

routes.use('/health', healthRoutes);
routes.use('/api/health', healthRoutes);
routes.use('/api/auth', authRoutes);
routes.use('/api/users', userRoutes);
routes.use('/api/wallet', walletRoutes);
routes.use('/api/competitions', competitionRoutes);
routes.use('/api/notifications', notificationRoutes);
routes.use('/api/vouchers', voucherRoutes);
routes.use('/api/admin', adminRoutes);
