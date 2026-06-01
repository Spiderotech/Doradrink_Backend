import { Router } from 'express';
import { notificationController } from '../../../adapters/controllers/notification/notificationController';
import { asyncHandler } from '../response/asyncHandler';

export const notificationRoutes = Router();

notificationRoutes.get('/public', asyncHandler(notificationController.publicFeed));
notificationRoutes.post('/device-token', asyncHandler(notificationController.registerDeviceToken));
