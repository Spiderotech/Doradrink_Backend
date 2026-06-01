import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

[
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env'),
].forEach(envPath => {
  dotenv.config({ path: envPath });
});

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_CORS_ORIGIN: z.string().default('*'),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FCM_SERVER_KEY: z.string().optional(),
  GOOGLE_WEB_CLIENT_ID: z.string().trim().optional(),
  ADMIN_JWT_SECRET: z.string().optional(),
  ADMIN_API_TOKEN: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_PUBLIC_BASE_URL: z.string().optional(),
  IAP_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  APPLE_BUNDLE_ID: z.string().optional(),
  APPLE_ISSUER_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_PRIVATE_KEY: z.string().optional(),
  GOOGLE_PLAY_PACKAGE_NAME: z.string().optional(),
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV !== 'production') return;

  if (value.APP_CORS_ORIGIN.split(',').map(origin => origin.trim()).includes('*')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['APP_CORS_ORIGIN'],
      message: 'APP_CORS_ORIGIN must list explicit admin/app origins in production.',
    });
  }

  if (!value.ADMIN_EMAIL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ADMIN_EMAIL'],
      message: 'ADMIN_EMAIL is required in production.',
    });
  }

  if (!value.ADMIN_PASSWORD) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ADMIN_PASSWORD'],
      message: 'ADMIN_PASSWORD is required in production.',
    });
  }
});

export const env = envSchema.parse(process.env);
