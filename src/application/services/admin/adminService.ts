import { Types } from 'mongoose';
import { UserModel } from '../../../framework/database/mongodb/models/userModel';
import { WalletModel } from '../../../framework/database/mongodb/models/walletModel';
import { CompetitionModel } from '../../../framework/database/mongodb/models/competitionModel';
import { CompetitionEntryModel } from '../../../framework/database/mongodb/models/competitionEntryModel';
import { RewardLedgerModel } from '../../../framework/database/mongodb/models/rewardLedgerModel';
import { AuditLogModel } from '../../../framework/database/mongodb/models/auditLogModel';
import { NotificationModel } from '../../../framework/database/mongodb/models/notificationModel';
import { VoucherModel } from '../../../framework/database/mongodb/models/voucherModel';
import { IapTransactionModel } from '../../../framework/database/mongodb/models/iapTransactionModel';
import { CompetitionDailyProgressModel } from '../../../framework/database/mongodb/models/competitionDailyProgressModel';
import { DeviceTokenModel } from '../../../framework/database/mongodb/models/deviceTokenModel';
import { ApiError } from '../../../framework/webserver/response/ApiError';
import { auditService } from '../audit/auditService';
import { notificationService } from '../notification/notificationService';

type CompetitionRewardInput = {
  rankFrom: number;
  rankTo: number;
  rewardType: 'voucher_badge' | 'diamonds_coins' | 'coins' | 'diamonds' | 'participation';
  value?: string;
  coins?: number;
  diamonds?: number;
};

type VoucherCreateInput = {
  code: string;
  title?: string;
  provider?: string;
  category?: string;
  valueLabel?: string | null;
  redemptionUrl?: string | null;
  platformLogoUrl?: string | null;
  terms?: string;
  expiresAt?: Date | null;
};

const findRewardForRank = (rewards: CompetitionRewardInput[], rank: number) =>
  rewards.find(reward => rank >= reward.rankFrom && rank <= reward.rankTo);

const coinsPerDiamond = 500;

const getParticipationBonusCoins = (entryId: unknown) => {
  const seed = String(entryId).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return 20 + (seed % 31);
};

const resolveCompetitionReward = (reward: CompetitionRewardInput, rank: number, entryId: unknown, entryFeeDiamonds: number) => {
  if (reward.rewardType !== 'participation') {
    return {
      ...reward,
      coins: reward.coins || 0,
      diamonds: reward.diamonds || 0,
      bonusCoins: 0,
      creditBackCoins: 0,
    };
  }

  const creditBackCoins = Math.floor(entryFeeDiamonds * coinsPerDiamond * 0.75);
  const bonusCoins = getParticipationBonusCoins(entryId);

  return {
    ...reward,
    coins: creditBackCoins + bonusCoins,
    diamonds: reward.diamonds || 0,
    bonusCoins,
    creditBackCoins,
    value: reward.value || '75% credit back + 20-50 bonus coins',
  };
};

const formatRewardParts = (reward: CompetitionRewardInput, voucherAssigned: boolean) => {
  const parts: string[] = [];
  if ((reward.coins || 0) > 0) parts.push(`${reward.coins} coin${reward.coins === 1 ? '' : 's'}`);
  if ((reward.diamonds || 0) > 0) parts.push(`${reward.diamonds} diamond${reward.diamonds === 1 ? '' : 's'}`);
  if (voucherAssigned) parts.push('a gift voucher');
  return parts.length ? parts.join(' and ') : 'your challenge reward';
};

const dayMs = 24 * 60 * 60 * 1000;

const startOfUtcDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const dateKeyFromDate = (date: Date) => date.toISOString().slice(0, 10);

const buildRecentDayKeys = (days: number) => {
  const today = startOfUtcDay(new Date());
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today.getTime() - (days - index - 1) * dayMs);
    return dateKeyFromDate(date);
  });
};

const formatShortDay = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

const sumByKey = <T extends Record<string, unknown>>(rows: T[], key: string, valueKey: string) =>
  rows.reduce((acc, row) => {
    acc.set(String(row[key]), Number(row[valueKey]) || 0);
    return acc;
  }, new Map<string, number>());

const percent = (value: number, total: number) => {
  if (!total) return 0;
  return Math.round((value / total) * 1000) / 10;
};

