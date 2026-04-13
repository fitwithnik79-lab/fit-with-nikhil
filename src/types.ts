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
  lastLogin?: any;
  streak?: number;
  createdAt?: any;
}

export interface BodyMetrics {
  id?: string;
  clientId: string;
  date: string; // YYYY-MM-DD
  waterIntake: number; // in ml or glasses
  stepCount: number;
  calories: number;
  protein?: number;
  carbs?: number;
  fats?: number;
  weight?: number;
  mood?: string;
  energyLevel?: number; // 1-10
  sleepHours?: number;
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
  completedWeight?: string;
  clientNote?: string;
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

export interface ProgramTemplate {
  id?: string;
  name: string;
  category: string;
  description: string;
  weeks: {
    weekNumber: number;
    days: {
      dayNumber: number;
      workoutTemplateId?: string; // Reference to a WorkoutTemplate
      label: string; // e.g., "Upper Body", "Legs", "Cardio"
      exercises?: Exercise[]; // Inline exercises for custom/AI templates
    }[];
  }[];
  isCustom?: boolean;
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
