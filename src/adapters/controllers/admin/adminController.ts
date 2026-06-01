import { Request, Response } from 'express';
import { z } from 'zod';
import { adminAuthService } from '../../../application/services/admin/adminAuthService';
import { adminService } from '../../../application/services/admin/adminService';
import { s3StorageService } from '../../../application/services/storage/s3StorageService';
import { AdminRequest } from '../../../framework/webserver/middlewares/adminAuthMiddleware';
import { sendSuccess } from '../../../framework/webserver/response/response';
import { ApiError } from '../../../framework/webserver/response/ApiError';

const rewardSchema = z.object({
  rankFrom: z.number().int().min(1),
  rankTo: z.number().int().min(1),
  rewardType: z.enum(['voucher_badge', 'diamonds_coins', 'coins', 'diamonds', 'participation']),
  value: z.string().optional(),
  coins: z.number().int().min(0).optional(),
  diamonds: z.number().int().min(0).optional(),
});

const competitionSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  type: z.enum(['global', 'country', 'city']).default('global'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  entryFeeDiamonds: z.number().int().min(0).max(100).default(1),
  selectedVoucherId: z.string().min(1).optional(),
  rewards: z.array(rewardSchema).default([]),
});

const competitionUpdateSchema = competitionSchema.partial();

const statusSchema = z.object({
  status: z.enum(['active', 'disabled']),
  reason: z.string().max(300).optional(),
});

const walletAdjustmentSchema = z.object({
  currency: z.enum(['coins', 'diamonds']),
  amount: z.number().int().min(-100000).max(100000),
  reason: z.string().min(1).max(300),
  internalNote: z.string().max(1000).optional(),
});

const iapPurchaseQuerySchema = z.object({
  userId: z.string().min(1).optional(),
  platform: z.enum(['all', 'ios', 'android']).optional(),
  status: z.enum(['all', 'verified', 'failed']).optional(),
});

const reasonSchema = z.object({
  reason: z.string().max(300).optional(),
});

const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const notificationSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  type: z.enum(['competition', 'reward', 'motivation', 'streak', 'system']).default('system'),
  target: z.enum(['all', 'country', 'city', 'inactive', 'streak_at_risk']).default('all'),
  route: z.string().max(80).nullable().optional(),
  publishAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