const createAndMaybeSendNotification = async (input: {
  adminId: string;
  title: string;
  body: string;
  type: 'competition' | 'reward' | 'motivation' | 'streak' | 'system';
  target: 'all' | 'country' | 'city' | 'inactive' | 'streak_at_risk';
  route?: string | null;
  publishAt?: Date;
  expiresAt?: Date | null;
}) => {
  const publishAt = input.publishAt || new Date();
  const notification = await NotificationModel.create({
    title: input.title,
    body: input.body,
    type: input.type,
    target: input.target,
    route: input.route || null,
    publishAt,
    expiresAt: input.expiresAt || null,
    status: publishAt > new Date() ? 'scheduled' : 'sent',
    createdBy: input.adminId,
  });

  await auditService.create({
    adminId: input.adminId,
    action: 'notification_create',
    targetType: 'notification',
    targetId: String(notification._id),
    after: notification.toObject(),
    reason: `Notification created for ${input.target}`,
  });

  if (notification.status === 'sent' && notification.target === 'all') {
    const pushResult = await notificationService.sendNotificationPush(notification);
    await NotificationModel.findByIdAndUpdate(notification._id, {
      pushAttemptedCount: pushResult.attempted,
      pushSuccessCount: pushResult.successCount,
      pushFailureCount: pushResult.failureCount,
      pushedAt: new Date(),
    });
  }

  return NotificationModel.findById(notification._id).lean();
};

