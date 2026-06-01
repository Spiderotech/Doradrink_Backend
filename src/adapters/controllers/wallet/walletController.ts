import { Request, Response } from 'express';
import { z } from 'zod';
import { getAuthenticatedWalletUseCase } from '../../../application/useCase/wallet/getAuthenticatedWalletUseCase';
import { getWalletUseCase } from '../../../application/useCase/wallet/getWalletUseCase';
import { walletService } from '../../../application/services/wallet/walletService';
import { AuthenticatedRequest } from '../../../framework/webserver/middlewares/authMiddleware';
import { ApiError } from '../../../framework/webserver/response/ApiError';
import { sendSuccess } from '../../../framework/webserver/response/response';

const getWalletSchema = z.object({
  userId: z.string().min(1),
});

const purchaseHistorySchema = z.object({
  userId: z.string().min(1),
});

const purchaseCoinPackSchema = z.object({
  userId: z.string().min(1),
  packId: z.enum(['starter', 'value', 'mega']),
  idempotencyKey: z.string().min(1).max(160),
});

const verifyIapPurchaseSchema = z.object({
  userId: z.string().min(1),
  platform: z.enum(['ios', 'android']),
  productId: z.enum(['coins_500', 'coins_1500', 'coins_3000']),
  transactionId: z.string().min(1).max(512).optional(),
  purchaseToken: z.string().min(1).max(4096).optional(),
  packageName: z.string().min(1).max(255).optional(),
});

const convertCoinsSchema = z.object({
  userId: z.string().min(1),
  idempotencyKey: z.string().min(1).max(160),
});

const claimRewardSchema = z.object({
  userId: z.string().min(1),
  coins: z.number().int().min(1).max(10000),
  title: z.string().min(1).max(160),
  rewardType: z.enum(['slot_completion', 'daily_bonus', 'spin_reward', 'ad_reward', 'competition_reward', 'manual_adjustment']),
  idempotencyKey: z.string().min(1).max(240),
  metadata: z.record(z.unknown()).optional(),
});

export const walletController = {
  getWallet: async (req: Request, res: Response) => {
    const { userId } = getWalletSchema.parse(req.query);
    const wallet = await getWalletUseCase(userId);
    sendSuccess(res, { wallet });
  },

  me: async (req: Request, res: Response) => {
    const auth = (req as AuthenticatedRequest).auth;

    if (!auth?.firebaseUid) {
      throw new ApiError('UNAUTHORIZED', 'Firebase auth is required.', 401);
    }

    const wallet = await getAuthenticatedWalletUseCase(auth.firebaseUid);
    sendSuccess(res, { wallet });
  },

  purchaseHistory: async (req: Request, res: Response) => {
    const { userId } = purchaseHistorySchema.parse(req.query);
    const purchases = await walletService.listIapPurchaseHistory(userId);
    sendSuccess(res, { purchases });
  },

  purchaseCoinPack: async (req: Request, res: Response) => {
    const input = purchaseCoinPackSchema.parse(req.body);
    const data = await walletService.purchaseCoinPack(input);
    sendSuccess(res, data, 201);
  },

  verifyIapPurchase: async (req: Request, res: Response) => {
    const input = verifyIapPurchaseSchema.parse(req.body);
    const data = await walletService.verifyIapPurchase(input);
    sendSuccess(res, data, 201);
  },

  convertCoinsToDiamond: async (req: Request, res: Response) => {
    const input = convertCoinsSchema.parse(req.body);
    const data = await walletService.convertCoinsToDiamond(input);
    sendSuccess(res, data, 201);
  },

  claimReward: async (req: Request, res: Response) => {
    const input = claimRewardSchema.parse(req.body);
    const data = await walletService.claimAppReward(input);
    sendSuccess(res, data, 201);
  },
};
