import { userService } from '../../services/user/userService';
import { walletService } from '../../services/wallet/walletService';

export type GoogleBootstrapInput = {
  firebaseUid: string;
  email?: string;
  name?: string;
  picture?: string;
  username?: string;
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
};

export const googleBootstrapUseCase = async (input: GoogleBootstrapInput) => {
  const user = await userService.getBootstrapUser({
    firebaseUid: input.firebaseUid,
    email: input.email,
    username: input.username || input.name || input.email?.split('@')[0] || 'Dora User',
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
    profilePictureUrl: input.picture,
    avatar: input.avatar,
  });
  const wallet = await walletService.getWallet(String(user._id));

  return {
    user,
    wallet,
  };
};
