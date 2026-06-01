import { Schema, model, InferSchemaType } from 'mongoose';

const adminSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['super_admin'], required: true, default: 'super_admin' },
    status: { type: String, enum: ['active', 'disabled'], required: true, default: 'active' },
    sessionTokenHash: { type: String, default: null, index: true },
    sessionExpiresAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type AdminDocument = InferSchemaType<typeof adminSchema> & { _id: unknown };
export const AdminModel = model('Admin', adminSchema);
