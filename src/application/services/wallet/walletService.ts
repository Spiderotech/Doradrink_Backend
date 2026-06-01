import { Types } from 'mongoose';
import { UserModel } from '../../../framework/database/mongodb/models/userModel';
import { WalletModel } from '../../../framework/database/mongodb/models/walletModel';
import { RewardLedgerModel } from '../../../framework/database/mongodb/models/rewardLedgerModel';
import { IapTransactionModel } from '../../../framework/database/mongodb/models/iapTransactionModel';
import { ApiError } from '../../../framework/webserver/response/ApiError';
import { config } from '../../../config/config';
import { walletRepository } from '../../repositories/wallet/walletRepository';
import { iapProducts, IapPlatform, IapProductId, iapVerificationService } from './iapVerificationService';

const coinPacks = {
  starter: { coins: 500, price: 'GBP 1.20' },
  value: { coins: 1500, price: 'GBP 2.99' },
  mega: { coins: 3000, price: 'GBP 4.99' },
} as const;

const diamondConversionCost = 500;

export type CoinPackId = keyof typeof coinPacks;

const requireGoogleBackedUser = async (userId: string) => {
  const userObjectId = new Types.ObjectId(userId);
  const user = await UserModel.findById(userObjectId).lean();

  if (!user) {
    throw new ApiError('NOT_FOUND', 'User was not found.', 404);
  }
  if (user.authMode !== 'firebase') {
    throw new ApiError('AUTH_REQUIRED', 'This wallet action requires a Google-backed account.', 401);
  }

  return { user, userObjectId };
};

