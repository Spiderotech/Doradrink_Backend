import { Request, Response } from 'express';
import { z } from 'zod';
import { googleBootstrapUseCase } from '../../../application/useCase/auth/googleBootstrapUseCase';
import { verifyFirebaseIdToken } from '../../../framework/services/firebase/firebaseAdmin';
import { verifyGoogleIdToken } from '../../../framework/services/google/googleAuth';
import { sendSuccess } from '../../../framework/webserver/response/response';

const googleBootstrapSchema = z.object({
  idToken: z.string().min(1).optional(),
  username: z.string().min(1).max(40).optional(),
  avatar: z.string().min(1).max(80).optional(),
  country: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  gender: z.string().max(40).optional(),
  age: z.number().int().min(1).max(120).optional(),
  height: z.number().min(1).max(300).optional(),
  weight: z.number().min(1).max(500).optional(),
  activityLevel: z.string().max(80).optional(),
  climate: z.string().max(80).optional(),
  hydrationGoal: z.number().int().min(500).max(5000).optional(),
  goalType: z.string().max(30).optional(),
});

const getBearerToken = (authorization?: string) => {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(' ');
  return scheme === 'Bearer' ? token : null;
};

export const authController = {
  firebaseBootstrap: async (req: Request, res: Response) => {
    const input = googleBootstrapSchema.parse(req.body);
    const idToken = input.idToken || getBearerToken(req.headers.authorization);
    const decodedToken = await verifyFirebaseIdToken(idToken || '');
    const data = await googleBootstrapUseCase({
      firebaseUid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
      picture: decodedToken.picture,
      username: input.username,
      avatar: input.avatar,
      country: input.country,
      city: input.city,
      gender: input.gender,
      age: input.age,
      height: input.height,
      weight: input.weight,
      activityLevel: input.activityLevel,
      climate: input.climate,
      hydrationGoal: input.hydrationGoal,
      goalType: input.goalType,
    });

    sendSuccess(res, data, 201);
  },

  googleBootstrap: async (req: Request, res: Response) => {
    const input = googleBootstrapSchema.parse(req.body);
    const idToken = input.idToken || getBearerToken(req.headers.authorization);
    const decodedToken = await verifyGoogleIdToken(idToken || '');
    const data = await googleBootstrapUseCase({
      firebaseUid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
      picture: decodedToken.picture,
      username: input.username,
      avatar: input.avatar,
      country: input.country,
      city: input.city,
      gender: input.gender,
      age: input.age,
      height: input.height,
      weight: input.weight,
      activityLevel: input.activityLevel,
      climate: input.climate,
      hydrationGoal: input.hydrationGoal,
      goalType: input.goalType,
    });

    sendSuccess(res, data, 201);
  },
};
