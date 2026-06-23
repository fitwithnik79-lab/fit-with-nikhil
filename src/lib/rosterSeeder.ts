import { db } from './firebase';
import { collection, doc, writeBatch, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { UserProfile, Workout, NutritionPlan, Goal, BodyMetrics } from '../types';

interface DemoClient {
  uid: string;
  displayName: string;
  email: string;
  gender: 'male' | 'female' | 'other';
  height: string;
  weight: string;
  programGoals: string;
  chosenProgram: string;
  programDetails: string;
  streak: number;
}

export const DEMO_CLIENTS: DemoClient[] = [
  {
    uid: "athlete_01_sarah",
    displayName: "Sarah Jenkins",
    email: "sarah.j@fitmail.com",
    gender: "female",
    height: "168 cm",
    weight: "62.4 kg",
    programGoals: "Fat Loss & Aerobic Toning",
    chosenProgram: "4-Week Kettlebell Shred",
    programDetails: "Focusing on rapid lipid oxidation, muscular endurance, and posterior chain stabilization.",
    streak: 8,
  },
  {
    uid: "athlete_02_marcus",
    displayName: "Marcus Vance",
    email: "marcus.vance@powerlift.net",
    gender: "male",
    height: "185 cm",
    weight: "96.2 kg",
    programGoals: "Absolute Strength & Powerlifting Progression",
    chosenProgram: "5-3-1 Linear Compound Block",
    programDetails: "Advanced system targeting lower-body absolute mechanical tension & neurological coordination.",
    streak: 12,
  },
  {
    uid: "athlete_03_chloe",
    displayName: "Chloe Lin",
    email: "chlo_lin@calisthenics.org",
    gender: "female",
    height: "162 cm",
    weight: "51.8 kg",
    programGoals: "Kinetic Balance & Handstand Progression",
    chosenProgram: "Kinetic Flow & Calisthenics Progression",
    programDetails: "Emphasizes absolute straight-arm scapular strength, core compression, and wrist conditioning.",
    streak: 15,
  },
  {
    uid: "athlete_04_david",
    displayName: "David Miller",
    email: "david.miller@corpactive.com",
    gender: "male",
    height: "178 cm",
    weight: "84.1 kg",
    programGoals: "Postural Adjustment & Spinal Decompression",
    chosenProgram: "Functional Longevity & Joint Alignment",
    programDetails: "Rehabilitating thoracic tightness, glute amnesia, and balancing pelvic positioning.",
    streak: 6,
  },
  {
    uid: "athlete_05_elena",
    displayName: "Elena Rostova",
    email: "e.rostova@marathonclub.com",
    gender: "female",
    height: "172 cm",
    weight: "58.9 kg",
    programGoals: "Aerobic Threshold Uplift & VO2 Max Optimization",
    chosenProgram: "Endurance Base & Kinetic Economy",
    programDetails: "Building high-performance mitochondrial density, running posture, and knee stability.",
    streak: 21,
  },
  {
    uid: "athlete_06_jordan",
    displayName: "Jordan Blake",
    email: "jordan.b@musclehq.com",
    gender: "male",
    height: "180 cm",
    weight: "88.5 kg",
    programGoals: "Sarcoplasmic Hypertrophy & Density Block",
    chosenProgram: "Push-Pull-Legs High-Frequency Protocol",
    programDetails: "Optimizing target density per muscle group with high volume loading and drop-sets.",
    streak: 7,
  },
  {
    uid: "athlete_07_hannah",
    displayName: "Hannah Abbott",
    email: "hannah.abbott@brightmoms.org",
    gender: "female",
    height: "165 cm",
    weight: "66.1 kg",
    programGoals: "Core Restoration & Post-Natal Strength",
    chosenProgram: "Pelvic Floor & Core Reset",
    programDetails: "Regaining deep abdominal and glute muscle coordination safely using low-impact movements.",
    streak: 9,
  },
  {
    uid: "athlete_08_tyler",
    displayName: "Tyler Vance",
    email: "tyler.vance@tacticalfit.com",
    gender: "male",
    height: "182 cm",
    weight: "91.8 kg",
    programGoals: "Tactical Response & Power Endurance",
    chosenProgram: "Dynamic Operator Power-HIIT Block",
    programDetails: "Integrating heavy carries, tactical kettlebell conditioning, and high-intensity agility work.",
    streak: 14,
  },
  {
    uid: "athlete_09_isabella",
    displayName: "Isabella Rossi",
    email: "bella.rossi@sportsperf.it",
    gender: "female",
    height: "170 cm",
    weight: "60.3 kg",
    programGoals: "Lateral Power & Change-of-Direction speed",
    chosenProgram: "Athletic Quickness & Plyometric Split",
    programDetails: "Improving ankle stiffness, lateral rebound capacity, and kinetic force redirection.",
    streak: 11,
  },
  {
    uid: "athlete_10_aiden",
    displayName: "Aiden Patel",
    email: "aiden.patel@healthfirst.in",
    gender: "male",
    height: "174 cm",
    weight: "74.5 kg",
    programGoals: "Lean Muscle Retention & Insulin Sensitivity",
    chosenProgram: "Functional Resistance Conditioning",
    programDetails: "A balanced program targeting metabolic conditioning, multi-joint resistance, and clean nutrition.",
    streak: 5,
  },
  {
    uid: "athlete_11_maya",
    displayName: "Maya Al-Farsi",
    email: "maya.alfarsi@yogany.com",
    gender: "female",
    height: "160 cm",
    weight: "53.2 kg",
    programGoals: "Asymmetric Flexibility Balancing & Kinetic Flow",
    chosenProgram: "Core Stabilization & Band Fusion",
    programDetails: "Targeting deep hip-rotators, long-head hamstring endurance, and overhead kinetic stabilization.",
    streak: 19,
  },
  {
    uid: "athlete_12_lucas",
    displayName: "Lucas Dubois",
    email: "lucas.dubois@parisfit.fr",
    gender: "male",
    height: "188 cm",
    weight: "81.0 kg",
    programGoals: "Aesthetic Core Separation & Under-Chest Toning",
    chosenProgram: "4-Week Calorie Deficit Sculpt",
    programDetails: "Using density training loops, high-volume calisthenics accents, and targeted cardiac sessions.",
    streak: 10,
  },
  {
    uid: "athlete_13_zoe",
    displayName: "Zoe Martinez",
    email: "zoe.m@trackstar.edu",
    gender: "female",
    height: "169 cm",
    weight: "56.7 kg",
    programGoals: "Sprint Propulsion & Quad Force Velocity",
    chosenProgram: "Explosive Ground Contact Velocity",
    programDetails: "High-velocity squats, reactive triple extension skips, and hamstring eccentric pull-throughs.",
    streak: 13,
  },
  {
    uid: "athlete_14_ryan",
    displayName: "Ryan Gallagher",
    email: "ryan.gallagher@longevity.au",
    gender: "male",
    height: "176 cm",
    weight: "79.3 kg",
    programGoals: "Joint Integrity & Hip Rotation Extension",
    chosenProgram: "Passive Joint Freedom & Core Balance",
    programDetails: "Low loading knee-over-toes progressions, active hanging, and Jefferson curls targeting lumbar flexibility.",
    streak: 18,
  },
  {
    uid: "athlete_15_ava",
    displayName: "Ava Thompson",
    email: "ava.t@metabolicburn.com",
    gender: "female",
    height: "164 cm",
    weight: "61.0 kg",
    programGoals: "Glycogen Exhaustion Loops & Muscle Tone",
    chosenProgram: "Full-Body Resistance Complex",
    programDetails: "Complexes involving overhead dumbbell swings, walking lunges, and hollow body tabata holds.",
    streak: 7,
  },
  {
    uid: "athlete_16_nico",
    displayName: "Nico Santoro",
    email: "nico.santoro@pumpgym.uk",
    gender: "male",
    height: "181 cm",
    weight: "92.4 kg",
    programGoals: "Target Sarcoplasim Muscle Expansion",
    chosenProgram: "High-Frequency Drop Set Protocol",
    programDetails: "Bicep and shoulder density finishers, tempo bench presses, and quad isolation overload sets.",
    streak: 8,
  },
  {
    uid: "athlete_17_lily",
    displayName: "Lily Kincaid",
    email: "lily.k@danceperform.org",
    gender: "female",
    height: "166 cm",
    weight: "54.0 kg",
    programGoals: "Dynamic Core Coordination & Ankle Stability",
    chosenProgram: "Core Integration & Plyo-Agility",
    programDetails: "Focusing on multi-planar core stability, landing stabilization, and balance plate drills.",
    streak: 16,
  },
  {
    uid: "athlete_18_liam",
    displayName: "Liam O'Connor",
    email: "liam.oconnor@rugbyunion.ie",
    gender: "male",
    height: "183 cm",
    weight: "94.0 kg",
    programGoals: "Neck Force Absorption & Quad Leverage",
    chosenProgram: "Contact Prep & Neck Power Split",
    programDetails: "Upper-back cervical flexion sets, heavy hex bar shrug deadlifts, and multi-directional knee drives.",
    streak: 11,
  },
  {
    uid: "athlete_19_sofia",
    displayName: "Sofia Ruiz",
    email: "sofia.ruiz@pilatescore.es",
    gender: "female",
    height: "163 cm",
    weight: "52.5 kg",
    programGoals: "Trunk Extension Stability & Hip Balancing",
    chosenProgram: "Active Deep Core & Posterior Split",
    programDetails: "Focusing on active deep transverse abdominis compression, bird-dogs with banded resistance, and bodyweight extensions.",
    streak: 14,
  },
  {
    uid: "athlete_20_ethan",
    displayName: "Ethan Hunt",
    email: "ethan.climbs@vertical.net",
    gender: "male",
    height: "177 cm",
    weight: "72.0 kg",
    programGoals: "Scapular Pull Lever Strength & Grip Prep",
    chosenProgram: "Climber Pull Density & Finger Split",
    programDetails: "Towel pull-ups, absolute active hangs, wrist extensions, and isometric lat engagement complexes.",
    streak: 9,
  },
  {
    uid: "athlete_21_noor",
    displayName: "Noor Siddiqui",
    email: "noor.box@rotationalpower.pk",
    gender: "female",
    height: "167 cm",
    weight: "59.2 kg",
    programGoals: "Rotational Core Flex Torque & Foot Speed",
    chosenProgram: "Boxer Rotational Core & Foot Speed",
    programDetails: "Medicine ball wall throws, dynamic cable chops, multi-directional shadow steps, and explosive push-ups.",
    streak: 12,
  }
];

export async function hasRosterSufficientData(coachEmail: string): Promise<boolean> {
  const q = query(collection(db, 'users'), where('role', '==', 'client'));
  const snap = await getDocs(q);
  return snap.size >= 19;
}

export async function seedDemoRosterAndPlans() {
  if (!(import.meta as any).env?.DEV) {
    console.warn("Seeding roster of athletes is disabled outside development environment (import.meta.env.DEV check failed).");
    return;
  }
  const batch = writeBatch(db);

  for (const client of DEMO_CLIENTS) {
    // 1. Create client profile
    const profileRef = doc(db, 'users', client.uid);
    const profile: UserProfile = {
      uid: client.uid,
      email: client.email,
      role: 'client',
      displayName: client.displayName,
      gender: client.gender,
      height: client.height,
      weight: client.weight,
      programGoals: client.programGoals,
      chosenProgram: client.chosenProgram,
      programDetails: client.programDetails,
      onboardingComplete: true,
      streak: client.streak,
      status: 'active',
      createdAt: serverTimestamp(),
    };
    batch.set(profileRef, profile);

    // 2. Create Nutrition Plan
    const nutritionRef = doc(collection(db, 'nutritionPlans'));
    const nutritionPlan: NutritionPlan = {
      clientId: client.uid,
      name: `${client.displayName}'s High-Performance Nutrition Protocol`,
      description: `Targeting specialized macro distribution to feed structural athletic demands during ${client.chosenProgram}.`,
      targetMacros: {
        calories: client.gender === 'male' ? 2600 : 1900,
        protein: client.gender === 'male' ? 180 : 130,
        carbs: client.gender === 'male' ? 270 : 195,
        fats: client.gender === 'male' ? 88 : 65
      },
      guidelines: [
        "Consume 500ml pure water with electrolyte pinch immediately upon waking.",
        "Protein source required in every single active meal window (minimum 30g).",
        "Keep carb intake concentrated around your physical output/training sessions."
      ],
      recommendedFoods: ["Liquid Egg Whites", "Wild Salmon", "Jasmine Rice", "Spinach & Kale", "Organic Avocados"],
      restrictedFoods: ["Refined Seed Oils", "Simple Soda Beverages", "Deep Fried Processed Carbs"],
      isActive: true,
      createdAt: serverTimestamp()
    };
    batch.set(nutritionRef, nutritionPlan);

    // 3. Create a Custom Workout for Week 1 Day 1
    const workoutRef = doc(collection(db, 'workouts'));
    const workout: Workout = {
      clientId: client.uid,
      weekNumber: 1,
      dayNumber: 1,
      exercises: [
        {
          name: "Goblet Squats (Tempo Focus)",
          sets: 3,
          reps: "10-12 reps",
          weight: "Med Dumbbell",
          rest: "60s",
          coachNote: "Slow eccentric descent (3 seconds down), hold 1 second at bottom, push powerfully up.",
          youtubeLink: "https://www.youtube.com/results?search_query=goblet+squat+form"
        },
        {
          name: "Push-ups or DB Incline Press",
          sets: 3,
          reps: "8-12 reps",
          weight: "BW or Light",
          rest: "45s",
          coachNote: "Keep elbows tucked at 45 degrees. Engage your glutes and core to protect your lower back.",
          youtubeLink: "https://www.youtube.com/results?search_query=pushup+form+tutorial"
        },
        {
          name: "Plank Pull-Through",
          sets: 3,
          reps: "16 total",
          weight: "Light Dumbbell",
          rest: "45s",
          coachNote: "Avoid rotating your hips as you pull the weight across your chest. Absolute trunk stabilization.",
          youtubeLink: "https://www.youtube.com/results?search_query=plank+pull+through+exercise"
        }
      ],
      createdAt: serverTimestamp()
    };
    batch.set(workoutRef, workout);

    // 4. Create initial active Goals
    const goalRef = doc(collection(db, 'goals'));
    const goal: Goal = {
      clientId: client.uid,
      title: `Complete ${client.chosenProgram}`,
      status: 'in-progress',
      category: 'consistency',
      notes: "Establish daily habits and hit 100% of the active weekly workout schedules.",
      createdAt: serverTimestamp()
    };
    batch.set(goalRef, goal);

    // 5. Create initial daily metrics for today
    const metricRef = doc(collection(db, 'metrics'));
    const dateToday = new Date().toISOString().split('T')[0];
    const metrics: BodyMetrics = {
      clientId: client.uid,
      date: dateToday,
      waterIntake: client.gender === 'male' ? 3200 : 2200,
      stepCount: 8400 + Math.floor(Math.random() * 2000),
      calories: client.gender === 'male' ? 2450 : 1810,
      createdAt: serverTimestamp()
    };
    batch.set(metricRef, metrics);
  }

  await batch.commit();
}