const voucherSchema = z.object({
  code: z.string().min(3).max(160),
  title: z.string().min(1).max(120).optional(),
  provider: z.string().min(1).max(80).optional(),
  category: z.string().min(1).max(80).optional(),
  valueLabel: z.string().max(80).nullable().optional(),
  redemptionUrl: z.string().url().max(500).nullable().optional(),
  platformLogoUrl: z.string().url().max(500).nullable().optional(),
  terms: z.string().max(1000).optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

const voucherAssignSchema = z.object({
  userId: z.string().min(1),
  competitionId: z.string().optional(),
  reason: z.string().max(300).optional(),
});

const getAdminId = (req: Request) => (req as AdminRequest).admin?.adminId || 'admin_api_token';
const getParam = (req: Request, key: string) => String(req.params[key]);
type UploadedFile = { buffer: Buffer; mimetype: string; originalname: string; size: number };

export const adminController = {
  login: async (req: Request, res: Response) => {
    const input = adminLoginSchema.parse(req.body);
    const session = await adminAuthService.login(input);
    sendSuccess(res, session);
  },

  dashboard: async (_req: Request, res: Response) => {
    sendSuccess(res, { dashboard: await adminService.getDashboard() });
  },

  analytics: async (_req: Request, res: Response) => {
    sendSuccess(res, { analytics: await adminService.getAnalytics() });
  },

  listUsers: async (req: Request, res: Response) => {
    const users = await adminService.listUsers({
      search: req.query.search ? String(req.query.search) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      country: req.query.country ? String(req.query.country) : undefined,
    });
    sendSuccess(res, { users });
  },

  userDetail: async (req: Request, res: Response) => {
    sendSuccess(res, await adminService.getUserDetail(getParam(req, 'id')));
  },

  updateUserStatus: async (req: Request, res: Response) => {
    const input = statusSchema.parse(req.body);
    const user = await adminService.updateUserStatus({
      adminId: getAdminId(req),
      userId: getParam(req, 'id'),
      status: input.status,
      reason: input.reason,
    });
    sendSuccess(res, { user });
  },

  walletAdjustment: async (req: Request, res: Response) => {
    const input = walletAdjustmentSchema.parse(req.body);
    const data = await adminService.adjustWallet({
      adminId: getAdminId(req),
      userId: getParam(req, 'id'),
      ...input,
    });
    sendSuccess(res, data, 201);
  },

  listCompetitions: async (_req: Request, res: Response) => {
    sendSuccess(res, { competitions: await adminService.listCompetitions() });
  },

  competitionDetail: async (req: Request, res: Response) => {
    sendSuccess(res, await adminService.getCompetitionDetail(getParam(req, 'id')));
  },

  createCompetition: async (req: Request, res: Response) => {
    const input = competitionSchema.parse(req.body);
    const competition = await adminService.createCompetition({
      adminId: getAdminId(req),
      ...input,
    });
    sendSuccess(res, { competition }, 201);
  },

  updateCompetition: async (req: Request, res: Response) => {
    const updates = competitionUpdateSchema.parse(req.body);
    const competition = await adminService.updateCompetition({
      adminId: getAdminId(req),
      competitionId: getParam(req, 'id'),
      updates,
    });
    sendSuccess(res, { competition });
  },

  publishCompetition: async (req: Request, res: Response) => {
    const input = reasonSchema.parse(req.body);
    const competition = await adminService.setCompetitionStatus({
      adminId: getAdminId(req),
      competitionId: getParam(req, 'id'),
      status: 'active',
      action: 'competition_publish',
      reason: input.reason,
    });
    sendSuccess(res, { competition });
  },

  closeCompetition: async (req: Request, res: Response) => {
    const input = reasonSchema.parse(req.body);
    const competition = await adminService.setCompetitionStatus({
      adminId: getAdminId(req),
      competitionId: getParam(req, 'id'),
      status: 'closed',
      action: 'competition_close',
      reason: input.reason,
    });
    const distribution = await adminService.distributeCompetitionRewards({
      adminId: getAdminId(req),
      competitionId: getParam(req, 'id'),
      reason: input.reason || 'Rewards distributed after competition close',
    });
    sendSuccess(res, { competition: distribution.competition || competition, distribution });
  },

  rerunLeaderboard: async (req: Request, res: Response) => {
    const input = reasonSchema.parse(req.body);
    const data = await adminService.rerunLeaderboard({
      adminId: getAdminId(req),
      competitionId: getParam(req, 'id'),
      reason: input.reason,
    });
    sendSuccess(res, data);
  },

  distributeCompetitionRewards: async (req: Request, res: Response) => {
    const input = reasonSchema.parse(req.body);
    const data = await adminService.distributeCompetitionRewards({
      adminId: getAdminId(req),
      competitionId: getParam(req, 'id'),
      reason: input.reason,
    });
    sendSuccess(res, data);
  },

  listRewards: async (req: Request, res: Response) => {
    const rewards = await adminService.listRewards({
      userId: req.query.userId ? String(req.query.userId) : undefined,
      type: req.query.type ? String(req.query.type) : undefined,
      currency: req.query.currency ? String(req.query.currency) : undefined,
    });
    sendSuccess(res, { rewards });
  },

  listIapPurchases: async (req: Request, res: Response) => {
    const query = iapPurchaseQuerySchema.parse(req.query);
    const purchases = await adminService.listIapPurchases({
      userId: query.userId,
      platform: query.platform,
      status: query.status,
    });
    sendSuccess(res, { purchases });
  },

  manualRewardAdjustment: async (req: Request, res: Response) => {
    const input = walletAdjustmentSchema.extend({ userId: z.string().min(1) }).parse(req.body);
    const data = await adminService.adjustWallet({
      adminId: getAdminId(req),
      userId: input.userId,
      currency: input.currency,
      amount: input.amount,
      reason: input.reason,
      internalNote: input.internalNote,
    });
    sendSuccess(res, data, 201);
  },

  auditLogs: async (_req: Request, res: Response) => {
    sendSuccess(res, { auditLogs: await adminService.listAuditLogs() });
  },

  listVouchers: async (_req: Request, res: Response) => {
    sendSuccess(res, { vouchers: await adminService.listVouchers() });
  },

  uploadVoucherLogo: async (req: Request, res: Response) => {
    const file = (req as Request & { file?: UploadedFile }).file;
    if (!file) throw new ApiError('VALIDATION_ERROR', 'Voucher logo image is required.', 400);
    if (file.size > 2 * 1024 * 1024) {
      throw new ApiError('VALIDATION_ERROR', 'Voucher logo image must be 2MB or smaller.', 400);
    }

    const uploaded = await s3StorageService.uploadImage({
      buffer: file.buffer,
      contentType: file.mimetype,
      originalName: file.originalname,
      folder: 'vouchers/logos',
    });

    sendSuccess(res, { platformLogoUrl: uploaded.url, key: uploaded.key }, 201);
  },

  createVoucher: async (req: Request, res: Response) => {
    const input = voucherSchema.parse(req.body);
    const voucher = await adminService.createVoucher({
      adminId: getAdminId(req),
      voucher: input,
    });
    sendSuccess(res, { voucher }, 201);
  },

  assignVoucher: async (req: Request, res: Response) => {
    const input = voucherAssignSchema.parse(req.body);
    const voucher = await adminService.assignVoucher({
      adminId: getAdminId(req),
      voucherId: getParam(req, 'id'),
      userId: input.userId,
      competitionId: input.competitionId,
      reason: input.reason,
    });
    sendSuccess(res, { voucher });
  },

  markVoucherUsed: async (req: Request, res: Response) => {
    const input = reasonSchema.parse(req.body);
    const voucher = await adminService.markVoucherUsed({
      adminId: getAdminId(req),
      voucherId: getParam(req, 'id'),
      reason: input.reason,
    });
    sendSuccess(res, { voucher });
  },

  deleteUsedVoucher: async (req: Request, res: Response) => {
    const input = reasonSchema.parse(req.body || {});
    const voucher = await adminService.deleteUsedVoucher({
      adminId: getAdminId(req),
      voucherId: getParam(req, 'id'),
      reason: input.reason,
    });
    sendSuccess(res, { voucher });
  },

  listNotifications: async (_req: Request, res: Response) => {
    sendSuccess(res, { notifications: await adminService.listNotifications() });
  },

  createNotification: async (req: Request, res: Response) => {
    const input = notificationSchema.parse(req.body);
    const notification = await adminService.createNotification({
      adminId: getAdminId(req),
      ...input,
    });
    sendSuccess(res, { notification }, 201);
  },

  notificationDeviceTokens: async (_req: Request, res: Response) => {
    sendSuccess(res, await adminService.getNotificationDeviceTokens());
  },
};
