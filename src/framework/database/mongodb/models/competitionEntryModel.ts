import { Schema, model, InferSchemaType } from 'mongoose';

const competitionEntrySchema = new Schema(
  {
    competitionId: { type: Schema.Types.ObjectId, ref: 'Competition', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tapScore: { type: Number, required: true, default: 0 },
    completedSlotCount: { type: Number, required: true, default: 0 },
    challengeWaterMl: { type: Number, required: true, default: 0 },
    challengeStreakDays: { type: Number, required: true, default: 0 },
    lastCompletionAt: { type: Date, default: null },
    energyLevelAtJoin: { type: Number, default: null },
    rank: { type: Number, default: null, index: true },
    rewardClaimed: { type: Boolean, required: true, default: false },
    joinedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

competitionEntrySchema.index({ competitionId: 1, userId: 1 }, { unique: true });
competitionEntrySchema.index({ competitionId: 1, tapScore: -1 });

export type CompetitionEntryDocument = InferSchemaType<typeof competitionEntrySchema> & { _id: unknown };
export const CompetitionEntryModel = model('CompetitionEntry', competitionEntrySchema);
