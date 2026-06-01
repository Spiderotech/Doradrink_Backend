import { Schema, model, InferSchemaType } from 'mongoose';

const voucherSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, unique: true },
    title: { type: String, required: true, trim: true, default: 'Rank #1 Gift Voucher' },
    provider: { type: String, required: true, trim: true, default: 'Gift Voucher' },
    category: { type: String, required: true, trim: true, default: 'competition' },
    valueLabel: { type: String, default: null },
    redemptionUrl: { type: String, default: null, trim: true },
    platformLogoUrl: { type: String, default: null, trim: true },
    terms: { type: String, default: '' },
    competitionId: { type: Schema.Types.ObjectId, ref: 'Competition', default: null, index: true },
    assignedUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    assignedEntryId: { type: Schema.Types.ObjectId, ref: 'CompetitionEntry', default: null },
    status: {
      type: String,
      enum: ['available', 'reserved', 'assigned', 'downloaded', 'used', 'expired'],
      required: true,
      default: 'available',
      index: true,
    },
    expiresAt: { type: Date, default: null },
    assignedAt: { type: Date, default: null },
    downloadedAt: { type: Date, default: null },
    usedAt: { type: Date, default: null },
    createdBy: { type: String, required: true, default: 'system' },
  },
  { timestamps: true },
);

voucherSchema.index({ assignedUserId: 1, status: 1, createdAt: -1 });

export type VoucherDocument = InferSchemaType<typeof voucherSchema> & { _id: unknown };
export const VoucherModel = model('Voucher', voucherSchema);
