import { userService } from '../../services/user/userService';
import { walletService } from '../../services/wallet/walletService';

export type BootstrapUserInput = {
  guestId?: string;
  firebaseUid?: string;
  username?: string;
  country?: string;
  city?: string;
  hydrationGoal?: number;
  goalType?: string;
};

export const bootstrapUserUseCase = async (input: BootstrapUserInput) => {
  const user = await userService.getBootstrapUser(input);
  const wallet = await walletService.getWallet(String(user._id));

  return {
    user,
    wallet,
  };
};
