import { OAuth2Client } from 'google-auth-library';
import { config } from '../../../config/config';
import { ApiError } from '../../webserver/response/ApiError';

const getGoogleClient = () => {
  if (!config.googleWebClientId) {
    throw new ApiError(
      'GOOGLE_AUTH_NOT_CONFIGURED',
      'GOOGLE_WEB_CLIENT_ID is not configured on the backend.',
      500,
    );
  }

  return new OAuth2Client(config.googleWebClientId);
};

export const verifyGoogleIdToken = async (idToken: string) => {
  try {
    const ticket = await getGoogleClient().verifyIdToken({
      idToken,
      audience: config.googleWebClientId,
    });
    const payload = ticket.getPayload();

    if (!payload?.sub) {
      throw new Error('Missing Google subject.');
    }

    return {
      uid: `google:${payload.sub}`,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('UNAUTHORIZED', 'Invalid or expired Google ID token.', 401);
  }
};
