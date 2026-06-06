export type AuthMode = 'guest' | 'firebase';

export type UserEntity = {
  id: string;
  firebaseUid?: string | null;
  guestId?: string | null;
  authMode: AuthMode;
  email?: string | null;
  username: string;
  profilePictureUrl?: string | null;
  avatar?: string | null;
  country?: string | null;
  city?: string | null;
  gender?: string | null;
  age?: number | null;
  height?: number | null;
  weight?: number | null;
  activityLevel?: string | null;
  climate?: string | null;
  hydrationGoal: number;
  goalType: string;
  currentStreakDays: number;
  bestStreakDays: number;
  lifetimeWaterMl: number;
  lifetimeTaps: number;
  status: 'active' | 'disabled';
  createdAt: Date;
  updatedAt: Date;
};