export const adminService = {
  getDashboard: async () => {
    const chartDayKeys = buildRecentDayKeys(12);
    const chartStartDate = new Date(`${chartDayKeys[0]}T00:00:00.000Z`);
    const todayStart = startOfUtcDay(new Date());
    const yesterdayStart = new Date(todayStart.getTime() - dayMs);
    const twoDaysFromNow = new Date(Date.now() + 2 * dayMs);
    const thirtyDaysAgo = new Date(todayStart.getTime() - 29 * dayMs);

    const [
      users,
      activeCompetitions,
      rewardEntries,
      competitionJoins,
      activeUsersByDay,
      availableVouchers,
      endingCompetitions,
      pendingRewardCompetitions,
      failedPushCount,
      todayCoinAgg,
      yesterdayCoinAgg,
    ] = await Promise.all([
      UserModel.countDocuments(),
      CompetitionModel.countDocuments({ status: 'active' }),
      RewardLedgerModel.countDocuments(),
      CompetitionEntryModel.countDocuments(),
      UserModel.aggregate([
        { $match: { updatedAt: { $gte: chartStartDate } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt', timezone: 'UTC' } },
            total: { $sum: 1 },
          },
        },
      ]),
      VoucherModel.countDocuments({ status: 'available' }),
      CompetitionModel.find({
        status: 'active',
        endDate: { $gte: new Date(), $lte: twoDaysFromNow },
      }).sort({ endDate: 1 }).limit(3).lean(),
      CompetitionModel.countDocuments({ status: 'closed', rewardStatus: 'pending' }),
      NotificationModel.countDocuments({
        createdAt: { $gte: thirtyDaysAgo },
        pushFailureCount: { $gt: 0 },
      }),
      RewardLedgerModel.aggregate([
        { $match: { currency: 'coins', amount: { $gt: 0 }, createdAt: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      RewardLedgerModel.aggregate([
        { $match: { currency: 'coins', amount: { $gt: 0 }, createdAt: { $gte: yesterdayStart, $lt: todayStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const coinAgg = await RewardLedgerModel.aggregate([
      { $match: { currency: 'coins', amount: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const activeUsersByDayMap = sumByKey(activeUsersByDay, '_id', 'total');
    const dauTrend = chartDayKeys.map(dateKey => ({
      dateKey,
      label: formatShortDay(dateKey),
      value: activeUsersByDayMap.get(dateKey) || 0,
    }));
    const alerts: Array<{ title: string; body: string; kind: 'warn' | 'info' | 'good' }> = [];
    const todayCoins = todayCoinAgg[0]?.total || 0;
    const yesterdayCoins = yesterdayCoinAgg[0]?.total || 0;

    if (availableVouchers <= 10) {
      alerts.push({
        title: 'Voucher inventory low',
        body: `${availableVouchers} available voucher${availableVouchers === 1 ? '' : 's'} remain.`,
        kind: 'warn',
      });
    }

    endingCompetitions.forEach(competition => {
      alerts.push({
        title: 'Competition ending soon',
        body: `${competition.title} ends ${new Date(competition.endDate).toLocaleString()}.`,
        kind: 'info',
      });
    });

    if (pendingRewardCompetitions > 0) {
      alerts.push({
        title: 'Rewards pending',
        body: `${pendingRewardCompetitions} closed competition${pendingRewardCompetitions === 1 ? '' : 's'} still need reward distribution.`,
        kind: 'warn',
      });
    }

    if (failedPushCount > 0) {
      alerts.push({
        title: 'Push delivery failures',
        body: `${failedPushCount} notification batch${failedPushCount === 1 ? '' : 'es'} had failures in the last 30 days.`,
        kind: 'warn',
      });
    }

    if (yesterdayCoins > 0 && todayCoins > yesterdayCoins * 1.5) {
      alerts.push({
        title: 'Reward issuance spike',
        body: `Coins issued today are ${Math.round((todayCoins / yesterdayCoins) * 100)}% of yesterday's total.`,
        kind: 'warn',
      });
    }

    if (!alerts.length) {
      alerts.push({
        title: 'No active alerts',
        body: 'Voucher inventory, competitions, rewards, and notifications look normal.',
        kind: 'good',
      });
    }

    return {
      users,
      activeCompetitions,
      rewardEntries,
      competitionJoins,
      coinsIssued: coinAgg[0]?.total || 0,
      dauTrend,
      alerts,
    };
  },

  getAnalytics: async () => {
    const now = new Date();
    const todayStart = startOfUtcDay(now);
    const sevenDaysAgo = new Date(todayStart.getTime() - 6 * dayMs);
    const thirtyDaysAgo = new Date(todayStart.getTime() - 29 * dayMs);
    const chartDayKeys = buildRecentDayKeys(12);
    const chartStartDate = new Date(`${chartDayKeys[0]}T00:00:00.000Z`);

    const [
      totalUsers,
      dailyActiveUsers,
      weeklyActiveUsers,
      rewardClaims,
      adRewards,
      activeDeviceTokens,
      hydrationAgg,
      notificationAgg,
      purchaseAgg,
      completionRows,
      rewardRows,
    ] = await Promise.all([
      UserModel.countDocuments(),
      UserModel.countDocuments({ updatedAt: { $gte: todayStart } }),
      UserModel.countDocuments({ updatedAt: { $gte: sevenDaysAgo } }),
      RewardLedgerModel.countDocuments({ createdAt: { $gte: thirtyDaysAgo }, amount: { $gt: 0 } }),
      RewardLedgerModel.countDocuments({ type: 'ad_reward', createdAt: { $gte: thirtyDaysAgo } }),
      DeviceTokenModel.countDocuments({ enabled: true, lastSeenAt: { $gte: thirtyDaysAgo } }),
      CompetitionDailyProgressModel.aggregate([
        { $match: { updatedAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: null,
            averageWaterMl: { $avg: '$waterMl' },
            fullCompletionDays: {
              $sum: { $cond: [{ $gte: ['$completedSlotCount', 3] }, 1, 0] },
            },
            totalProgressDays: { $sum: 1 },
          },
        },
      ]),
      NotificationModel.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: null,
            attempted: { $sum: '$pushAttemptedCount' },
            succeeded: { $sum: '$pushSuccessCount' },
            failed: { $sum: '$pushFailureCount' },
            sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
          },
        },
      ]),
      IapTransactionModel.aggregate([
        { $match: { status: 'verified', createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: null,
            purchases: { $sum: 1 },
            coins: { $sum: '$coins' },
          },
        },
      ]),
      CompetitionDailyProgressModel.aggregate([
        { $match: { updatedAt: { $gte: chartStartDate } } },
        {
          $group: {
            _id: '$dateKey',
            total: { $sum: 1 },
            full: { $sum: { $cond: [{ $gte: ['$completedSlotCount', 3] }, 1, 0] } },
          },
        },
      ]),
      RewardLedgerModel.aggregate([
        { $match: { createdAt: { $gte: chartStartDate }, amount: { $gt: 0 } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
            total: { $sum: '$amount' },
          },
        },
      ]),
    ]);

    const hydration = hydrationAgg[0] || {};
    const notifications = notificationAgg[0] || {};
    const purchases = purchaseAgg[0] || {};
    const completionByDay = new Map(
      completionRows.map(row => [
        String(row._id),
        {
          total: Number(row.total) || 0,
          full: Number(row.full) || 0,
        },
      ]),
    );
    const rewardsByDay = sumByKey(rewardRows, '_id', 'total');

    const completionTrend = chartDayKeys.map(dateKey => {
      const row = completionByDay.get(dateKey) || { total: 0, full: 0 };
      return {
        dateKey,
        label: formatShortDay(dateKey),
        value: percent(row.full, row.total),
        total: row.total,
        completed: row.full,
      };
    });

    const rewardsIssuedTrend = chartDayKeys.map(dateKey => ({
      dateKey,
      label: formatShortDay(dateKey),
      value: rewardsByDay.get(dateKey) || 0,
    }));

    return {
      metrics: {
        totalUsers,
        dailyActiveUsers,
        weeklyActiveUsers,
        weeklyActiveRate: percent(weeklyActiveUsers, totalUsers),
        averageHydrationMl: Math.round(Number(hydration.averageWaterMl) || 0),
        fullCompletionRate: percent(Number(hydration.fullCompletionDays) || 0, Number(hydration.totalProgressDays) || 0),
        rewardClaims,
        adRewards,
        activeDeviceTokens,
        notificationDeliveryRate: percent(Number(notifications.succeeded) || 0, Number(notifications.attempted) || 0),
        notificationsSent: Number(notifications.sent) || 0,
        storePurchases: Number(purchases.purchases) || 0,
        purchasedCoins: Number(purchases.coins) || 0,
      },
      trends: {
        completionRateByDay: completionTrend,
        rewardsIssuedByDay: rewardsIssuedTrend,
      },
    };
  },

  listUsers: async (filters: { search?: string; status?: string; country?: string }) => {
    const query: Record<string, unknown> = {};

    if (filters.status && filters.status !== 'all') query.status = filters.status;
    if (filters.country && filters.country !== 'all') query.country = filters.country;
    if (filters.search) {
      query.$or = [
        { username: new RegExp(filters.search, 'i') },
        { city: new RegExp(filters.search, 'i') },
        { firebaseUid: new RegExp(filters.search, 'i') },
        { guestId: new RegExp(filters.search, 'i') },
      ];
    }

    const users = await UserModel.find(query).sort({ createdAt: -1 }).limit(200).lean();
    const wallets = await WalletModel.find({ userId: { $in: users.map(user => user._id) } }).lean();
    const walletByUserId = new Map(wallets.map(wallet => [String(wallet.userId), wallet]));

    return users.map(user => ({
      ...user,
      wallet: walletByUserId.get(String(user._id)) || null,
    }));
  },

  getUserDetail: async (userId: string) => {
    const user = await UserModel.findById(userId).lean();
    if (!user) throw new ApiError('NOT_FOUND', 'User was not found.', 404);

    const [wallet, rewards, competitions] = await Promise.all([
      WalletModel.findOne({ userId: new Types.ObjectId(userId) }).lean(),
      RewardLedgerModel.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).limit(50).lean(),
      CompetitionEntryModel.find({ userId: new Types.ObjectId(userId) }).sort({ joinedAt: -1 }).limit(20).lean(),
    ]);

    return { user, wallet, rewards, competitions };
  },

  updateUserStatus: async (input: { adminId: string; userId: string; status: 'active' | 'disabled'; reason?: string }) => {
    const before = await UserModel.findById(input.userId).lean();
    if (!before) throw new ApiError('NOT_FOUND', 'User was not found.', 404);

    const after = await UserModel.findByIdAndUpdate(
      input.userId,
      { status: input.status },
      { new: true },
    ).lean();

    await auditService.create({
      adminId: input.adminId,
      action: 'user_status_update',
      targetType: 'user',
      targetId: input.userId,
      before,
      after,
      reason: input.reason,
    });

    return after;
  },

  adjustWallet: async (input: {
    adminId: string;
    userId: string;
    currency: 'coins' | 'diamonds';
    amount: number;
    reason: string;
    internalNote?: string;
  }) => {
    const user = await UserModel.findById(input.userId).lean();
    if (!user) throw new ApiError('NOT_FOUND', 'User was not found.', 404);

    const wallet = await WalletModel.findOneAndUpdate(
      { userId: new Types.ObjectId(input.userId) },
      {
        $inc: {
          [input.currency]: input.amount,
          ...(input.currency === 'coins' && input.amount > 0 ? { lifetimeCoins: input.amount } : {}),
        },
      },
      { new: false, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    const after = await WalletModel.findOne({ userId: new Types.ObjectId(input.userId) }).lean();
    const idempotencyKey = `admin:${input.adminId}:${input.userId}:${Date.now()}`;
    const reward = await RewardLedgerModel.create({
      userId: new Types.ObjectId(input.userId),
      type: 'manual_adjustment',
      currency: input.currency,
      amount: input.amount,
      source: 'admin_manual_adjustment',
      idempotencyKey,
      actor: input.adminId,
      metadata: {
        reason: input.reason,
        internalNote: input.internalNote,
      },
    });

    await auditService.create({
      adminId: input.adminId,
      action: 'wallet_adjustment',
      targetType: 'user',
      targetId: input.userId,
      before: wallet,
      after,
      reason: input.reason,
      metadata: { rewardLedgerId: reward._id },
    });

    return { wallet: after, reward };
  },

  listCompetitions: async () => {
    const competitions = await CompetitionModel.find().sort({ startDate: -1 }).lean();
    const counts = await CompetitionEntryModel.aggregate([
      { $group: { _id: '$competitionId', participants: { $sum: 1 } } },
    ]);
    const countByCompetitionId = new Map(counts.map(row => [String(row._id), row.participants]));
    const selectedVoucherIds = competitions
      .map(competition => competition.selectedVoucherId)
      .filter(Boolean);
    const selectedVouchers = selectedVoucherIds.length
      ? await VoucherModel.find({ _id: { $in: selectedVoucherIds } })
          .select('code title provider valueLabel status')
          .lean()
      : [];
    const voucherById = new Map(selectedVouchers.map(voucher => [String(voucher._id), voucher]));

    return competitions.map(competition => ({
      ...competition,
      participants: countByCompetitionId.get(String(competition._id)) || 0,
      selectedVoucher: competition.selectedVoucherId
        ? voucherById.get(String(competition.selectedVoucherId)) || null
        : null,
    }));
  },

  getCompetitionDetail: async (competitionId: string) => {
    const competition = await CompetitionModel.findById(competitionId).lean();
    if (!competition) throw new ApiError('NOT_FOUND', 'Competition was not found.', 404);
    const selectedVoucher = competition.selectedVoucherId
      ? await VoucherModel.findById(competition.selectedVoucherId)
          .select('code title provider valueLabel status redemptionUrl platformLogoUrl')
          .lean()
      : null;

    const entries = await CompetitionEntryModel.find({ competitionId: new Types.ObjectId(competitionId) })
      .sort({ tapScore: -1, completedSlotCount: -1, joinedAt: 1 })
      .populate('userId', 'username profilePictureUrl country city authMode status')
      .lean();

    const participants = entries.map((entry, index) => {
      const user = entry.userId as unknown as {
        _id?: unknown;
        username?: string;
        profilePictureUrl?: string | null;
        country?: string | null;
        city?: string | null;
        authMode?: string;
        status?: string;
      };

      return {
        entryId: String(entry._id),
        userId: String(user?._id || entry.userId),
        username: user?.username || 'Dora User',
        profilePictureUrl: user?.profilePictureUrl || null,
        country: user?.country || null,
        city: user?.city || null,
        authMode: user?.authMode || null,
        userStatus: user?.status || null,
        rank: entry.rank || index + 1,
        tapScore: entry.tapScore,
        completedSlotCount: entry.completedSlotCount,
        rewardClaimed: entry.rewardClaimed,
        joinedAt: entry.joinedAt,
        lastCompletionAt: entry.lastCompletionAt,
      };
    });

    return {
      competition: {
        ...competition,
        participants: participants.length,
        selectedVoucher,
      },
      participants,
    };
  },

  createCompetition: async (input: {
    adminId: string;
    title: string;
    description?: string;
    type: 'global' | 'country' | 'city';
    startDate: Date;
    endDate: Date;
    entryFeeDiamonds: number;
    selectedVoucherId?: string;
    rewards: CompetitionRewardInput[];
  }) => {
    if (input.endDate <= input.startDate) {
      throw new ApiError('VALIDATION_ERROR', 'endDate must be after startDate.', 400);
    }

    const unfinishedCompetition = await CompetitionModel.findOne({
      $or: [
        { status: { $in: ['draft', 'scheduled', 'active'] } },
        { status: 'closed', rewardStatus: { $ne: 'distributed' } },
      ],
    }).lean();

    if (unfinishedCompetition) {
      throw new ApiError(
        'COMPETITION_ALREADY_EXISTS',
        `Complete the current weekly challenge "${unfinishedCompetition.title}" before creating the next one.`,
        409,
      );
    }

    const needsVoucher = input.rewards.some(reward =>
      reward.rewardType === 'voucher_badge' || /voucher/i.test(reward.value || ''),
    );
    if (needsVoucher && !input.selectedVoucherId) {
      throw new ApiError('VALIDATION_ERROR', 'Select an available voucher before creating this competition.', 400);
    }
    if (input.selectedVoucherId && !Types.ObjectId.isValid(input.selectedVoucherId)) {
      throw new ApiError('VALIDATION_ERROR', 'Valid selectedVoucherId is required.', 400);
    }

    const competitionObjectId = new Types.ObjectId();
    let selectedVoucher = null;
    if (input.selectedVoucherId) {
      selectedVoucher = await VoucherModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(input.selectedVoucherId),
          status: 'available',
          assignedUserId: null,
        },
        {
          status: 'reserved',
          competitionId: competitionObjectId,
        },
        { new: true },
      ).lean();

      if (!selectedVoucher) {
        throw new ApiError('CONFLICT', 'Selected voucher is not available. Choose another voucher.', 409);
      }
    }

    const competition = await CompetitionModel.create({
      _id: competitionObjectId,
      title: input.title,
      description: input.description || '',
      type: input.type,
      status: 'draft',
      startDate: input.startDate,
      endDate: input.endDate,
      entryFeeDiamonds: input.entryFeeDiamonds,
      rewards: input.rewards,
      selectedVoucherId: selectedVoucher?._id || null,
      createdBy: input.adminId,
      rewardStatus: 'draft',
    });

    await auditService.create({
      adminId: input.adminId,
      action: 'competition_create',
      targetType: 'competition',
      targetId: String(competition._id),
      after: competition.toObject(),
      reason: 'Competition draft created',
    });

    return competition;
  },

  updateCompetition: async (input: {
    adminId: string;
    competitionId: string;
    updates: Partial<{
      title: string;
      description: string;
      type: 'global' | 'country' | 'city';
      startDate: Date;
      endDate: Date;
      entryFeeDiamonds: number;
      rewards: CompetitionRewardInput[];
    }>;
    reason?: string;
  }) => {
    const before = await CompetitionModel.findById(input.competitionId).lean();
    if (!before) throw new ApiError('NOT_FOUND', 'Competition was not found.', 404);
    if (before.status === 'active' || before.status === 'closed') {
      throw new ApiError('CONFLICT', 'Active or closed competitions cannot be edited directly.', 409);
    }

    const after = await CompetitionModel.findByIdAndUpdate(input.competitionId, input.updates, { new: true }).lean();

    await auditService.create({
      adminId: input.adminId,
      action: 'competition_update',
      targetType: 'competition',
      targetId: input.competitionId,
      before,
      after,
      reason: input.reason,
    });

    return after;
  },

  setCompetitionStatus: async (input: {
    adminId: string;
    competitionId: string;
    status: 'scheduled' | 'active' | 'closed' | 'cancelled';
    action: string;
    reason?: string;
  }) => {
    const before = await CompetitionModel.findById(input.competitionId).lean();
    if (!before) throw new ApiError('NOT_FOUND', 'Competition was not found.', 404);

    const after = await CompetitionModel.findByIdAndUpdate(
      input.competitionId,
      {
        status: input.status,
        rewardStatus: input.status === 'closed' ? 'pending' : before.rewardStatus,
      },
      { new: true },
    ).lean();

    await auditService.create({
      adminId: input.adminId,
      action: input.action,
      targetType: 'competition',
      targetId: input.competitionId,
      before,
      after,
      reason: input.reason,
    });

    if (after && input.status === 'active') {
      await createAndMaybeSendNotification({
        adminId: input.adminId,
        title: `${after.title} started`,
        body: after.description || 'A new hydration challenge is live. Join now and climb the leaderboard.',
        type: 'competition',
        target: 'all',
        route: 'Competition',
      });
    }

    return after;
  },

  rerunLeaderboard: async (input: { adminId: string; competitionId: string; reason?: string }) => {
    const entries = await CompetitionEntryModel.find({ competitionId: new Types.ObjectId(input.competitionId) })
      .sort({ tapScore: -1, completedSlotCount: -1, joinedAt: 1 });

    await Promise.all(entries.map((entry, index) =>
      CompetitionEntryModel.findByIdAndUpdate(entry._id, { rank: index + 1 }),
    ));

    const competition = await CompetitionModel.findByIdAndUpdate(
      input.competitionId,
      { leaderboardGeneratedAt: new Date() },
      { new: true },
    ).lean();

    await auditService.create({
      adminId: input.adminId,
      action: 'competition_leaderboard_rerun',
      targetType: 'competition',
      targetId: input.competitionId,
      reason: input.reason,
      metadata: { entryCount: entries.length },
    });

    return { competition, entryCount: entries.length };
  },

  distributeCompetitionRewards: async (input: { adminId: string; competitionId: string; reason?: string }) => {
    const competition = await CompetitionModel.findById(input.competitionId).lean();
    if (!competition) throw new ApiError('NOT_FOUND', 'Competition was not found.', 404);

    const entries = await CompetitionEntryModel.find({ competitionId: new Types.ObjectId(input.competitionId) })
      .sort({ tapScore: -1, completedSlotCount: -1, joinedAt: 1 });

    await Promise.all(entries.map((entry, index) =>
      CompetitionEntryModel.findByIdAndUpdate(entry._id, { rank: index + 1 }),
    ));

    let rewardedEntries = 0;
    let coinsIssued = 0;
    let diamondsIssued = 0;
    let vouchersAssigned = 0;
    const missingVoucherRanks: number[] = [];

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (entry.rewardClaimed) continue;

      const rank = index + 1;
      const reward = findRewardForRank(competition.rewards as CompetitionRewardInput[], rank);
      if (!reward) {
        entry.rank = rank;
        await entry.save();
        continue;
      }

      const resolvedReward = resolveCompetitionReward(reward, rank, entry._id, competition.entryFeeDiamonds || 0);
      const userId = entry.userId as Types.ObjectId;
      const walletInc: { coins?: number; diamonds?: number; lifetimeCoins?: number } = {};
      const ledgerWrites = [
        { currency: 'coins' as const, amount: resolvedReward.coins || 0 },
        { currency: 'diamonds' as const, amount: resolvedReward.diamonds || 0 },
      ].filter(item => item.amount > 0);

      for (const item of ledgerWrites) {
        const idempotencyKey = `competition_reward:${input.competitionId}:${String(entry._id)}:${item.currency}`;
        const existingLedger = await RewardLedgerModel.findOne({ idempotencyKey }).lean();
        if (existingLedger) continue;

        if (item.currency === 'coins') {
          walletInc.coins = (walletInc.coins || 0) + item.amount;
          walletInc.lifetimeCoins = (walletInc.lifetimeCoins || 0) + item.amount;
          coinsIssued += item.amount;
        } else {
          walletInc.diamonds = (walletInc.diamonds || 0) + item.amount;
          diamondsIssued += item.amount;
        }

        await RewardLedgerModel.create({
          userId,
          type: 'competition_reward',
          currency: item.currency,
          amount: item.amount,
          source: 'competition_reward_distribution',
          idempotencyKey,
          actor: input.adminId,
          metadata: {
              competitionId: input.competitionId,
              entryId: String(entry._id),
              rank,
              rewardType: resolvedReward.rewardType,
              rewardValue: resolvedReward.value,
              creditBackCoins: resolvedReward.creditBackCoins,
              bonusCoins: resolvedReward.bonusCoins,
            },
          });
      }

      let voucherFulfilled = true;
      let voucherAssigned = false;
      if (resolvedReward.rewardType === 'voucher_badge' || /voucher/i.test(resolvedReward.value || '')) {
        const voucherUpdate = {
          status: 'assigned',
          competitionId: competition._id,
          assignedUserId: userId,
          assignedEntryId: entry._id,
          assignedAt: new Date(),
          title: resolvedReward.value || 'Rank #1 Gift Voucher',
        };
        const voucher = competition.selectedVoucherId
          ? await VoucherModel.findOneAndUpdate(
              {
                _id: competition.selectedVoucherId,
                competitionId: competition._id,
                status: 'reserved',
              },
              voucherUpdate,
              { new: true },
            )
          : await VoucherModel.findOneAndUpdate(
              { status: 'available' },
              voucherUpdate,
              { new: true, sort: { createdAt: 1 } },
            );

        if (voucher) {
          vouchersAssigned += 1;
          voucherAssigned = true;
        } else {
          voucherFulfilled = false;
          missingVoucherRanks.push(rank);
        }
      }

      if (Object.keys(walletInc).length) {
        await WalletModel.findOneAndUpdate(
          { userId },
          { $inc: walletInc },
          { new: true, upsert: true, setDefaultsOnInsert: true },
        );
      }

      entry.rank = rank;
      entry.rewardClaimed = voucherFulfilled;
      await entry.save();
      if (voucherFulfilled) {
        rewardedEntries += 1;
        const rewardText = formatRewardParts(resolvedReward, voucherAssigned);
        await notificationService.createAndPushToUser({
          userId: String(userId),
          title: `You won ${competition.title}`,
          body: `Rank #${rank}: you earned ${rewardText}. Open Rewards to see your updated wallet.`,
          route: 'Rewards',
          createdBy: input.adminId,
        });
      }
    }

    const updatedCompetition = await CompetitionModel.findByIdAndUpdate(
      input.competitionId,
      {
        rewardStatus: missingVoucherRanks.length ? 'pending' : 'distributed',
        leaderboardGeneratedAt: new Date(),
      },
      { new: true },
    ).lean();

    await auditService.create({
      adminId: input.adminId,
      action: 'competition_rewards_distribute',
      targetType: 'competition',
      targetId: input.competitionId,
      reason: input.reason,
      metadata: {
        rewardedEntries,
        coinsIssued,
        diamondsIssued,
        vouchersAssigned,
        missingVoucherRanks,
      },
    });

    if (rewardedEntries > 0) {
      await createAndMaybeSendNotification({
        adminId: input.adminId,
        title: `${competition.title} rewards distributed`,
        body: 'Open DoraDrink to see your competition rewards and vouchers.',
        type: 'reward',
        target: 'all',
        route: 'Rewards',
      });
    }

    return {
      competition: updatedCompetition,
      summary: {
        rewardedEntries,
        coinsIssued,
        diamondsIssued,
        vouchersAssigned,
        missingVoucherRanks,
      },
    };
  },

  listRewards: async (filters: { userId?: string; type?: string; currency?: string }) => {
    const query: Record<string, unknown> = {};
    if (filters.userId) query.userId = new Types.ObjectId(filters.userId);
    if (filters.type && filters.type !== 'all') query.type = filters.type;
    if (filters.currency && filters.currency !== 'all') query.currency = filters.currency;

    return RewardLedgerModel.find(query).sort({ createdAt: -1 }).limit(200).lean();
  },

  listIapPurchases: async (filters: { userId?: string; platform?: string; status?: string }) => {
    const query: Record<string, unknown> = {};

    if (filters.userId) {
      if (!Types.ObjectId.isValid(filters.userId)) {
        throw new ApiError('VALIDATION_ERROR', 'Invalid user id.', 400);
      }
      query.userId = new Types.ObjectId(filters.userId);
    }
    if (filters.platform && filters.platform !== 'all') query.platform = filters.platform;
    if (filters.status && filters.status !== 'all') query.status = filters.status;

    const purchases = await IapTransactionModel.find(query)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('userId', 'username firebaseUid authMode country city')
      .lean();

    return purchases;
  },

  listAuditLogs: async () => AuditLogModel.find().sort({ createdAt: -1 }).limit(200).lean(),

  listVouchers: async () =>
    VoucherModel.find()
      .populate('assignedUserId', 'username country city')
      .populate('competitionId', 'title')
      .sort({ createdAt: -1 })
      .limit(300)
      .lean(),

  createVoucher: async (input: { adminId: string; voucher: VoucherCreateInput }) => {
    const voucher = await VoucherModel.create({
      ...input.voucher,
      provider: input.voucher.provider || 'Gift Voucher',
      category: input.voucher.category || 'competition',
      createdBy: input.adminId,
    });

    await auditService.create({
      adminId: input.adminId,
      action: 'voucher_create',
      targetType: 'voucher',
      targetId: String(voucher._id),
      after: voucher.toObject(),
      reason: 'Voucher inventory created',
    });

    return voucher;
  },

  assignVoucher: async (input: { adminId: string; voucherId: string; userId: string; competitionId?: string; reason?: string }) => {
    const before = await VoucherModel.findById(input.voucherId).lean();
    if (!before) throw new ApiError('NOT_FOUND', 'Voucher was not found.', 404);
    if (!Types.ObjectId.isValid(input.userId)) throw new ApiError('VALIDATION_ERROR', 'Valid userId is required.', 400);
    if (before.status === 'reserved') {
      throw new ApiError('CONFLICT', 'This voucher is reserved for a competition reward.', 409);
    }

    const after = await VoucherModel.findByIdAndUpdate(
      input.voucherId,
      {
        status: 'assigned',
        assignedUserId: new Types.ObjectId(input.userId),
        competitionId: input.competitionId && Types.ObjectId.isValid(input.competitionId)
          ? new Types.ObjectId(input.competitionId)
          : before.competitionId,
        assignedAt: new Date(),
      },
      { new: true },
    ).lean();

    await auditService.create({
      adminId: input.adminId,
      action: 'voucher_assign',
      targetType: 'voucher',
      targetId: input.voucherId,
      before,
      after,
      reason: input.reason,
    });

    return after;
  },

  markVoucherUsed: async (input: { adminId: string; voucherId: string; reason?: string }) => {
    const before = await VoucherModel.findById(input.voucherId).lean();
    if (!before) throw new ApiError('NOT_FOUND', 'Voucher was not found.', 404);

    const after = await VoucherModel.findByIdAndUpdate(
      input.voucherId,
      { status: 'used', usedAt: new Date() },
      { new: true },
    ).lean();

    await auditService.create({
      adminId: input.adminId,
      action: 'voucher_used',
      targetType: 'voucher',
      targetId: input.voucherId,
      before,
      after,
      reason: input.reason,
    });

    return after;
  },

  deleteUsedVoucher: async (input: { adminId: string; voucherId: string; reason?: string }) => {
    const before = await VoucherModel.findById(input.voucherId).lean();
    if (!before) throw new ApiError('NOT_FOUND', 'Voucher was not found.', 404);
    if (before.status !== 'used') {
      throw new ApiError('CONFLICT', 'Only used vouchers can be deleted from admin.', 409);
    }

    await VoucherModel.deleteOne({ _id: new Types.ObjectId(input.voucherId) });

    await auditService.create({
      adminId: input.adminId,
      action: 'voucher_delete',
      targetType: 'voucher',
      targetId: input.voucherId,
      before,
      reason: input.reason || 'Used voucher deleted',
    });

    return before;
  },

  listNotifications: async () => NotificationModel.find().sort({ publishAt: -1, createdAt: -1 }).limit(200).lean(),

  createNotification: async (input: {
    adminId: string;
    title: string;
    body: string;
    type: 'competition' | 'reward' | 'motivation' | 'streak' | 'system';
    target: 'all' | 'country' | 'city' | 'inactive' | 'streak_at_risk';
    route?: string | null;
    publishAt?: Date;
    expiresAt?: Date | null;
  }) => {
    return createAndMaybeSendNotification(input);
  },

  getNotificationDeviceTokens: async () => {
    const [deviceTokens, stats] = await Promise.all([
      notificationService.listDeviceTokens(),
      notificationService.getDeviceTokenStats(),
    ]);

    return { deviceTokens, stats };
  },
};
