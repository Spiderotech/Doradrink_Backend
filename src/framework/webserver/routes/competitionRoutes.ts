import { Router } from 'express';
import { competitionController } from '../../../adapters/controllers/competition/competitionController';
import { asyncHandler } from '../response/asyncHandler';

export const competitionRoutes = Router();

competitionRoutes.get('/active', asyncHandler(competitionController.active));
competitionRoutes.get('/history', asyncHandler(competitionController.history));
competitionRoutes.get('/:id', asyncHandler(competitionController.detail));
competitionRoutes.post('/:id/join', asyncHandler(competitionController.join));
competitionRoutes.get('/:id/me', asyncHandler(competitionController.me));
competitionRoutes.get('/:id/leaderboard', asyncHandler(competitionController.leaderboard));
competitionRoutes.post('/:id/score', asyncHandler(competitionController.updateScore));
