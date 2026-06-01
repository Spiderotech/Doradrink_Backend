import { Request, Response } from 'express';
import { z } from 'zod';
import { competitionService } from '../../../application/services/competition/competitionService';
import { sendSuccess } from '../../../framework/webserver/response/response';

const joinSchema = z.object({
  userId: z.string().min(1),
  idempotencyKey: z.string().min(1).optional(),
});

const meSchema = z.object({
  userId: z.string().min(1),
});

const leaderboardSchema = z.object({
  userId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const historySchema = z.object({
  userId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const scoreSchema = z.object({
  userId: z.string().min(1),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  waterMl: z.number().int().min(0).max(100000000).optional(),
  streakDay: z.boolean().optional(),
  tapScore: z.number().int().min(0).max(100000000).optional(),
  completedSlotCount: z.number().int().min(0).max(1000),
  lastCompletionAt: z.coerce.date().optional(),
});

const getParam = (req: Request, key: string) => String(req.params[key]);

export const competitionController = {
  active: async (_req: Request, res: Response) => {
    sendSuccess(res, { competition: await competitionService.getActive() });
  },

  detail: async (req: Request, res: Response) => {
    sendSuccess(res, { competition: await competitionService.getById(getParam(req, 'id')) });
  },

  join: async (req: Request, res: Response) => {
    const input = joinSchema.parse(req.body);
    const entry = await competitionService.join({
      competitionId: getParam(req, 'id'),
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
    });
    sendSuccess(res, { entry }, 201);
  },

  me: async (req: Request, res: Response) => {
    const { userId } = meSchema.parse(req.query);
    const entry = await competitionService.getMyEntry({
      competitionId: getParam(req, 'id'),
      userId,
    });
    sendSuccess(res, { entry });
  },

  leaderboard: async (req: Request, res: Response) => {
    const input = leaderboardSchema.parse(req.query);
    sendSuccess(res, await competitionService.getLeaderboard({
      competitionId: getParam(req, 'id'),
      userId: input.userId,
      limit: input.limit,
    }));
  },

  history: async (req: Request, res: Response) => {
    const input = historySchema.parse(req.query);
    const competitions = await competitionService.getPastCompetitions(input);
    sendSuccess(res, { competitions });
  },

  updateScore: async (req: Request, res: Response) => {
    const input = scoreSchema.parse(req.body);
    const entry = await competitionService.updateScore({
      competitionId: getParam(req, 'id'),
      ...input,
    });
    sendSuccess(res, { entry });
  },
};
