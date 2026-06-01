import { env } from './env';

const corsOrigins = env.APP_CORS_ORIGIN
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

export const config = {
  appName: 'DoraDrink',
  port: env.PORT,
  mongoUri: env.MONGODB_URI,
  corsOrigin: corsOrigins.length ? corsOrigins : ['*'],
  isProduction: env.NODE_ENV === 'production',
  firebase: {
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  googleWebClientId: env.GOOGLE_WEB_CLIENT_ID,
  adminApiToken: env.ADMIN_API_TOKEN,
  adminBootstrap: {
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
  },
  s3: {
    region: env.AWS_REGION,
    bucket: env.AWS_S3_BUCKET,
    publicBaseUrl: env.AWS_S3_PUBLIC_BASE_URL,
  },
  iap: {
    environment: env.IAP_ENV,
    apple: {
      bundleId: env.APPLE_BUNDLE_ID,
      issuerId: env.APPLE_ISSUER_ID,
      keyId: env.APPLE_KEY_ID,
      privateKey: env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    google: {
      packageName: env.GOOGLE_PLAY_PACKAGE_NAME,
      serviceAccountJsonBase64: env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64,
    },
  },
};
