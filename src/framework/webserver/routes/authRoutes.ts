import { Router } from 'express';
import { authController } from '../../../adapters/controllers/auth/authController';
import { asyncHandler } from '../response/asyncHandler';

export const authRoutes = Router();

authRoutes.post('/firebase/bootstrap', asyncHandler(authController.firebaseBootstrap));
authRoutes.post('/google/bootstrap', asyncHandler(authController.googleBootstrap));
