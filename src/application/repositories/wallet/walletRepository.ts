import { Types } from 'mongoose';
import { WalletModel } from '../../../framework/database/mongodb/models/walletModel';

export const walletRepository = {
  findByUserId: (userId: string) => WalletModel.findOne({ userId: new Types.ObjectId(userId) }).lean(),

  createForUser: (userId: string) =>
    WalletModel.create({
      userId: new Types.ObjectId(userId),
      coins: 0,
      diamonds: 0,
      lifetimeCoins: 0,
    }),

  findOrCreateForUser: async (userId: string) => {
    const existing = await WalletModel.findOne({ userId: new Types.ObjectId(userId) });
    if (existing) return existing;

    return WalletModel.create({
      userId: new Types.ObjectId(userId),
      coins: 0,
      diamonds: 0,
      lifetimeCoins: 0,
    });
  },
};
