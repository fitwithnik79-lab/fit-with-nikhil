export type UserRole = 'admin' | 'client';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  displayName?: string;
  programGoals?: string;
  programDetails?: string;
  createdAt?: any;
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
