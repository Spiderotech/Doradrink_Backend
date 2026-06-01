import { Schema, model, InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    firebaseUid: { type: String, default: null },
    guestId: { type: String, default: null },
    authMode: { type: String, enum: ['guest', 'firebase'], required: true, default: 'guest' },
    username: { type: String, required: true, trim: true, index: true },
    profilePictureUrl: { type: String, default: null },
    avatar: { type: String, default: null },
    country: { type: String, default: null, index: true },
    city: { type: String, default: null, index: true },
    gender: { type: String, default: null },
    age: { type: Number, default: null },
    height: { type: Number, default: null },
    weight: { type: Number, default: null },
    activityLevel: { type: String, default: null },
    climate: { type: String, default: null },
    hydrationGoal: { type: Number, required: true, default: 2000 },
    goalType: { type: String, required: true, default: 'medium' },
    currentStreakDays: { type: Number, required: true, default: 0 },
    bestStreakDays: { type: Number, required: true, default: 0 },
    lifetimeWaterMl: { type: Number, required: true, default: 0 },
    lifetimeTaps: { type: Number, required: true, default: 0 },
    status: { type: String, enum: ['active', 'disabled'], required: true, default: 'active' },
  },
  { timestamps: true },
);

userSchema.index({ guestId: 1 }, { unique: true, sparse: true });
userSchema.index({ firebaseUid: 1 }, { unique: true, sparse: true });

export type UserDocument = InferSchemaType<typeof userSchema> & { _id: unknown };
export const UserModel = model('User', userSchema);
