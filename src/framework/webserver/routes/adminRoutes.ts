import { Router } from 'express';
import { adminController } from '../../../adapters/controllers/admin/adminController';
import { requireAdminAuth } from '../middlewares/adminAuthMiddleware';
import { asyncHandler } from '../response/asyncHandler';

const multer = require('multer') as any;

export const adminRoutes = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

adminRoutes.post('/auth/login', asyncHandler(adminController.login));

adminRoutes.use(requireAdminAuth);

adminRoutes.get('/dashboard', asyncHandler(adminController.dashboard));
adminRoutes.get('/analytics', asyncHandler(adminController.analytics));

adminRoutes.get('/users', asyncHandler(adminController.listUsers));
adminRoutes.get('/users/:id', asyncHandler(adminController.userDetail));
adminRoutes.patch('/users/:id/status', asyncHandler(adminController.updateUserStatus));
adminRoutes.post('/users/:id/wallet-adjustment', asyncHandler(adminController.walletAdjustment));

adminRoutes.get('/competitions', asyncHandler(adminController.listCompetitions));
adminRoutes.post('/competitions', asyncHandler(adminController.createCompetition));
adminRoutes.get('/competitions/:id', asyncHandler(adminController.competitionDetail));
adminRoutes.patch('/competitions/:id', asyncHandler(adminController.updateCompetition));
adminRoutes.post('/competitions/:id/publish', asyncHandler(adminController.publishCompetition));
adminRoutes.post('/competitions/:id/close', asyncHandler(adminController.closeCompetition));
adminRoutes.post('/competitions/:id/rerun-leaderboard', asyncHandler(adminController.rerunLeaderboard));
adminRoutes.post('/competitions/:id/distribute-rewards', asyncHandler(adminController.distributeCompetitionRewards));

adminRoutes.get('/rewards', asyncHandler(adminController.listRewards));
adminRoutes.get('/iap-purchases', asyncHandler(adminController.listIapPurchases));
adminRoutes.post('/rewards/manual-adjustment', asyncHandler(adminController.manualRewardAdjustment));

adminRoutes.get('/vouchers', asyncHandler(adminController.listVouchers));
adminRoutes.post('/vouchers/logo-upload', upload.single('logo'), asyncHandler(adminController.uploadVoucherLogo));
adminRoutes.post('/vouchers', asyncHandler(adminController.createVoucher));
adminRoutes.post('/vouchers/:id/assign', asyncHandler(adminController.assignVoucher));
adminRoutes.post('/vouchers/:id/used', asyncHandler(adminController.markVoucherUsed));
adminRoutes.delete('/vouchers/:id', asyncHandler(adminController.deleteUsedVoucher));

adminRoutes.get('/notifications', asyncHandler(adminController.listNotifications));
adminRoutes.post('/notifications', asyncHandler(adminController.createNotification));
adminRoutes.get('/notifications/device-tokens', asyncHandler(adminController.notificationDeviceTokens));

adminRoutes.get('/audit-logs', asyncHandler(adminController.auditLogs));
