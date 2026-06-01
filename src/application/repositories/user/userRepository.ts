import { Types } from 'mongoose';
import { UserModel } from '../../../framework/database/mongodb/models/userModel';

export type CreateUserRecord = {
  guestId?: string;
  firebaseUid?: string;
  authMode: 'guest' | 'firebase';
  username: string;
  profilePictureUrl?: string;
  avatar?: string;
  country?: string;
  city?: string;
  gender?: string;
  age?: number;
  height?: number;
  weight?: number;
  activityLevel?: string;
  climate?: string;
  hydrationGoal?: number;
  goalType?: string;
};

export const userRepository = {
  findById: (id: string) => UserModel.findById(id).lean(),

  findByGuestId: (guestId: string) => UserModel.findOne({ guestId }).lean(),

  findByFirebaseUid: (firebaseUid: string) => UserModel.findOne({ firebaseUid }).lean(),

  create: (input: CreateUserRecord) => UserModel.create(input),

  updateProfile: (userId: string, updates: Partial<CreateUserRecord>) =>
    UserModel.findByIdAndUpdate(new Types.ObjectId(userId), updates, { new: true }).lean(),
};
