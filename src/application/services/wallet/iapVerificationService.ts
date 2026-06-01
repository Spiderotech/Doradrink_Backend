import crypto from 'crypto';
import { JWT } from 'google-auth-library';
import { config } from '../../../config/config';
import { ApiError } from '../../../framework/webserver/response/ApiError';

export const iapProducts = {
  coins_500: { coins: 500, packId: 'starter' },
  coins_1500: { coins: 1500, packId: 'value' },
  coins_3000: { coins: 3000, packId: 'mega' },
} as const;

export type IapProductId = keyof typeof iapProducts;
export type IapPlatform = 'ios' | 'android';

type VerifiedPurchase = {
  platform: IapPlatform;
  productId: IapProductId;
  transactionId?: string | null;
  purchaseToken?: string | null;
  orderId?: string | null;
  rawResponse: unknown;
};

const assertConfigured = (condition: unknown, message: string) => {
  if (!condition) {
    throw new ApiError('IAP_NOT_CONFIGURED', message, 503);
  }
};

const base64Url = (input: Buffer | string) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const createAppleServerApiToken = () => {
  const { issuerId, keyId, privateKey, bundleId } = config.iap.apple;

  assertConfigured(issuerId, 'Apple IAP issuer id is not configured.');
  assertConfigured(keyId, 'Apple IAP key id is not configured.');
  assertConfigured(privateKey, 'Apple IAP private key is not configured.');
  assertConfigured(bundleId, 'Apple bundle id is not configured.');

  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'ES256',
    kid: keyId,
    typ: 'JWT',
  };
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 900,
    aud: 'appstoreconnect-v1',
    bid: bundleId,
  };

  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: privateKey!,
    dsaEncoding: 'ieee-p1363',
  });

  return `${signingInput}.${base64Url(signature)}`;
};

const decodeJwtPayload = (jwt: string) => {
  const [, payload] = jwt.split('.');
  if (!payload) {
    throw new ApiError('IAP_VERIFICATION_FAILED', 'Apple transaction response was invalid.', 400);
  }

  return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
};

const verifyApplePurchase = async (input: {
  productId: IapProductId;
  transactionId?: string;
}): Promise<VerifiedPurchase> => {
  if (!input.transactionId) {
    throw new ApiError('VALIDATION_ERROR', 'Apple transactionId is required.', 400);
  }

  const token = createAppleServerApiToken();
  const baseUrl = config.iap.environment === 'production'
    ? 'https://api.storekit.itunes.apple.com'
    : 'https://api.storekit-sandbox.itunes.apple.com';

  const response = await fetch(`${baseUrl}/inApps/v1/transactions/${encodeURIComponent(input.transactionId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const json = await response.json();

  if (!response.ok || !json.signedTransactionInfo) {
    throw new ApiError('IAP_VERIFICATION_FAILED', json.errorMessage || 'Apple purchase verification failed.', 400);
  }

  const transaction = decodeJwtPayload(json.signedTransactionInfo);

  if (transaction.bundleId !== config.iap.apple.bundleId) {
    throw new ApiError('IAP_VERIFICATION_FAILED', 'Apple bundle id did not match.', 400);
  }
  if (transaction.productId !== input.productId) {
    throw new ApiError('IAP_VERIFICATION_FAILED', 'Apple product id did not match.', 400);
  }
  if (transaction.revocationDate) {
    throw new ApiError('IAP_VERIFICATION_FAILED', 'Apple purchase was revoked.', 400);
  }

  return {
    platform: 'ios',
    productId: input.productId,
    transactionId: String(transaction.transactionId || input.transactionId),
    orderId: transaction.webOrderLineItemId ? String(transaction.webOrderLineItemId) : null,
    rawResponse: {
      response: json,
      transaction,
    },
  };
};

const getGoogleServiceAccount = () => {
  const raw = config.iap.google.serviceAccountJsonBase64;
  assertConfigured(raw, 'Google Play service account JSON is not configured.');

  try {
    return JSON.parse(Buffer.from(raw!, 'base64').toString('utf8'));
  } catch {
    throw new ApiError('IAP_NOT_CONFIGURED', 'Google Play service account JSON is invalid.', 503);
  }
};

const verifyGooglePurchase = async (input: {
  productId: IapProductId;
  purchaseToken?: string;
  packageName?: string;
}): Promise<VerifiedPurchase> => {
  if (!input.purchaseToken) {
    throw new ApiError('VALIDATION_ERROR', 'Google purchaseToken is required.', 400);
  }

  const packageName = input.packageName || config.iap.google.packageName;
  assertConfigured(packageName, 'Google Play package name is not configured.');

  const serviceAccount = getGoogleServiceAccount();
  const client = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const authHeaders = await client.getRequestHeaders();
  const headers = authHeaders instanceof Headers
    ? Object.fromEntries(authHeaders.entries())
    : authHeaders;
  const url = [
    'https://androidpublisher.googleapis.com/androidpublisher/v3/applications',
    encodeURIComponent(packageName!),
    'purchases/products',
    encodeURIComponent(input.productId),
    'tokens',
    encodeURIComponent(input.purchaseToken),
  ].join('/');

  const response = await fetch(url, {
    headers,
  });
  const json = await response.json();

  if (!response.ok) {
    throw new ApiError('IAP_VERIFICATION_FAILED', json.error?.message || 'Google Play purchase verification failed.', 400);
  }
  if (json.purchaseState !== 0) {
    throw new ApiError('IAP_VERIFICATION_FAILED', 'Google Play purchase is not completed.', 400);
  }

  return {
    platform: 'android',
    productId: input.productId,
    purchaseToken: input.purchaseToken,
    orderId: json.orderId || null,
    rawResponse: json,
  };
};

export const iapVerificationService = {
  verify: (input: {
    platform: IapPlatform;
    productId: IapProductId;
    transactionId?: string;
    purchaseToken?: string;
    packageName?: string;
  }) => {
    if (!iapProducts[input.productId]) {
      throw new ApiError('VALIDATION_ERROR', 'Unknown IAP product id.', 400);
    }

    if (input.platform === 'ios') {
      return verifyApplePurchase(input);
    }

    return verifyGooglePurchase(input);
  },
};
