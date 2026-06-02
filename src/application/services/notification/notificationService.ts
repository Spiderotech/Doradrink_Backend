import { Types } from 'mongoose';
import { DeviceTokenModel } from '../../../framework/database/mongodb/models/deviceTokenModel';
import { NotificationModel } from '../../../framework/database/mongodb/models/notificationModel';
import { getFirebaseAdmin } from '../../../framework/services/firebase/firebaseAdmin';

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

export const notificationService = {
  listPublic: async (input: { userId?: string } = {}) => {
    const now = new Date();
    const userObjectId = input.userId && Types.ObjectId.isValid(input.userId)
      ? new Types.ObjectId(input.userId)
      : null;

    return NotificationModel.find({
      status: { $in: ['scheduled', 'sent'] },
      publishAt: { $lte: now },
      $or: [
        { target: 'all' },
        ...(userObjectId ? [{ target: 'user', userId: userObjectId }] : []),
      ],
      $and: [{
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: now } },
        ],
      }],
    })
      .sort({ publishAt: -1, createdAt: -1 })
      .limit(50)
      .lean();
  },

  createAndPushToUser: async (input: {
    userId: string;
    title: string;
    body: string;
    route?: string | null;
    createdBy: string;
  }) => {
    const userObjectId = Types.ObjectId.isValid(input.userId) ? new Types.ObjectId(input.userId) : null;
    if (!userObjectId) return null;

    const notification = await NotificationModel.create({
      title: input.title,
      body: input.body,
      type: 'reward',
      target: 'user',
      userId: userObjectId,
      route: input.route || 'Rewards',
      publishAt: new Date(),
      status: 'sent',
      createdBy: input.createdBy,
    });

    const pushResult = await notificationService.sendNotificationPushToUser(notification, input.userId);
    await NotificationModel.findByIdAndUpdate(notification._id, {
      pushAttemptedCount: pushResult.attempted,
      pushSuccessCount: pushResult.successCount,
      pushFailureCount: pushResult.failureCount,
      pushedAt: new Date(),
    });

    return NotificationModel.findById(notification._id).lean();
  },

  listPublicLegacy: async () => {
    const now = new Date();
    return NotificationModel.find({
      target: 'all',
      status: { $in: ['scheduled', 'sent'] },
      publishAt: { $lte: now },
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: now } },
      ],
    })
      .sort({ publishAt: -1, createdAt: -1 })
      .limit(50)
      .lean();
  },

  registerDeviceToken: async (input: {
    token: string;
    platform: 'ios' | 'android' | 'unknown';
    guestInstallId?: string;
    userId?: string;
  }) => {
    const userObjectId = input.userId && Types.ObjectId.isValid(input.userId)
      ? new Types.ObjectId(input.userId)
      : null;

    const update: {
      $set: {
        token: string;
        platform: 'ios' | 'android' | 'unknown';
        guestInstallId: string | null;
        enabled: boolean;
        lastSeenAt: Date;
        userId?: Types.ObjectId;
      };
      $setOnInsert: {
        userId: Types.ObjectId | null;
      };
    } = {
      $set: {
        token: input.token,
        platform: input.platform,
        guestInstallId: input.guestInstallId || null,
        enabled: true,
        lastSeenAt: new Date(),
      },
      $setOnInsert: {
        userId: userObjectId,
      },
    };

    if (userObjectId) {
      update.$set.userId = userObjectId;
    }

    return DeviceTokenModel.findOneAndUpdate(
      { token: input.token },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
  },

  listDeviceTokens: async () =>
    DeviceTokenModel.find()
      .sort({ lastSeenAt: -1 })
      .limit(200)
      .lean(),

  getDeviceTokenStats: async () => {
    const [total, enabled, android, ios] = await Promise.all([
      DeviceTokenModel.countDocuments(),
      DeviceTokenModel.countDocuments({ enabled: true }),
      DeviceTokenModel.countDocuments({ enabled: true, platform: 'android' }),
      DeviceTokenModel.countDocuments({ enabled: true, platform: 'ios' }),
    ]);

    return { total, enabled, android, ios };
  },

  sendNotificationPush: async (notification: {
    _id: unknown;
    title: string;
    body: string;
    route?: string | null;
  }) => {
    const deviceTokens = await DeviceTokenModel.find({ enabled: true }).select('token').lean();
    const tokens = deviceTokens.map(item => item.token).filter(Boolean);
    if (!tokens.length) return { attempted: 0, successCount: 0, failureCount: 0 };

    try {
      const firebaseAdmin = getFirebaseAdmin();
      const results = await Promise.all(chunk(tokens, 500).map(tokensChunk =>
        firebaseAdmin.messaging().sendEachForMulticast({
          tokens: tokensChunk,
          notification: {
            title: notification.title,
            body: notification.body,
          },
          data: {
            notificationId: String(notification._id),
            title: notification.title,
            body: notification.body,
            route: notification.route || '',
          },
          android: {
            notification: {
              channelId: 'global-updates-channel',
              sound: 'notification',
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'notification.wav',
              },
            },
          },
        }),
      ));

      return results.reduce(
        (total, result) => ({
          attempted: total.attempted + result.responses.length,
          successCount: total.successCount + result.successCount,
          failureCount: total.failureCount + result.failureCount,
        }),
        { attempted: 0, successCount: 0, failureCount: 0 },
      );
    } catch {
      return { attempted: tokens.length, successCount: 0, failureCount: tokens.length };
    }
  },

  sendNotificationPushToUser: async (
    notification: {
      _id: unknown;
      title: string;
      body: string;
      route?: string | null;
    },
    userId: string,
  ) => {
    const userObjectId = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
    if (!userObjectId) return { attempted: 0, successCount: 0, failureCount: 0 };

    const deviceTokens = await DeviceTokenModel.find({ enabled: true, userId: userObjectId }).select('token').lean();
    const tokens = deviceTokens.map(item => item.token).filter(Boolean);
    if (!tokens.length) return { attempted: 0, successCount: 0, failureCount: 0 };

    try {
      const firebaseAdmin = getFirebaseAdmin();
      const results = await Promise.all(chunk(tokens, 500).map(tokensChunk =>
        firebaseAdmin.messaging().sendEachForMulticast({
          tokens: tokensChunk,
          notification: {
            title: notification.title,
            body: notification.body,
          },
          data: {
            notificationId: String(notification._id),
            title: notification.title,
            body: notification.body,
            route: notification.route || 'Rewards',
          },
          android: {
            notification: {
              channelId: 'global-updates-channel',
              sound: 'notification',
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'notification.wav',
              },
            },
          },
        }),
      ));

      return results.reduce(
        (total, result) => ({
          attempted: total.attempted + result.responses.length,
          successCount: total.successCount + result.successCount,
          failureCount: total.failureCount + result.failureCount,
        }),
        { attempted: 0, successCount: 0, failureCount: 0 },
      );
    } catch {
      return { attempted: tokens.length, successCount: 0, failureCount: tokens.length };
    }
  },
};
