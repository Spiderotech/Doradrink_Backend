import { Request, Response } from 'express';
import { z } from 'zod';
import { notificationService } from '../../../application/services/notification/notificationService';
import { sendSuccess } from '../../../framework/webserver/response/response';

const deviceTokenSchema = z.object({
  token: z.string().min(20).max(4096),
  platform: z.enum(['ios', 'android', 'unknown']).default('unknown'),
  guestInstallId: z.string().min(1).max(160).optional(),
  userId: z.string().min(1).optional(),
});

const publicFeedQuerySchema = z.object({
  userId: z.string().min(1).optional(),
});

export const notificationController = {
  publicFeed: async (req: Request, res: Response) => {
    const input = publicFeedQuerySchema.parse(req.query);
    sendSuccess(res, { notifications: await notificationService.listPublic(input) });
  },

  registerDeviceToken: async (req: Request, res: Response) => {
    const input = deviceTokenSchema.parse(req.body);
    const deviceToken = await notificationService.registerDeviceToken(input);
    sendSuccess(res, { deviceToken }, 201);
  },
};
