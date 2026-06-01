import { Schema, model, InferSchemaType } from 'mongoose';

const rewardLedgerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: [
        'slot_completion',
        'daily_bonus',
        'spin_reward',
        'ad_reward',
        'competition_reward',
        'manual_adjustment',
        'purchase',
        'conversion',
        'competition_join_fee',
      ],
      required: true,
      index: true,
    },
    currency: { type: String, enum: ['coins', 'diamonds'], required: true },
    amount: { type: Number, required: true },
    source: { type: String, required: true },
    idempotencyKey: { type: String, required: true, unique: true },
    actor: { type: String, required: true, default: 'system' },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

rewardLedgerSchema.index({ userId: 1, createdAt: -1 });

export type RewardLedgerDocument = InferSchemaType<typeof rewardLedgerSchema> & { _id: unknown };
export const RewardLedgerModel = model('RewardLedger', rewardLedgerSchema);
