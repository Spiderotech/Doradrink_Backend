import path from 'path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from '../../../config/config';
import { ApiError } from '../../../framework/webserver/response/ApiError';

type UploadImageInput = {
  buffer: Buffer;
  contentType: string;
  originalName: string;
  folder?: string;
};

const allowedImageTypes = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

const getFileExtension = (originalName: string, contentType: string) => {
  const ext = path.extname(originalName).toLowerCase().replace('.', '');
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return ext === 'jpeg' ? 'jpg' : ext;
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
};

const getPublicObjectUrl = (bucket: string, region: string, key: string) => {
  const baseUrl = config.s3.publicBaseUrl?.replace(/\/$/, '');
  if (baseUrl) return `${baseUrl}/${key}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

let s3Client: S3Client | null = null;

const getS3Client = () => {
  if (!config.s3.region || !config.s3.bucket) {
    throw new ApiError('CONFIGURATION_ERROR', 'AWS S3 bucket configuration is missing.', 500);
  }

  if (!s3Client) {
    s3Client = new S3Client({ region: config.s3.region });
  }

  return s3Client;
};

export const s3StorageService = {
  uploadImage: async (input: UploadImageInput) => {
    if (!allowedImageTypes.has(input.contentType)) {
      throw new ApiError('VALIDATION_ERROR', 'Only PNG, JPG, JPEG, and WEBP images are allowed.', 400);
    }

    const bucket = config.s3.bucket;
    const region = config.s3.region;
    if (!bucket || !region) {
      throw new ApiError('CONFIGURATION_ERROR', 'AWS S3 bucket configuration is missing.', 500);
    }

    const folder = input.folder || 'uploads';
    const extension = getFileExtension(input.originalName, input.contentType);
    const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;

    await getS3Client().send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: input.buffer,
      ContentType: input.contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));

    return {
      key,
      url: getPublicObjectUrl(bucket, region, key),
    };
  },
};
