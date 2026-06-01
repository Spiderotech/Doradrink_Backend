import { Schema, model, InferSchemaType } from 'mongoose';

const competitionDailyProgressSchema = new Schema(
  {
    competitionId: { type: Schema.Types.ObjectId, ref: 'Competition', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dateKey: { type: String, required: true, index: true },
    waterMl: { type: Number, required: true, default: 0 },
    completedSlotCount: { type: Number, required: true, default: 0 },
    streakDay: { type: Boolean, required: true, default: false },
    lastCompletionAt: { type: Date, default: null },
    score: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

competitionDailyProgressSchema.index({ competitionId: 1, userId: 1, dateKey: 1 }, { unique: true });
competitionDailyProgressSchema.index({ competitionId: 1, userId: 1 });

export type CompetitionDailyProgressDocument = InferSchemaType<typeof competitionDailyProgressSchema> & { _id: unknown };
export const CompetitionDailyProgressModel = model('CompetitionDailyProgress', competitionDailyProgressSchema);
