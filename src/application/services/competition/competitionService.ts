import { Types } from 'mongoose';
import { CompetitionModel } from '../../../framework/database/mongodb/models/competitionModel';
import { CompetitionDailyProgressModel } from '../../../framework/database/mongodb/models/competitionDailyProgressModel';
import { CompetitionEntryModel } from '../../../framework/database/mongodb/models/competitionEntryModel';
import { RewardLedgerModel } from '../../../framework/database/mongodb/models/rewardLedgerModel';
import { UserModel } from '../../../framework/database/mongodb/models/userModel';
import { WalletModel } from '../../../framework/database/mongodb/models/walletModel';
import { ApiError } from '../../../framework/webserver/response/ApiError';

export const competitionService = {
  getActive: async () => {
    const upcomingOrActiveCompetition = await CompetitionModel.findOne({
      status: { $in: ['active', 'scheduled'] },
      endDate: { $gte: new Date() },
    }).sort({ startDate: 1 }).lean();

    const competition = upcomingOrActiveCompetition || await CompetitionModel.findOne({
      status: { $ne: 'cancelled' },
      $or: [
        { status: 'closed' },
        { endDate: { $lt: new Date() } },
      ],
    }).sort({ endDate: -1 }).lean();

    if (!competition) return null;

    const participants = await CompetitionEntryModel.countDocuments({ competitionId: competition._id });
    return { ...competition, participants };
  },

  getById: async (competitionId: string) => {
    const competition = await CompetitionModel.findById(competitionId).lean();
    if (!competition) throw new ApiError('NOT_FOUND', 'Competition was not found.', 404);
    return competition;
  },

  join: async (input: { competitionId: string; userId: string; idempotencyKey?: string }) => {
    const [competition, user] = await Promise.all([
      CompetitionModel.findById(input.competitionId).lean(),
      UserModel.findById(input.userId).lean(),
    ]);

    if (!competition) throw new ApiError('NOT_FOUND', 'Competition was not found.', 404);
    if (!user) throw new ApiError('NOT_FOUND', 'User was not found.', 404);
    if (competition.status !== 'active' && competition.status !== 'scheduled') {
      throw new ApiError('CONFLICT', 'Competition is not open for joining.', 409);
    }

    const existingEntry = await CompetitionEntryModel.findOne({
      competitionId: new Types.ObjectId(input.competitionId),
      userId: new Types.ObjectId(input.userId),
    }).lean();
    if (existingEntry) return existingEntry;

    const wallet = await WalletModel.findOne({ userId: new Types.ObjectId(input.userId) });
    if (!wallet || wallet.diamonds < competition.entryFeeDiamonds) {
      throw new ApiError('INSUFFICIENT_BALANCE', 'Not enough diamonds to join this competition.', 400);
    }

    wallet.diamonds -= competition.entryFeeDiamonds;
    await wallet.save();

    const entry = await CompetitionEntryModel.create({
      competitionId: new Types.ObjectId(input.competitionId),
      userId: new Types.ObjectId(input.userId),
      energyLevelAtJoin: null,
    });

    await RewardLedgerModel.create({
      userId: new Types.ObjectId(input.userId),
      type: 'competition_join_fee',
      currency: 'diamonds',
      amount: -competition.entryFeeDiamonds,
      source: 'competition_join',
      idempotencyKey: input.idempotencyKey || `competition_join:${input.competitionId}:${input.userId}`,
      actor: 'system',
      metadata: { competitionId: input.competitionId },
    });

    return entry;
  },

  getMyEntry: (input: { competitionId: string; userId: string }) =>
    CompetitionEntryModel.findOne({
      competitionId: new Types.ObjectId(input.competitionId),
      userId: new Types.ObjectId(input.userId),
    }).lean(),

  updateScore: async (input: {
    competitionId: string;
    userId: string;
    dateKey?: string;
    waterMl?: number;
    streakDay?: boolean;
    tapScore?: number;
    completedSlotCount: number;
    lastCompletionAt?: Date;
  }) => {
    const competition = await CompetitionModel.findById(input.competitionId).lean();
    if (!competition) throw new ApiError('NOT_FOUND', 'Competition was not found.', 404);

    const now = new Date();
    if (competition.status !== 'active' || competition.startDate > now || competition.endDate <= now) {
      throw new ApiError('CONFLICT', 'Competition score sync is open only during the active challenge window.', 409);
    }

    const competitionObjectId = new Types.ObjectId(input.competitionId);
    const userObjectId = new Types.ObjectId(input.userId);
    const entry = await CompetitionEntryModel.findOne({
      competitionId: competitionObjectId,
      userId: userObjectId,
    });
    if (!entry) throw new ApiError('NOT_FOUND', 'Join the competition before updating score.', 404);

    const dateKey = input.dateKey || now.toISOString().slice(0, 10);
    const waterMl = Math.max(input.waterMl ?? input.tapScore ?? 0, 0);
    const completedSlotCount = Math.max(input.completedSlotCount || 0, 0);
    const streakDay = Boolean(input.streakDay && completedSlotCount >= 3);
    const dayScore = waterMl + completedSlotCount * 1000 + (streakDay ? 500 : 0);

    await CompetitionDailyProgressModel.findOneAndUpdate(
      {
        competitionId: competitionObjectId,
        userId: userObjectId,
        dateKey,
      },
      {
        competitionId: competitionObjectId,
        userId: userObjectId,
        dateKey,
        waterMl,
        completedSlotCount,
        streakDay,
        lastCompletionAt: input.lastCompletionAt || now,
        score: dayScore,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    const totals = await CompetitionDailyProgressModel.aggregate([
      { $match: { competitionId: competitionObjectId, userId: userObjectId } },
      {
        $group: {
          _id: null,
          challengeWaterMl: { $sum: '$waterMl' },
          completedSlotCount: { $sum: '$completedSlotCount' },
          challengeStreakDays: {
            $sum: {
              $cond: [{ $and: ['$streakDay', { $gte: ['$completedSlotCount', 3] }] }, 1, 0],
            },
          },
          tapScore: {
            $sum: {
              $add: [
                '$waterMl',
                { $multiply: ['$completedSlotCount', 1000] },
                { $cond: [{ $and: ['$streakDay', { $gte: ['$completedSlotCount', 3] }] }, 500, 0] },
              ],
            },
          },
          lastCompletionAt: { $max: '$lastCompletionAt' },
        },
      },
    ]);
    const total = totals[0] || {};

    entry.challengeWaterMl = total.challengeWaterMl || 0;
    entry.completedSlotCount = total.completedSlotCount || 0;
    entry.challengeStreakDays = total.challengeStreakDays || 0;
    entry.tapScore = total.tapScore || 0;
    entry.lastCompletionAt = total.lastCompletionAt || input.lastCompletionAt || now;
    await entry.save();

    return entry;
  },

  getLeaderboard: async (input: { competitionId: string; userId?: string; limit?: number }) => {
    const competition = await CompetitionModel.findById(input.competitionId).lean();
    if (!competition) throw new ApiError('NOT_FOUND', 'Competition was not found.', 404);

    const entries = await CompetitionEntryModel.find({ competitionId: new Types.ObjectId(input.competitionId) })
      .sort({ tapScore: -1, completedSlotCount: -1, joinedAt: 1 })
      .limit(Math.min(Math.max(input.limit || 50, 1), 100))
      .populate('userId', 'username profilePictureUrl avatar country city')
      .lean();

    const entryUserIds = entries.map(entry => {
      const user = entry.userId as unknown as { _id?: unknown };
      return user?._id || entry.userId;
    });
    const [wallets, streakTotals] = await Promise.all([
      WalletModel.find({ userId: { $in: entryUserIds } }).select('userId diamonds').lean(),
      CompetitionDailyProgressModel.aggregate([
        {
          $match: {
            competitionId: new Types.ObjectId(input.competitionId),
            userId: { $in: entryUserIds },
          },
        },
        {
          $group: {
            _id: '$userId',
            challengeStreakDays: {
              $sum: {
                $cond: [{ $and: ['$streakDay', { $gte: ['$completedSlotCount', 3] }] }, 1, 0],
              },
            },
          },
        },
      ]),
    ]);
    const diamondsByUserId = new Map(wallets.map(wallet => [String(wallet.userId), wallet.diamonds || 0]));
    const streaksByUserId = new Map(streakTotals.map(item => [String(item._id), item.challengeStreakDays || 0]));

    const rows = entries.map((entry, index) => {
      const user = entry.userId as unknown as {
        _id?: unknown;
        username?: string;
        profilePictureUrl?: string | null;
        avatar?: string | null;
        country?: string | null;
        city?: string | null;
      };
      const rowUserId = String(user?._id || entry.userId);

      return {
        entryId: String(entry._id),
        userId: rowUserId,
        username: user?.username || 'Dora User',
        profilePictureUrl: user?.profilePictureUrl || null,
        avatar: user?.avatar || null,
        country: user?.country || null,
        city: user?.city || null,
        diamonds: diamondsByUserId.get(rowUserId) || 0,
        rank: index + 1,
        tapScore: entry.tapScore,
        completedSlotCount: entry.completedSlotCount,
        streak: streaksByUserId.get(rowUserId) || 0,
        lastCompletionAt: entry.lastCompletionAt,
        joinedAt: entry.joinedAt,
      };
    });

    let currentUser = input.userId ? rows.find(row => row.userId === input.userId) || null : null;
    if (input.userId && !currentUser) {
      const entry = await CompetitionEntryModel.findOne({
        competitionId: new Types.ObjectId(input.competitionId),
        userId: new Types.ObjectId(input.userId),
      })
        .populate('userId', 'username profilePictureUrl avatar country city')
        .lean();

      if (entry) {
        const [betterEntryCount, userStreakTotal] = await Promise.all([
          CompetitionEntryModel.countDocuments({
            competitionId: new Types.ObjectId(input.competitionId),
            $or: [
              { tapScore: { $gt: entry.tapScore } },
              { tapScore: entry.tapScore, completedSlotCount: { $gt: entry.completedSlotCount } },
              { tapScore: entry.tapScore, completedSlotCount: entry.completedSlotCount, joinedAt: { $lt: entry.joinedAt } },
            ],
          }),
          CompetitionDailyProgressModel.aggregate([
            {
              $match: {
                competitionId: new Types.ObjectId(input.competitionId),
                userId: new Types.ObjectId(input.userId),
              },
            },
            {
              $group: {
                _id: '$userId',
                challengeStreakDays: {
                  $sum: {
                    $cond: [{ $and: ['$streakDay', { $gte: ['$completedSlotCount', 3] }] }, 1, 0],
                  },
                },
              },
            },
          ]),
        ]);
        const user = entry.userId as unknown as {
          _id?: unknown;
          username?: string;
          profilePictureUrl?: string | null;
          avatar?: string | null;
          country?: string | null;
          city?: string | null;
        };

        const wallet = await WalletModel.findOne({ userId: new Types.ObjectId(input.userId) }).select('diamonds').lean();
        currentUser = {
          entryId: String(entry._id),
          userId: String(user?._id || entry.userId),
          username: user?.username || 'Dora User',
          profilePictureUrl: user?.profilePictureUrl || null,
          avatar: user?.avatar || null,
          country: user?.country || null,
          city: user?.city || null,
          diamonds: wallet?.diamonds || 0,
          rank: betterEntryCount + 1,
          tapScore: entry.tapScore,
          completedSlotCount: entry.completedSlotCount,
          streak: userStreakTotal[0]?.challengeStreakDays || 0,
          lastCompletionAt: entry.lastCompletionAt,
          joinedAt: entry.joinedAt,
        };
      }
    }

    return {
      competition,
      leaderboard: rows,
      currentUser,
      leaderboardGeneratedAt: competition.leaderboardGeneratedAt,
    };
  },

  getPastCompetitions: async (input: { userId?: string; limit?: number }) => {
    const now = new Date();
    const competitions = await CompetitionModel.find({
      $or: [
        { status: 'closed' },
        { endDate: { $lt: now } },
      ],
      status: { $ne: 'cancelled' },
    })
      .sort({ endDate: -1 })
      .limit(Math.min(Math.max(input.limit || 10, 1), 50))
      .lean();

    const userObjectId = input.userId && Types.ObjectId.isValid(input.userId)
      ? new Types.ObjectId(input.userId)
      : null;

    return Promise.all(competitions.map(async competition => {
      const competitionObjectId = new Types.ObjectId(String(competition._id));
      const [participants, entry] = await Promise.all([
        CompetitionEntryModel.countDocuments({ competitionId: competitionObjectId }),
        userObjectId
          ? CompetitionEntryModel.findOne({
              competitionId: competitionObjectId,
              userId: userObjectId,
            }).lean()
          : null,
      ]);

      let rank = entry?.rank || null;
      if (entry && !rank) {
        const betterEntryCount = await CompetitionEntryModel.countDocuments({
          competitionId: competitionObjectId,
          $or: [
            { tapScore: { $gt: entry.tapScore } },
            { tapScore: entry.tapScore, completedSlotCount: { $gt: entry.completedSlotCount } },
            { tapScore: entry.tapScore, completedSlotCount: entry.completedSlotCount, joinedAt: { $lt: entry.joinedAt } },
          ],
        });
        rank = betterEntryCount + 1;
      }

      return {
        competition: {
          _id: String(competition._id),
          title: competition.title,
          description: competition.description,
          startDate: competition.startDate,
          endDate: competition.endDate,
          status: competition.status,
          participants,
        },
        currentUser: entry
          ? {
              entryId: String(entry._id),
              rank,
              tapScore: entry.tapScore,
              completedSlotCount: entry.completedSlotCount,
              joinedAt: entry.joinedAt,
              rewardClaimed: entry.rewardClaimed,
            }
          : null,
      };
    }));
  },
};
