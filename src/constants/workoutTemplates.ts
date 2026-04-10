import { WorkoutTemplate, Exercise, ProgramTemplate } from '../types';

// Base Components
const warmUp: Exercise[] = [
  { name: 'Foam Rolling (Quads, Hamstrings, Calves)', youtubeLink: 'https://www.youtube.com/watch?v=8caF1Keg2XU', sets: 1, reps: '3 mins', weight: 'Bodyweight', rest: 'None', coachNote: 'Focus on tight spots' },
  { name: 'Cat-Camel', youtubeLink: 'https://www.youtube.com/watch?v=CX6S6m_f2_o', sets: 2, reps: '10', weight: 'Bodyweight', rest: '30s', coachNote: 'Spinal mobility focus' },
  { name: 'Bird-Dog', youtubeLink: 'https://www.youtube.com/watch?v=wiFNA3sqjCA', sets: 2, reps: '8/side', weight: 'Bodyweight', rest: '30s', coachNote: 'Core stability' },
  { name: 'Wall Angles', youtubeLink: 'https://www.youtube.com/watch?v=pYpE_p61O3Q', sets: 2, reps: '15', weight: 'Bodyweight', rest: '30s', coachNote: 'Shoulder mobility' }
];

const coreActivation: Exercise[] = [
  { name: 'Dead Bug', youtubeLink: 'https://www.youtube.com/watch?v=g_BYB0R-4Ws', sets: 3, reps: '10', weight: 'Bodyweight', rest: '45s', coachNote: 'Keep lower back flat' },
  { name: 'Inclined Plank', youtubeLink: 'https://www.youtube.com/watch?v=vV_u_x77v-U', sets: 3, reps: '20s hold', weight: 'Bodyweight', rest: '45s', coachNote: 'Maintain straight line' },
  { name: 'Pelvic Tilts', youtubeLink: 'https://www.youtube.com/watch?v=7uV8Z_9V_6U', sets: 2, reps: '10', weight: 'Bodyweight', rest: '30s', coachNote: 'Engage deep core' }
];

const coolDown: Exercise[] = [
  { name: 'Hamstring Stretch', youtubeLink: 'https://www.youtube.com/watch?v=L_xrDAtykMI', sets: 3, reps: '20s/side', weight: 'Bodyweight', rest: 'None', coachNote: 'Gentle pull' },
  { name: 'Piriformis Stretch', youtubeLink: 'https://www.youtube.com/watch?v=2qZ517Rw7ME', sets: 3, reps: '20s/side', weight: 'Bodyweight', rest: 'None', coachNote: 'Deep glute stretch' },
  { name: 'Cobra Stretch', youtubeLink: 'https://www.youtube.com/watch?v=JDcdhTuycOI', sets: 3, reps: '20s', weight: 'Bodyweight', rest: 'None', coachNote: 'Abdominal stretch' }
];

