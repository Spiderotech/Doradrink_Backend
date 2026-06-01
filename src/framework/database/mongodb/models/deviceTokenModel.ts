import { Schema, model, InferSchemaType } from 'mongoose';

const deviceTokenSchema = new Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    platform: { type: String, enum: ['ios', 'android', 'unknown'], required: true, default: 'unknown' },
    guestInstallId: { type: String, default: null, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    enabled: { type: Boolean, required: true, default: true, index: true },
    lastSeenAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

export type DeviceTokenDocument = InferSchemaType<typeof deviceTokenSchema> & { _id: unknown };
export const DeviceTokenModel = model('DeviceToken', deviceTokenSchema);
