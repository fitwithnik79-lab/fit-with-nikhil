export type UserRole = 'admin' | 'client';
export type ClientType = 'fitness' | 'knee_injury' | 'back_injury' | 'shoulder_injury';

export interface Badge {
  id: string;
  name: string;
  icon: string;
  description: string;
  unlockedAt?: string;
  category: 'workout' | 'nutrition' | 'consistency' | 'milestone';
}

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  clientType?: ClientType;
  displayName?: string;
  photoURL?: string;
  programGoals?: string;
  programDetails?: string;
  height?: string;
  weight?: string;
  chosenProgram?: string;
  gender?: 'male' | 'female' | 'other';
  onboardingComplete?: boolean;
  lastLogin?: any;
  streak?: number;
  badges?: Badge[];
  status?: 'active' | 'inactive';
  inviteToken?: string;
  createdAt?: any;
  stepGoal?: number;
  googleFitTokens?: {
    access_token: string;
    refresh_token: string;
    expiry_date: number;
  };
  googleCalTokens?: {
    access_token: string;
    refresh_token: string;
    expiry_date: number;
  };
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
  voiceNote?: string;
  block?: string;
  completedWeight?: string;
  completedReps?: string;
  completedSets?: number;
  clientNote?: string;
  isCompleted?: boolean;
}

export interface Workout {
  id?: string;
  clientId: string;
  weekNumber: number;
  dayNumber: number;
  exercises: Exercise[];
  notes?: string;
  scheduledDate?: any; // Timestamp or Date string
  createdAt?: any;
  startTime?: string;
  durationMinutes?: number;
  calEventId?: string;
  calSyncStatus?: 'synced' | 'not_connected' | 'error';
  calSyncError?: string;
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
  isRead?: boolean;
  createdAt: any;
}

export interface WorkoutTemplate {
  id?: string;
  name: string;
  category?: string;
  description?: string;
  notes?: string;
  exercises: Exercise[];
  createdAt?: any;
}

export interface ExerciseLibraryItem {
  id?: string;
  name: string;
  normalizedName: string;
  youtubeLink?: string;
  sets?: number;
  reps?: string;
  weight?: string;
  rest?: string;
  coachNote?: string;
  block?: string;
  usageCount?: number;
  source?: string;
  createdAt?: any;
  updatedAt?: any;
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
  type: 'chat' | 'motivation' | 'reminder' | 'general';
  createdAt: any;
}

export interface Meal {
  id?: string;
  clientId: string;
  date: string; // YYYY-MM-DD
  type: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
  name: string;
  items: { 
    name: string; 
    calories: number; 
    protein: number; 
    carbs: number; 
    fats: number; 
  }[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
  imageURL?: string;
  createdAt: any;
}

export interface NutritionPlan {
  id?: string;
  clientId: string;
  name: string;
  description: string;
  targetMacros: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
  };
  plannedMeals?: {
    id: string;
    dayNumber?: number;
    time: string;
    name: string;
    notes: string;
    isCompleted?: boolean;
    completedAt?: string;
  }[];
  guidelines: string[];
  recommendedFoods: string[];
  restrictedFoods: string[];
  isActive: boolean;
  createdAt: any;
}

export interface NutritionTemplate {
  id: string;
  name: string;
  description: string;
  targetMacros: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
  };
  guidelines: string[];
  plannedMeals?: {
    id: string;
    dayNumber?: number;
    time: string;
    name: string;
    notes: string;
  }[];
}

export interface Habit {
  id?: string;
  clientId: string;
  title: string;
  frequency: 'daily' | 'weekly';
  category?: string;
  icon?: string;
  active: boolean;
  createdAt: any;
}

export interface HabitLog {
  id?: string;
  habitId: string;
  clientId: string;
  date: string; // YYYY-MM-DD
  completed: boolean;
  updatedAt: any;
}

export interface Reminder {
  id?: string;
  clientId: string;
  title: string;
  description?: string;
  time: string; // HH:mm
  days?: number[]; // [0, 1, 2, 3, 4, 5, 6] for Sunday-Saturday
  habitId?: string; // Reference to a Habit
  goalId?: string; // Reference to a Goal
  active: boolean;
  type: 'habit' | 'goal' | 'task';
  lastNotified?: string; // Date string or YYYY-MM-DD-HH-mm
  createdAt: any;
}

export interface Goal {
  id?: string;
  clientId: string;
  title: string;
  targetValue?: number;
  currentValue?: number;
  unit?: string;
  deadline?: string;
  category?: string;
  status: 'in-progress' | 'completed' | 'deferred';
  notes?: string;
  createdAt: any;
}

export interface MessageTemplate {
  id?: string;
  title: string;
  content: string;
  category: 'motivation' | 'reminder' | 'general';
  createdAt: any;
}

export interface WeeklyCheckIn {
  id?: string;
  uid: string;
  clientType: ClientType;
  weekOf: string;
  submittedAt: string;
  workoutPattern?: 'boring' | 'interesting';
  programRating?: number;
  freeText?: string;
  // fitness only:
  strengthGain?: boolean | string;
  energyLevel?: number;
  dietAdherence?: 'yes' | 'partial' | 'partially' | 'no';
  // injury clients:
  painReduction?: 'slight' | 'moderate' | 'no' | string;
  movementImprovement?: 'slight' | 'moderate' | 'no' | string;
  // knee only:
  kneeStiffness?: boolean | string;
  // back only:
  sharpPain?: boolean | string;
  // shoulder only:
  overheadReach?: boolean | string;
  sleepAffected?: boolean | string;
  // --- AI ADAPTATION FIELDS ---
  exerciseFeedbackNotes?: string;
  painAreas?: string[]; // e.g. ['knee', 'lower_back', 'shoulder']
  exercisesTooHard?: string[];
  exercisesTooEasy?: string[];
  equipmentConstraints?: string;
  sleepRating?: number;
  aiAdaptedStatus?: 'pending' | 'adapted' | 'reviewed' | 'applied';
  adaptationSummary?: string;
  adaptedAt?: string;
  targetNextWeek?: number;
  conductedInMeeting?: boolean;
  meetingNotes?: string;
  coachConductedBy?: string;
}

export interface AdaptedExercise extends Exercise {
  changeType?: 'substituted' | 'progressed' | 'deloaded' | 'unchanged' | 'new';
  adaptationReason?: string;
  originalExerciseName?: string;
}

export interface AdaptedWorkoutDay {
  dayNumber: number;
  label: string;
  exercises: AdaptedExercise[];
  focusNotes?: string;
}

export interface ProgramAdaptationResult {
  clientUid: string;
  checkInId?: string;
  previousWeekNumber: number;
  targetWeekNumber: number;
  executiveSummary: string;
  keyChanges: string[];
  coachEncouragement: string;
  adaptedDays: AdaptedWorkoutDay[];
  adaptedAt: string;
}

export interface PersonalRecord {
  id?: string;
  clientId: string;
  exerciseName: string;
  weight: number;  // stored as number (kg)
  reps: string;
  achievedAt: string;  // ISO date
  weekNumber: number;
}

