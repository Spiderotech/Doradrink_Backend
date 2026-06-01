import { userRepository } from '../../repositories/user/userRepository';
import { walletService } from '../../services/wallet/walletService';
import { ApiError } from '../../../framework/webserver/response/ApiError';

export const getAuthenticatedWalletUseCase = async (firebaseUid: string) => {
  const user = await userRepository.findByFirebaseUid(firebaseUid);

  if (!user) {
    throw new ApiError('NOT_FOUND', 'User was not found. Bootstrap Google login first.', 404);
  }

  return walletService.getWallet(String(user._id));
};
