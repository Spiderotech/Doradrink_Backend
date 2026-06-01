import admin from 'firebase-admin';
import { config } from '../../../config/config';
import { ApiError } from '../../webserver/response/ApiError';

const hasFirebaseCredentials = Boolean(
  config.firebase.projectId &&
    config.firebase.clientEmail &&
    config.firebase.privateKey,
);

export const getFirebaseAdmin = () => {
  if (!hasFirebaseCredentials) {
    throw new ApiError(
      'FIREBASE_NOT_CONFIGURED',
      'Firebase Admin credentials are not configured on the backend.',
      500,
    );
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebase.projectId,
        clientEmail: config.firebase.clientEmail,
        privateKey: config.firebase.privateKey,
      }),
    });
  }

  return admin;
};

export const verifyFirebaseIdToken = async (idToken: string) => {
  try {
    return await getFirebaseAdmin().auth().verifyIdToken(idToken);
  } catch {
    throw new ApiError('UNAUTHORIZED', 'Invalid or expired Firebase ID token.', 401);
  }
};
