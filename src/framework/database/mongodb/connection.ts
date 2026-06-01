import mongoose from 'mongoose';
import { config } from '../../../config/config';

export const connectMongoDB = async () => {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');
};