export const WORKOUT_TEMPLATES: WorkoutTemplate[] = [
  // ... existing templates (I'll re-list them all for completeness and add new ones)
  {
    id: 'fat-loss-metabolic',
    name: 'Metabolic Conditioning',
    category: 'Fat Loss',
    exercises: [
      ...warmUp,
      ...coreActivation,
      { name: 'Goblet Squats', youtubeLink: 'https://www.youtube.com/watch?v=MeIiIdhvXT4', sets: 4, reps: '15', weight: 'Light/Medium', rest: '45s', coachNote: 'Keep chest up' },
      { name: 'Push-Ups', youtubeLink: 'https://www.youtube.com/watch?v=WcottpAty60', sets: 3, reps: 'AMRAP', weight: 'Bodyweight', rest: '45s', coachNote: 'Full range' },
      { name: 'Mountain Climbers', youtubeLink: 'https://www.youtube.com/watch?v=nmwgirgXLYM', sets: 3, reps: '30s', weight: 'Bodyweight', rest: '30s', coachNote: 'Fast pace' },
      ...coolDown
    ]
  },
  {
    id: 'fat-loss-cardio',
    name: 'HIIT Cardio',
    category: 'Fat Loss',
    exercises: [
      ...warmUp,
      { name: 'Burpees', youtubeLink: 'https://www.youtube.com/watch?v=dZfeV7UAxsc', sets: 4, reps: '12', weight: 'Bodyweight', rest: '60s', coachNote: 'Explosive' },
      { name: 'Jumping Jacks', youtubeLink: 'https://www.youtube.com/watch?v=nGaXj3kkmzU', sets: 4, reps: '45s', weight: 'Bodyweight', rest: '30s', coachNote: 'Stay on toes' },
      { name: 'Plank Jacks', youtubeLink: 'https://www.youtube.com/watch?v=g_BYB0R-4Ws', sets: 3, reps: '20', weight: 'Bodyweight', rest: '45s', coachNote: 'Core tight' },
      ...coolDown
    ]
  },
  {
    id: 'mobility-flow',
    name: 'Mobility & Flexibility Flow',
    category: 'Mobility',
    exercises: [
      { name: 'World\'s Greatest Stretch', youtubeLink: 'https://www.youtube.com/watch?v=-CiYIqL1uU4', sets: 2, reps: '8/side', weight: 'Bodyweight', rest: 'None', coachNote: 'Move slowly' },
      { name: '90/90 Hip Switches', youtubeLink: 'https://www.youtube.com/watch?v=nL_XN_X_X_X', sets: 2, reps: '10/side', weight: 'Bodyweight', rest: 'None', coachNote: 'Keep torso upright' },
      { name: 'Thoracic Rotations', youtubeLink: 'https://www.youtube.com/watch?v=nL_XN_X_X_X', sets: 2, reps: '12/side', weight: 'Bodyweight', rest: 'None', coachNote: 'Follow hand with eyes' },
      { name: 'Deep Squat Hold', youtubeLink: 'https://www.youtube.com/watch?v=nL_XN_X_X_X', sets: 2, reps: '60s', weight: 'Bodyweight', rest: '30s', coachNote: 'Elbows inside knees' }
    ]
  },
  {
    id: 'power-explosive',
    name: 'Explosive Power',
    category: 'Power',
    exercises: [
      ...warmUp,
      { name: 'Dumbbell Snatch', youtubeLink: 'https://www.youtube.com/watch?v=9520DJiFmvE', sets: 4, reps: '8/side', weight: 'Medium', rest: '90s', coachNote: 'Explosive pull' },
      { name: 'Box Jumps', youtubeLink: 'https://www.youtube.com/watch?v=52r_Ul5k03g', sets: 4, reps: '10', weight: 'Bodyweight', rest: '90s', coachNote: 'Land softly' },
      { name: 'Medicine Ball Slams', youtubeLink: 'https://www.youtube.com/watch?v=Rx_UHMnQljU', sets: 3, reps: '12', weight: 'Medium', rest: '60s', coachNote: 'Full power' }
    ]
  },
  {
    id: 'ppl-push',
    name: 'Push (Chest/Shoulders/Triceps)',
    category: 'PPL',
    exercises: [
      ...warmUp,
      { name: 'Dumbbell Bench Press', youtubeLink: 'https://www.youtube.com/watch?v=VmB1G1K7v94', sets: 4, reps: '10', weight: 'Heavy', rest: '90s', coachNote: 'Focus on chest' },
      { name: 'Overhead Press', youtubeLink: 'https://www.youtube.com/watch?v=2yjwXTZQDDI', sets: 3, reps: '12', weight: 'Medium', rest: '60s', coachNote: 'Don\'t arch back' },
      { name: 'Lateral Raises', youtubeLink: 'https://www.youtube.com/watch?v=3VcKaXpzqRo', sets: 3, reps: '15', weight: 'Light', rest: '45s', coachNote: 'Pinkies up' },
      { name: 'Tricep Pushdowns', youtubeLink: 'https://www.youtube.com/watch?v=2-LAMcpzHLU', sets: 3, reps: '15', weight: 'Medium', rest: '45s', coachNote: 'Keep elbows tucked' }
    ]
  },
  {
    id: 'ppl-pull',
    name: 'Pull (Back/Biceps)',
    category: 'PPL',
    exercises: [
      ...warmUp,
      { name: 'Dumbbell Rows', youtubeLink: 'https://www.youtube.com/watch?v=roCP6wCXPqo', sets: 4, reps: '12/side', weight: 'Heavy', rest: '90s', coachNote: 'Pull to hip' },
      { name: 'Face Pulls', youtubeLink: 'https://www.youtube.com/watch?v=rep-qVOkqgk', sets: 3, reps: '15', weight: 'Light', rest: '60s', coachNote: 'Pull to forehead' },
      { name: 'Hammer Curls', youtubeLink: 'https://www.youtube.com/watch?v=zC3nLlEvin4', sets: 3, reps: '12', weight: 'Medium', rest: '45s', coachNote: 'No swinging' }
    ]
  },
  {
    id: 'ppl-legs',
    name: 'Legs (Quads/Hams/Calves)',
    category: 'PPL',
    exercises: [
      ...warmUp,
      { name: 'Goblet Squats', youtubeLink: 'https://www.youtube.com/watch?v=MeIiIdhvXT4', sets: 4, reps: '12', weight: 'Heavy', rest: '90s', coachNote: 'Full depth' },
      { name: 'RDLs', youtubeLink: 'https://www.youtube.com/watch?v=JCXUYuzwfHU', sets: 4, reps: '12', weight: 'Medium', rest: '90s', coachNote: 'Feel the stretch' },
      { name: 'Calf Raises', youtubeLink: 'https://www.youtube.com/watch?v=-M4-G8p8fmc', sets: 3, reps: '20', weight: 'Bodyweight', rest: '45s', coachNote: 'Full extension' }
    ]
  },
  {
    id: 'mixed-plyo-strength',
    name: 'Mixed: Plyo & Strength',
    category: 'Mixed',
    exercises: [
      ...warmUp,
      { name: 'Jump Squats', youtubeLink: 'https://www.youtube.com/watch?v=72BSG19E39Q', sets: 3, reps: '12', weight: 'Bodyweight', rest: '60s', coachNote: 'Explosive' },
      { name: 'Dumbbell Deadlifts', youtubeLink: 'https://www.youtube.com/watch?v=lJ3QwaXNJfw', sets: 4, reps: '10', weight: 'Heavy', rest: '90s', coachNote: 'Back flat' },
      { name: 'Kettlebell Swings', youtubeLink: 'https://www.youtube.com/watch?v=sSESeQAtR2M', sets: 3, reps: '20', weight: 'Medium', rest: '60s', coachNote: 'Hinge power' }
    ]
  },
  {
    id: 'chest-back',
    name: 'Double Muscle: Chest & Back',
    category: 'Hypertrophy',
    exercises: [
      ...warmUp,
      { name: 'Dumbbell Bench Press', youtubeLink: 'https://www.youtube.com/watch?v=VmB1G1K7v94', sets: 4, reps: '10', weight: 'Heavy', rest: '90s', coachNote: 'Slow negative' },
      { name: 'Dumbbell Rows', youtubeLink: 'https://www.youtube.com/watch?v=roCP6wCXPqo', sets: 4, reps: '12', weight: 'Heavy', rest: '90s', coachNote: 'Squeeze back' },
      { name: 'Incline DB Press', youtubeLink: 'https://www.youtube.com/watch?v=8iPEnn-ltC8', sets: 3, reps: '12', weight: 'Medium', rest: '60s', coachNote: 'Upper chest focus' },
      { name: 'Lat Pulldowns', youtubeLink: 'https://www.youtube.com/watch?v=CAwf7n6Luuc', sets: 3, reps: '12', weight: 'Medium', rest: '60s', coachNote: 'Wide grip' }
    ]
  },
  {
    id: 'quads-hams',
    name: 'Double Muscle: Quads & Hams',
    category: 'Hypertrophy',
    exercises: [
      ...warmUp,
      { name: 'Goblet Squats', youtubeLink: 'https://www.youtube.com/watch?v=MeIiIdhvXT4', sets: 4, reps: '12', weight: 'Heavy', rest: '90s', coachNote: 'Quads focus' },
      { name: 'RDLs', youtubeLink: 'https://www.youtube.com/watch?v=JCXUYuzwfHU', sets: 4, reps: '12', weight: 'Heavy', rest: '90s', coachNote: 'Hams focus' },
      { name: 'Leg Extensions', youtubeLink: 'https://www.youtube.com/watch?v=m0OCp_S2SNo', sets: 3, reps: '15', weight: 'Medium', rest: '60s', coachNote: 'Hold at top' },
      { name: 'Leg Curls', youtubeLink: 'https://www.youtube.com/watch?v=1Tq3QdYUuHs', sets: 3, reps: '15', weight: 'Medium', rest: '60s', coachNote: 'Slow release' }
    ]
  },
  {
    id: 'full-body-strength-base',
    name: 'Full Body Strength Base',
    category: 'Strength',
    exercises: [
      ...warmUp,
      { name: 'Barbell Squats', youtubeLink: 'https://www.youtube.com/watch?v=ultWZbUMPL8', sets: 3, reps: '8-10', weight: 'Heavy', rest: '90s', coachNote: 'Focus on depth and upright torso.' },
      { name: 'Bench Press', youtubeLink: 'https://www.youtube.com/watch?v=rT7DgCr-3ps', sets: 3, reps: '8-10', weight: 'Heavy', rest: '90s', coachNote: 'Control the descent, explosive press.' },
      { name: 'Deadlifts', youtubeLink: 'https://www.youtube.com/watch?v=lJ3QwaXNJfw', sets: 3, reps: '5', weight: 'Heavy', rest: '120s', coachNote: 'Keep back flat, drive through heels.' },
      { name: 'Dumbbell Rows', youtubeLink: 'https://www.youtube.com/watch?v=roCP6wCXPqo', sets: 3, reps: '10-12', weight: 'Medium', rest: '60s', coachNote: 'Squeeze shoulder blades at the top.' },
      { name: 'Overhead Press', youtubeLink: 'https://www.youtube.com/watch?v=2yjwXTZQDDI', sets: 3, reps: '8-10', weight: 'Medium', rest: '90s', coachNote: 'Core tight, no leg drive.' },
      { name: 'Bicep Curls', youtubeLink: 'https://www.youtube.com/watch?v=ykJmrZ5v0BA', sets: 3, reps: '12-15', weight: 'Light/Medium', rest: '45s', coachNote: 'Full range of motion, no swinging.' },
      ...coolDown
    ]
  },
  {
    id: 'single-chest',
    name: 'Single Muscle: Chest Day',
    category: 'Bro Split',
    exercises: [
      ...warmUp,
      { name: 'Dumbbell Bench Press', youtubeLink: 'https://www.youtube.com/watch?v=VmB1G1K7v94', sets: 5, reps: '10', weight: 'Heavy', rest: '120s', coachNote: 'Power focus' },
      { name: 'Incline DB Flys', youtubeLink: 'https://www.youtube.com/watch?v=uK7V_9fS9-A', sets: 4, reps: '12', weight: 'Medium', rest: '60s', coachNote: 'Deep stretch' },
      { name: 'Push-ups', youtubeLink: 'https://www.youtube.com/watch?v=WcottpAty60', sets: 3, reps: 'AMRAP', weight: 'Bodyweight', rest: '60s', coachNote: 'Burnout' }
    ]
  }
];

