import { userRepository } from '../../repositories/user/userRepository';
import { ApiError } from '../../../framework/webserver/response/ApiError';
import { Types } from 'mongoose';
import { CompetitionDailyProgressModel } from '../../../framework/database/mongodb/models/competitionDailyProgressModel';
import { CompetitionEntryModel } from '../../../framework/database/mongodb/models/competitionEntryModel';
import { DeviceTokenModel } from '../../../framework/database/mongodb/models/deviceTokenModel';
import { NotificationModel } from '../../../framework/database/mongodb/models/notificationModel';
import { RewardLedgerModel } from '../../../framework/database/mongodb/models/rewardLedgerModel';
import { UserModel } from '../../../framework/database/mongodb/models/userModel';
import { VoucherModel } from '../../../framework/database/mongodb/models/voucherModel';
import { WalletModel } from '../../../framework/database/mongodb/models/walletModel';

export const userService = {
  getBootstrapUser: async (input: {
    guestId?: string;
    firebaseUid?: string;
    username?: string;
    profilePictureUrl?: string;
    avatar?: string;
    country?: string;
    city?: string;
    gender?: string;
    age?: number;
    height?: number;
    weight?: number;
    activityLevel?: string;
    climate?: string;
    hydrationGoal?: number;
    goalType?: string;
  }) => {
    const profileUpdates = {
      username: input.username,
      profilePictureUrl: input.profilePictureUrl,
      avatar: input.avatar,
      country: input.country,
      city: input.city,
      gender: input.gender,
      age: input.age,
      height: input.height,
      weight: input.weight,
      activityLevel: input.activityLevel,
      climate: input.climate,
      hydrationGoal: input.hydrationGoal,
      goalType: input.goalType,
    };
    const compactUpdates = Object.fromEntries(
      Object.entries(profileUpdates).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    );

    if (input.firebaseUid) {
      const existing = await userRepository.findByFirebaseUid(input.firebaseUid);
      if (existing) {
        const updated = await userRepository.updateProfile(String(existing._id), compactUpdates);
        if (!updated) throw new ApiError('NOT_FOUND', 'User was not found during profile update.', 404);
        return updated;
      }
    }

    if (input.guestId) {
      const existing = await userRepository.findByGuestId(input.guestId);
      if (existing) {
        const updated = await userRepository.updateProfile(String(existing._id), compactUpdates);
        if (!updated) throw new ApiError('NOT_FOUND', 'User was not found during profile update.', 404);
        return updated;
      }
    }

    return userRepository.create({
      guestId: input.guestId,
      firebaseUid: input.firebaseUid,
      authMode: input.firebaseUid ? 'firebase' : 'guest',
      username: input.username || 'Dora User',
      profilePictureUrl: input.profilePictureUrl,
      avatar: input.avatar,
      country: input.country,
      city: input.city,
      gender: input.gender,
      age: input.age,
      height: input.height,
      weight: input.weight,
      activityLevel: input.activityLevel,
      climate: input.climate,
      hydrationGoal: input.hydrationGoal || 2000,
      goalType: input.goalType || 'medium',
    });
  },

  deleteAccount: async (userId: string) => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new ApiError('VALIDATION_ERROR', 'Valid user id is required.', 400);
    }

    const userObjectId = new Types.ObjectId(userId);
    const user = await UserModel.findById(userObjectId).lean();
    if (!user) {
      throw new ApiError('NOT_FOUND', 'User was not found.', 404);
    }

    await Promise.all([
      WalletModel.deleteOne({ userId: userObjectId }),
      RewardLedgerModel.deleteMany({ userId: userObjectId }),
      CompetitionEntryModel.deleteMany({ userId: userObjectId }),
      CompetitionDailyProgressModel.deleteMany({ userId: userObjectId }),
      NotificationModel.deleteMany({ target: 'user', userId: userObjectId }),
      DeviceTokenModel.updateMany(
        { userId: userObjectId },
        { $set: { userId: null, enabled: false, lastSeenAt: new Date() } },
      ),
      VoucherModel.updateMany(
        { assignedUserId: userObjectId },
        { $set: { assignedUserId: null, status: 'expired' } },
      ),
    ]);

    await UserModel.deleteOne({ _id: userObjectId });

    return {
      deleted: true,
      retained: ['Verified purchase records may be retained for legal, tax, fraud prevention, and app-store reconciliation.'],
    };
  },
};
