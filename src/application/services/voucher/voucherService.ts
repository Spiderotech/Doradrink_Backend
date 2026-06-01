import { Types } from 'mongoose';
import { VoucherModel } from '../../../framework/database/mongodb/models/voucherModel';
import { ApiError } from '../../../framework/webserver/response/ApiError';

const publicVoucherFields = 'code title provider category valueLabel redemptionUrl platformLogoUrl terms competitionId status expiresAt assignedAt downloadedAt createdAt';

export const voucherService = {
  listMine: async (userId: string) => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new ApiError('VALIDATION_ERROR', 'Valid userId is required.', 400);
    }

    const now = new Date();
    return VoucherModel.find({
      assignedUserId: new Types.ObjectId(userId),
      status: { $in: ['assigned', 'downloaded'] },
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: now } },
      ],
    })
      .select(publicVoucherFields)
      .sort({ assignedAt: -1, createdAt: -1 })
      .limit(20)
      .lean();
  },

  markDownloaded: async (input: { userId: string; voucherId: string }) => {
    if (!Types.ObjectId.isValid(input.userId) || !Types.ObjectId.isValid(input.voucherId)) {
      throw new ApiError('VALIDATION_ERROR', 'Valid userId and voucherId are required.', 400);
    }

    const voucher = await VoucherModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(input.voucherId),
        assignedUserId: new Types.ObjectId(input.userId),
        status: { $in: ['assigned', 'downloaded'] },
      },
      {
        status: 'downloaded',
        downloadedAt: new Date(),
      },
      { new: true },
    )
      .select(publicVoucherFields)
      .lean();

    if (!voucher) {
      throw new ApiError('NOT_FOUND', 'Voucher was not found for this user.', 404);
    }

    return voucher;
  },
};
