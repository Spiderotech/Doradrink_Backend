import crypto from 'crypto';
import { AdminModel } from '../../../framework/database/mongodb/models/adminModel';
import { ApiError } from '../../../framework/webserver/response/ApiError';

const passwordIterations = 120000;
const passwordKeyLength = 64;
const tokenTtlMs = 7 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

const hashPassword = (password: string, salt = crypto.randomBytes(16).toString('hex')) => {
  const hash = crypto.pbkdf2Sync(password, salt, passwordIterations, passwordKeyLength, 'sha512').toString('hex');
  return `${passwordIterations}:${salt}:${hash}`;
};

const verifyPassword = (password: string, storedHash: string) => {
  const [iterationsValue, salt, expectedHash] = storedHash.split(':');
  const iterations = Number(iterationsValue);
  if (!iterations || !salt || !expectedHash) return false;

  const actualHash = crypto.pbkdf2Sync(password, salt, iterations, passwordKeyLength, 'sha512').toString('hex');
  if (actualHash.length !== expectedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'));
};

export const adminAuthService = {
  createPasswordHash: (password: string) => hashPassword(password),

  bootstrapSuperAdmin: async (input: { email?: string; password?: string }) => {
    if (!input.email || !input.password) return null;

    return AdminModel.findOneAndUpdate(
      { email: input.email.toLowerCase().trim() },
      {
        email: input.email.toLowerCase().trim(),
        passwordHash: hashPassword(input.password),
        role: 'super_admin',
        status: 'active',
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
  },

  login: async (input: { email: string; password: string }) => {
    const email = input.email.toLowerCase().trim();
    const admin = await AdminModel.findOne({ email });
    if (!admin || admin.status !== 'active' || !verifyPassword(input.password, admin.passwordHash)) {
      throw new ApiError('UNAUTHORIZED', 'Invalid admin email or password.', 401);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const sessionExpiresAt = new Date(Date.now() + tokenTtlMs);
    admin.sessionTokenHash = hashToken(token);
    admin.sessionExpiresAt = sessionExpiresAt;
    admin.lastLoginAt = new Date();
    await admin.save();

    return {
      token,
      admin: {
        id: String(admin._id),
        email: admin.email,
        role: 'super_admin' as const,
      },
      expiresAt: sessionExpiresAt,
    };
  },

  verifySessionToken: async (token: string) => {
    const tokenHash = hashToken(token);
    const admin = await AdminModel.findOne({
      sessionTokenHash: tokenHash,
      status: 'active',
      sessionExpiresAt: { $gt: new Date() },
    }).lean();

    if (!admin) {
      throw new ApiError('UNAUTHORIZED', 'Valid admin login is required.', 401);
    }

    return {
      adminId: String(admin._id),
      email: admin.email,
      role: 'super_admin' as const,
    };
  },
};
