import { Schema, model, InferSchemaType } from 'mongoose';

const notificationSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['competition', 'reward', 'motivation', 'streak', 'system'],
      required: true,
      default: 'system',
    },
    target: {
      type: String,
      enum: ['all', 'user', 'country', 'city', 'inactive', 'streak_at_risk'],
      required: true,
      default: 'all',
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'sent', 'cancelled'],
      required: true,
      default: 'sent',
      index: true,
    },
    route: { type: String, default: null },
    publishAt: { type: Date, required: true, default: Date.now, index: true },
    expiresAt: { type: Date, default: null, index: true },
    createdBy: { type: String, required: true },
    pushAttemptedCount: { type: Number, required: true, default: 0 },
    pushSuccessCount: { type: Number, required: true, default: 0 },
    pushFailureCount: { type: Number, required: true, default: 0 },
    pushedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type NotificationDocument = InferSchemaType<typeof notificationSchema> & { _id: unknown };
export const NotificationModel = model('Notification', notificationSchema);
