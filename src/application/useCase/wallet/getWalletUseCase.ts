import { userRepository } from '../../repositories/user/userRepository';
import { walletService } from '../../services/wallet/walletService';
import { ApiError } from '../../../framework/webserver/response/ApiError';

export const getWalletUseCase = async (userId: string) => {
  const user = await userRepository.findById(userId);

  if (!user) {
    throw new ApiError('NOT_FOUND', 'User was not found.', 404);
  }

  return walletService.getWallet(userId);
};
