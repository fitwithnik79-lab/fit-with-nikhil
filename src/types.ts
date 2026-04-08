export type UserRole = 'admin' | 'client';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  displayName?: string;
  photoURL?: string;
  programGoals?: string;
  programDetails?: string;
  height?: string;
  weight?: string;
  chosenProgram?: string;
  onboardingComplete?: boolean;
  createdAt?: any;
}

export interface BodyMetrics {
  id?: string;
  clientId: string;
  date: string; // YYYY-MM-DD
  waterIntake: number; // in ml or glasses
  stepCount: number;
  calories: number;
  weight?: number;
  createdAt: any;
}

export interface Exercise {
  name: string;
  youtubeLink: string;
  sets: number;
  reps: string;
  weight: string;
  rest: string;
  coachNote: string;
}

export interface Workout {
  id?: string;
  clientId: string;
  weekNumber: number;
  dayNumber: number;
  exercises: Exercise[];
  scheduledDate?: any; // Timestamp or Date string
  createdAt?: any;
}

export interface Feedback {
  id?: string;
  clientId: string;
  workoutId: string;
  weekNumber: number;
  dayNumber: number;
  completionStatus: boolean;
  clientNote: string;
  motivationalMessage?: string;
  createdAt: any;
}

export interface WorkoutTemplate {
  id?: string;
  name: string;
  category?: string;
  description?: string;
  exercises: Exercise[];
  createdAt?: any;
}

export interface Message {
  id?: string;
  senderId: string;
  receiverId: string;
  text: string;
  isRead: boolean;
  type: 'chat' | 'motivation' | 'reminder';
  createdAt: any;
}
