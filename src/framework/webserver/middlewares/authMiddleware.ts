import { Request, RequestHandler } from 'express';
import { verifyFirebaseIdToken } from '../../services/firebase/firebaseAdmin';
import { ApiError } from '../response/ApiError';

export type AuthenticatedRequest = Request & {
  auth?: {
    firebaseUid: string;
    email?: string;
    name?: string;
    picture?: string;
  };
};

const getBearerToken = (authorization?: string) => {
  if (!authorization) return null;

  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) return null;

  return token;
};

export const requireFirebaseAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = getBearerToken(req.headers.authorization);

    if (!token) {
      throw new ApiError('UNAUTHORIZED', 'Bearer token is required.', 401);
    }

    const decodedToken = await verifyFirebaseIdToken(token);
    (req as AuthenticatedRequest).auth = {
      firebaseUid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
      picture: decodedToken.picture,
    };

    next();
  } catch (error) {
    next(error);
  }
};
