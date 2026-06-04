import { Request, Response } from 'express';
import { z } from 'zod';
import { bootstrapUserUseCase } from '../../../application/useCase/user/bootstrapUserUseCase';
import { getCurrentUserUseCase } from '../../../application/useCase/user/getCurrentUserUseCase';
import { userService } from '../../../application/services/user/userService';
import { AuthenticatedRequest } from '../../../framework/webserver/middlewares/authMiddleware';
import { sendSuccess } from '../../../framework/webserver/response/response';
import { ApiError } from '../../../framework/webserver/response/ApiError';

const bootstrapSchema = z.object({
  guestId: z.string().min(1).optional(),
  firebaseUid: z.string().min(1).optional(),
  username: z.string().min(1).max(40).optional(),
  country: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  hydrationGoal: z.number().int().min(500).max(5000).optional(),
  goalType: z.string().max(30).optional(),
});

export const userController = {
  bootstrap: async (req: Request, res: Response) => {
    const input = bootstrapSchema.parse(req.body);

    if (!input.guestId && !input.firebaseUid) {
      throw new ApiError('VALIDATION_ERROR', 'guestId or firebaseUid is required.', 400);
    }

    const data = await bootstrapUserUseCase(input);
    sendSuccess(res, data, 201);
  },

  me: async (req: Request, res: Response) => {
    const auth = (req as AuthenticatedRequest).auth;

    if (!auth?.firebaseUid) {
      throw new ApiError('UNAUTHORIZED', 'Firebase auth is required.', 401);
    }

    const data = await getCurrentUserUseCase(auth.firebaseUid);
    sendSuccess(res, data);
  },

  deleteAccount: async (req: Request, res: Response) => {
    const params = z.object({
      userId: z.string().min(1),
    }).parse(req.params);

    const data = await userService.deleteAccount(params.userId);
    sendSuccess(res, data);
  },
};
