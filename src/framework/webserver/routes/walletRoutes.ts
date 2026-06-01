import { Router } from 'express';
import { walletController } from '../../../adapters/controllers/wallet/walletController';
import { requireFirebaseAuth } from '../middlewares/authMiddleware';
import { asyncHandler } from '../response/asyncHandler';

export const walletRoutes = Router();

walletRoutes.get('/me', requireFirebaseAuth, asyncHandler(walletController.me));
walletRoutes.get('/iap/history', asyncHandler(walletController.purchaseHistory));
walletRoutes.get('/', asyncHandler(walletController.getWallet));
walletRoutes.post('/iap/verify', asyncHandler(walletController.verifyIapPurchase));
walletRoutes.post('/coin-packs/purchase', asyncHandler(walletController.purchaseCoinPack));
walletRoutes.post('/convert/diamond', asyncHandler(walletController.convertCoinsToDiamond));
walletRoutes.post('/rewards/claim', asyncHandler(walletController.claimReward));
