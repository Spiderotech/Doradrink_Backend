import { Router } from 'express';
import { userController } from '../../../adapters/controllers/user/userController';
import { requireFirebaseAuth } from '../middlewares/authMiddleware';
import { asyncHandler } from '../response/asyncHandler';

export const userRoutes = Router();

userRoutes.post('/bootstrap', asyncHandler(userController.bootstrap));
userRoutes.get('/me', requireFirebaseAuth, asyncHandler(userController.me));
