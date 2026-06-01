import { Schema, model, InferSchemaType } from 'mongoose';

const walletSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    coins: { type: Number, required: true, default: 0 },
    diamonds: { type: Number, required: true, default: 0 },
    lifetimeCoins: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

export type WalletDocument = InferSchemaType<typeof walletSchema> & { _id: unknown };
export const WalletModel = model('Wallet', walletSchema);