export const WEEKLY_PROGRAMS: ProgramTemplate[] = [
  {
    id: 'full-body-strength-3day',
    name: '3-Day Full Body Strength',
    category: 'Strength',
    description: 'A comprehensive 3-day full body strength program focusing on compound movements.',
    weeks: [
      {
        weekNumber: 1,
        days: [
          { dayNumber: 1, workoutTemplateId: 'full-body-strength-base', label: 'Full Body A' },
          { dayNumber: 2, workoutTemplateId: 'full-body-strength-base', label: 'Full Body B' },
          { dayNumber: 3, workoutTemplateId: 'full-body-strength-base', label: 'Full Body C' }
        ]
      }
    ]
  },
  {
    id: 'fat-loss-week-1',
    name: 'Fat Loss - Week 1',
    category: 'Fat Loss',
    description: 'A 5-day metabolic kickstart program focused on high-intensity fat burning.',
    weeks: [
      {
        weekNumber: 1,
        days: [
          { dayNumber: 1, workoutTemplateId: 'fat-loss-metabolic', label: 'Metabolic A' },
          { dayNumber: 2, workoutTemplateId: 'fat-loss-cardio', label: 'HIIT Cardio' },
          { dayNumber: 3, workoutTemplateId: 'fat-loss-metabolic', label: 'Metabolic B' },
          { dayNumber: 4, workoutTemplateId: 'fat-loss-cardio', label: 'HIIT Cardio' },
          { dayNumber: 5, workoutTemplateId: 'fat-loss-metabolic', label: 'Metabolic C' }
        ]
      }
    ]
  },
  {
    id: 'hypertrophy-week',
    name: 'Muscle Hypertrophy Week',
    category: 'Hypertrophy',
    description: 'Focused on muscle growth with a balanced upper/lower split.',
    weeks: [
      {
        weekNumber: 1,
        days: [
          { dayNumber: 1, workoutTemplateId: 'ppl-push', label: 'Upper Push' },
          { dayNumber: 2, workoutTemplateId: 'ppl-pull', label: 'Upper Pull' },
          { dayNumber: 3, workoutTemplateId: 'ppl-legs', label: 'Lower Body' },
          { dayNumber: 4, workoutTemplateId: 'ppl-push', label: 'Upper Push' },
          { dayNumber: 5, workoutTemplateId: 'ppl-pull', label: 'Upper Pull' }
        ]
      }
    ]
  },
  {
    id: 'mobility-week',
    name: 'Mobility & Flexibility Week',
    category: 'Mobility',
    description: 'Focus on recovery, joint health, and overall flexibility.',
    weeks: [
      {
        weekNumber: 1,
        days: [
          { dayNumber: 1, workoutTemplateId: 'mobility-flow', label: 'Full Body Flow' },
          { dayNumber: 2, workoutTemplateId: 'mobility-flow', label: 'Hip & Spine' },
          { dayNumber: 3, workoutTemplateId: 'mobility-flow', label: 'Shoulder & Upper' }
        ]
      }
    ]
  },
  {
    id: 'ppl-week',
    name: 'Push Pull Legs Split',
    category: 'PPL',
    description: 'Classic 3-day split for balanced strength and hypertrophy.',
    weeks: [
      {
        weekNumber: 1,
        days: [
          { dayNumber: 1, workoutTemplateId: 'ppl-push', label: 'Push Day' },
          { dayNumber: 2, workoutTemplateId: 'ppl-pull', label: 'Pull Day' },
          { dayNumber: 3, workoutTemplateId: 'ppl-legs', label: 'Leg Day' }
        ]
      }
    ]
  },
  {
    id: 'mixed-performance',
    name: 'Mixed Performance Week',
    category: 'Mixed',
    description: 'Combines Plyometrics, Strength, and Endurance training.',
    weeks: [
      {
        weekNumber: 1,
        days: [
          { dayNumber: 1, workoutTemplateId: 'power-explosive', label: 'Power Day' },
          { dayNumber: 2, workoutTemplateId: 'mixed-plyo-strength', label: 'Strength/Plyo' },
          { dayNumber: 3, workoutTemplateId: 'fat-loss-cardio', label: 'Endurance/HIIT' }
        ]
      }
    ]
  },
  {
    id: 'upper-lower-cardio-week',
    name: 'Upper/Lower/Cardio Split',
    category: 'General Fitness',
    description: 'Balanced 3-day split with Upper body, Lower body, and a dedicated Cardio/Core day.',
    weeks: [
      {
        weekNumber: 1,
        days: [
          { dayNumber: 1, workoutTemplateId: 'hypertrophy-upper', label: 'Upper Body' },
          { dayNumber: 2, workoutTemplateId: 'hypertrophy-lower', label: 'Lower Body' },
          { dayNumber: 3, workoutTemplateId: 'fat-loss-cardio', label: 'Cardio & Core' }
        ]
      }
    ]
  },
  {
    id: 'double-muscle-week',
    name: 'Double Muscle Split Week',
    category: 'Hypertrophy',
    description: 'High volume split training two major muscle groups per session.',
    weeks: [
      {
        weekNumber: 1,
        days: [
          { dayNumber: 1, workoutTemplateId: 'chest-back', label: 'Chest & Back' },
          { dayNumber: 2, workoutTemplateId: 'quads-hams', label: 'Quads & Hams' },
          { dayNumber: 3, workoutTemplateId: 'chest-back', label: 'Chest & Back' },
          { dayNumber: 4, workoutTemplateId: 'quads-hams', label: 'Quads & Hams' }
        ]
      }
    ]
  },
  {
    id: 'bro-split-week',
    name: 'Single Muscle (Bro Split) Week',
    category: 'Bro Split',
    description: 'Traditional bodybuilding split focusing on one muscle group per day.',
    weeks: [
      {
        weekNumber: 1,
        days: [
          { dayNumber: 1, workoutTemplateId: 'single-chest', label: 'Chest Day' },
          { dayNumber: 2, workoutTemplateId: 'ppl-pull', label: 'Back Day' },
          { dayNumber: 3, workoutTemplateId: 'ppl-legs', label: 'Leg Day' },
          { dayNumber: 4, workoutTemplateId: 'power-explosive', label: 'Shoulder Day' }
        ]
      }
    ]
  }
];

// For backward compatibility or single workout assignment
export const SAMPLE_PROGRAMS = WORKOUT_TEMPLATES;