export const walletService = {
  getWallet: async (userId: string) => walletRepository.findOrCreateForUser(userId),

  listIapPurchaseHistory: async (userId: string) => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new ApiError('VALIDATION_ERROR', 'Invalid user id.', 400);
    }

    const userObjectId = new Types.ObjectId(userId);
    return IapTransactionModel.find({ userId: userObjectId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('-rawResponse -purchaseToken')
      .lean();
  },

  purchaseCoinPack: async (input: {
    userId: string;
    packId: CoinPackId;
    idempotencyKey: string;
  }) => {
    if (config.isProduction || config.iap.environment === 'production') {
      throw new ApiError('IAP_REQUIRED', 'Coin purchases must be verified through the app store in production.', 403);
    }

    const pack = coinPacks[input.packId];
    const { user, userObjectId } = await requireGoogleBackedUser(input.userId);

    const existingReward = await RewardLedgerModel.findOne({ idempotencyKey: input.idempotencyKey }).lean();
    if (existingReward) {
      const wallet = await walletRepository.findOrCreateForUser(input.userId);
      return { wallet, reward: existingReward };
    }

    const reward = await RewardLedgerModel.create({
      userId: userObjectId,
      type: 'purchase',
      currency: 'coins',
      amount: pack.coins,
      source: 'coin_pack_purchase',
      idempotencyKey: input.idempotencyKey,
      actor: String(user._id),
      metadata: {
        packId: input.packId,
        price: pack.price,
      },
    });

    const wallet = await WalletModel.findOneAndUpdate(
      { userId: userObjectId },
      {
        $inc: {
          coins: pack.coins,
          lifetimeCoins: pack.coins,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    return { wallet, reward };
  },

  verifyIapPurchase: async (input: {
    userId: string;
    platform: IapPlatform;
    productId: IapProductId;
    transactionId?: string;
    purchaseToken?: string;
    packageName?: string;
  }) => {
    const product = iapProducts[input.productId];
    const { user, userObjectId } = await requireGoogleBackedUser(input.userId);

    const verified = await iapVerificationService.verify(input);
    const providerId = verified.transactionId || verified.purchaseToken;
    if (!providerId) {
      throw new ApiError('IAP_VERIFICATION_FAILED', 'Verified purchase did not include a transaction id.', 400);
    }

    const existingTransaction = await IapTransactionModel.findOne({
      platform: input.platform,
      $or: [
        ...(verified.transactionId ? [{ transactionId: verified.transactionId }] : []),
        ...(verified.purchaseToken ? [{ purchaseToken: verified.purchaseToken }] : []),
      ],
    }).lean();

    if (existingTransaction) {
      if (String(existingTransaction.userId) !== String(userObjectId)) {
        throw new ApiError('IAP_ALREADY_CLAIMED', 'This purchase has already been claimed by another account.', 409);
      }

      const wallet = await walletRepository.findOrCreateForUser(input.userId);
      return { wallet, transaction: existingTransaction, reward: null, alreadyClaimed: true };
    }

    const idempotencyKey = `iap:${input.platform}:${providerId}`;
    const existingReward = await RewardLedgerModel.findOne({ idempotencyKey }).lean();
    if (existingReward) {
      const wallet = await walletRepository.findOrCreateForUser(input.userId);
      return { wallet, transaction: null, reward: existingReward, alreadyClaimed: true };
    }

    const transaction = await IapTransactionModel.create({
      userId: userObjectId,
      platform: input.platform,
      productId: input.productId,
      transactionId: verified.transactionId || null,
      purchaseToken: verified.purchaseToken || null,
      orderId: verified.orderId || null,
      coins: product.coins,
      status: 'verified',
      providerEnvironment: config.iap.environment,
      rawResponse: verified.rawResponse,
      verifiedAt: new Date(),
    });

    const reward = await RewardLedgerModel.create({
      userId: userObjectId,
      type: 'purchase',
      currency: 'coins',
      amount: product.coins,
      source: 'iap_coin_purchase',
      idempotencyKey,
      actor: String(user._id),
      metadata: {
        platform: input.platform,
        productId: input.productId,
        transactionId: verified.transactionId,
        purchaseToken: verified.purchaseToken,
        orderId: verified.orderId,
        packId: product.packId,
      },
    });

    const wallet = await WalletModel.findOneAndUpdate(
      { userId: userObjectId },
      {
        $inc: {
          coins: product.coins,
          lifetimeCoins: product.coins,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    return { wallet, transaction, reward, alreadyClaimed: false };
  },

  convertCoinsToDiamond: async (input: {
    userId: string;
    idempotencyKey: string;
  }) => {
    const { user, userObjectId } = await requireGoogleBackedUser(input.userId);

    const existingReward = await RewardLedgerModel.findOne({ idempotencyKey: input.idempotencyKey }).lean();
    if (existingReward) {
      const wallet = await walletRepository.findOrCreateForUser(input.userId);
      return { wallet, reward: existingReward };
    }

    const walletBefore = await walletRepository.findOrCreateForUser(input.userId);
    if (walletBefore.coins < diamondConversionCost) {
      throw new ApiError('INSUFFICIENT_BALANCE', 'Not enough coins to convert.', 400);
    }

    const wallet = await WalletModel.findOneAndUpdate(
      { userId: userObjectId, coins: { $gte: diamondConversionCost } },
      {
        $inc: {
          coins: -diamondConversionCost,
          diamonds: 1,
        },
      },
      { new: true },
    ).lean();

    if (!wallet) {
      throw new ApiError('INSUFFICIENT_BALANCE', 'Not enough coins to convert.', 400);
    }

    const reward = await RewardLedgerModel.create({
      userId: userObjectId,
      type: 'conversion',
      currency: 'diamonds',
      amount: 1,
      source: 'coin_to_diamond_conversion',
      idempotencyKey: input.idempotencyKey,
      actor: String(user._id),
      metadata: {
        spentCoins: diamondConversionCost,
      },
    });

    await RewardLedgerModel.create({
      userId: userObjectId,
      type: 'conversion',
      currency: 'coins',
      amount: -diamondConversionCost,
      source: 'coin_to_diamond_conversion',
      idempotencyKey: `${input.idempotencyKey}:coins`,
      actor: String(user._id),
      metadata: {
        gainedDiamonds: 1,
      },
    });

    return { wallet, reward };
  },

  claimAppReward: async (input: {
    userId: string;
    coins: number;
    title: string;
    rewardType: 'slot_completion' | 'daily_bonus' | 'spin_reward' | 'ad_reward' | 'competition_reward' | 'manual_adjustment';
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }) => {
    if (input.coins <= 0) {
      throw new ApiError('VALIDATION_ERROR', 'Reward coins must be greater than zero.', 400);
    }

    const { user, userObjectId } = await requireGoogleBackedUser(input.userId);

    const existingReward = await RewardLedgerModel.findOne({ idempotencyKey: input.idempotencyKey }).lean();
    if (existingReward) {
      const wallet = await walletRepository.findOrCreateForUser(input.userId);
      return { wallet, reward: existingReward };
    }

    const reward = await RewardLedgerModel.create({
      userId: userObjectId,
      type: input.rewardType,
      currency: 'coins',
      amount: input.coins,
      source: 'mobile_reward_claim',
      idempotencyKey: input.idempotencyKey,
      actor: String(user._id),
      metadata: {
        title: input.title,
        ...(input.metadata || {}),
      },
    });

    const wallet = await WalletModel.findOneAndUpdate(
      { userId: userObjectId },
      {
        $inc: {
          coins: input.coins,
          lifetimeCoins: input.coins,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    return { wallet, reward };
  },
};
