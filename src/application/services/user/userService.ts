import { userRepository } from '../../repositories/user/userRepository';
import { ApiError } from '../../../framework/webserver/response/ApiError';

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
};
