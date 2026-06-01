import { Schema, model, InferSchemaType } from 'mongoose';

const competitionRewardSchema = new Schema(
  {
    rankFrom: { type: Number, required: true },
    rankTo: { type: Number, required: true },
    rewardType: {
      type: String,
      enum: ['voucher_badge', 'diamonds_coins', 'coins', 'diamonds', 'participation'],
      required: true,
    },
    value: { type: String, default: null },
    coins: { type: Number, default: 0 },
    diamonds: { type: Number, default: 0 },
  },
  { _id: false },
);

const competitionSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, index: true },
    description: { type: String, default: '' },
    type: { type: String, enum: ['global', 'country', 'city'], required: true, default: 'global' },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'active', 'closed', 'cancelled'],
      required: true,
      default: 'draft',
      index: true,
    },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
    entryFeeDiamonds: { type: Number, required: true, default: 1 },
    rewards: { type: [competitionRewardSchema], default: [] },
    selectedVoucherId: { type: Schema.Types.ObjectId, ref: 'Voucher', default: null },
    createdBy: { type: String, required: true },
    rewardStatus: { type: String, enum: ['draft', 'pending', 'distributed'], required: true, default: 'draft' },
    leaderboardGeneratedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type CompetitionDocument = InferSchemaType<typeof competitionSchema> & { _id: unknown };
export const CompetitionModel = model('Competition', competitionSchema);
