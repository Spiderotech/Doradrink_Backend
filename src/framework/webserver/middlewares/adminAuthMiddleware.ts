import { Request, RequestHandler } from 'express';
import { adminAuthService } from '../../../application/services/admin/adminAuthService';
import { ApiError } from '../response/ApiError';

export type AdminRequest = Request & {
  admin?: {
    adminId: string;
    email?: string;
    role: 'super_admin';
  };
};

const getBearerToken = (authorization?: string) => {
  if (!authorization) return null;

  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) return null;

  return token;
};

export const requireAdminAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = getBearerToken(req.headers.authorization);
    if (!token) {
      throw new ApiError('UNAUTHORIZED', 'Valid admin bearer token is required.', 401);
    }

    const admin = await adminAuthService.verifySessionToken(token);
    (req as AdminRequest).admin = {
      adminId: admin.adminId,
      email: admin.email,
      role: admin.role,
    };

    next();
  } catch (error) {
    next(error);
  }
};
