import { Schema, model, InferSchemaType } from 'mongoose';

const iapTransactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    platform: { type: String, enum: ['ios', 'android'], required: true, index: true },
    productId: { type: String, required: true, index: true },
    transactionId: { type: String, default: null, index: true },
    purchaseToken: { type: String, default: null, index: true },
    orderId: { type: String, default: null },
    coins: { type: Number, required: true },
    status: { type: String, enum: ['verified', 'failed'], required: true, default: 'verified', index: true },
    providerEnvironment: { type: String, enum: ['sandbox', 'production'], required: true },
    rawResponse: { type: Schema.Types.Mixed, default: {} },
    verifiedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

iapTransactionSchema.index({ transactionId: 1 }, { unique: true, sparse: true });
iapTransactionSchema.index({ purchaseToken: 1 }, { unique: true, sparse: true });
iapTransactionSchema.index({ userId: 1, createdAt: -1 });

export type IapTransactionDocument = InferSchemaType<typeof iapTransactionSchema> & { _id: unknown };
export const IapTransactionModel = model('IapTransaction', iapTransactionSchema);
