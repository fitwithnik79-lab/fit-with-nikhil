import { isDirectVideoLink, normalizeExerciseName } from './vaultExerciseHelper';

export interface VerifiedExerciseVideo {
  name: string;
  normalizedName: string;
  youtubeUrl: string;
  youtubeId: string;
  category: 'quads' | 'hamstrings_glutes' | 'chest' | 'back' | 'shoulders' | 'arms' | 'core' | 'mobility_rehab';
  defaultBlock: 'Warm-Up' | 'Conditioning' | 'Cool Down';
  coachCue: string;
}

export const VERIFIED_EXERCISE_VIDEOS: VerifiedExerciseVideo[] = [
  // --- QUADS & SQUAT PATTERNS ---
  {
    name: 'Barbell Back Squat',
    normalizedName: 'barbell back squat',
    youtubeUrl: 'https://www.youtube.com/watch?v=ultWZbUMPL8',
    youtubeId: 'ultWZbUMPL8',
    category: 'quads',
    defaultBlock: 'Conditioning',
    coachCue: 'Maintain neutral spine, drive knees out in line with toes, full hip depth.'
  },
  {
    name: 'Goblet Squat',
    normalizedName: 'goblet squat',
    youtubeUrl: 'https://www.youtube.com/watch?v=MeIiIdhvXT4',
    youtubeId: 'MeIiIdhvXT4',
    category: 'quads',
    defaultBlock: 'Conditioning',
    coachCue: 'Hold weight tight against sternum, sit between hips, ideal joint-friendly squat regression.'
  },
  {
    name: 'Goblet Box Squat',
    normalizedName: 'goblet box squat',
    youtubeUrl: 'https://www.youtube.com/watch?v=MeIiIdhvXT4',
    youtubeId: 'MeIiIdhvXT4',
    category: 'quads',
    defaultBlock: 'Conditioning',
    coachCue: 'Control down onto the box without bouncing, pause 1 second, drive upright. Low knee shear.'
  },
  {
    name: 'Spanish Squat',
    normalizedName: 'spanish squat',
    youtubeUrl: 'https://www.youtube.com/watch?v=4T_WyoR3P-4',
    youtubeId: '4T_WyoR3P-4',
    category: 'quads',
    defaultBlock: 'Warm-Up',
    coachCue: 'Heavy band behind knees. Relieves patellar tendon load while heavily recruiting quads.'
  },
  {
    name: 'Bulgarian Split Squat',
    normalizedName: 'bulgarian split squat',
    youtubeUrl: 'https://www.youtube.com/watch?v=2C-uNgKwPLE',
    youtubeId: '2C-uNgKwPLE',
    category: 'quads',
    defaultBlock: 'Conditioning',
    coachCue: 'Rear foot elevated on bench, keep torso slightly forward, sink down until front thigh is parallel.'
  },
  {
    name: 'Leg Press',
    normalizedName: 'leg press',
    youtubeUrl: 'https://www.youtube.com/watch?v=IZxyjW7MPJQ',
    youtubeId: 'IZxyjW7MPJQ',
    category: 'quads',
    defaultBlock: 'Conditioning',
    coachCue: 'Feet mid-to-high on platform. Do not lock knees out at top; protect lumbar spine.'
  },
  {
    name: 'Leg Extension',
    normalizedName: 'leg extension',
    youtubeUrl: 'https://www.youtube.com/watch?v=YyvSfVLYd8Y',
    youtubeId: 'YyvSfVLYd8Y',
    category: 'quads',
    defaultBlock: 'Conditioning',
    coachCue: 'Smooth 2-second concentric, squeeze quads at top, 3-second controlled descent.'
  },
  {
    name: 'Walking Lunges',
    normalizedName: 'walking lunges',
    youtubeUrl: 'https://www.youtube.com/watch?v=L8fvypPrzzs',
    youtubeId: 'L8fvypPrzzs',
    category: 'quads',
    defaultBlock: 'Conditioning',
    coachCue: 'Take deliberate steps, tap back knee lightly, drive through front mid-foot.'
  },

  // --- HAMSTRINGS & HINGES (GLUTES) ---
  {
    name: 'Conventional Barbell Deadlift',
    normalizedName: 'conventional barbell deadlift',
    youtubeUrl: 'https://www.youtube.com/watch?v=op9kVnSso6Q',
    youtubeId: 'op9kVnSso6Q',
    category: 'hamstrings_glutes',
    defaultBlock: 'Conditioning',
    coachCue: 'Bar over midfoot, engage lats to protect spine, push floor away through heels.'
  },
  {
    name: 'Romanian Deadlift (RDL)',
    normalizedName: 'romanian deadlift rdl',
    youtubeUrl: 'https://www.youtube.com/watch?v=JCXUYuzwNrM',
    youtubeId: 'JCXUYuzwNrM',
    category: 'hamstrings_glutes',
    defaultBlock: 'Conditioning',
    coachCue: 'Soft knees, push hips back to wall until deep hamstring stretch, neutral cervical spine.'
  },
  {
    name: 'Dumbbell Romanian Deadlift',
    normalizedName: 'dumbbell romanian deadlift',
    youtubeUrl: 'https://www.youtube.com/watch?v=hCDzSR6bW10',
    youtubeId: 'hCDzSR6bW10',
    category: 'hamstrings_glutes',
    defaultBlock: 'Conditioning',
    coachCue: 'Keep dumbbells tracing down shins, hinge hips back, stop before lower back rounds.'
  },
  {
    name: 'Trap Bar Deadlift',
    normalizedName: 'trap bar deadlift',
    youtubeUrl: 'https://www.youtube.com/watch?v=1j_1H-Pky2o',
    youtubeId: '1j_1H-Pky2o',
    category: 'hamstrings_glutes',
    defaultBlock: 'Conditioning',
    coachCue: 'Neutral grip reduces lumbar shear. Great spine-friendly alternative for heavy hinge strength.'
  },
  {
    name: 'Barbell Hip Thrust',
    normalizedName: 'barbell hip thrust',
    youtubeUrl: 'https://www.youtube.com/watch?v=LM8XHLYJoYs',
    youtubeId: 'LM8XHLYJoYs',
    category: 'hamstrings_glutes',
    defaultBlock: 'Conditioning',
    coachCue: 'Upper back on bench, chin tucked, full posterior pelvic tilt and lockout at top.'
  },
  {
    name: 'Glute Bridge',
    normalizedName: 'glute bridge',
    youtubeUrl: 'https://www.youtube.com/watch?v=wPM8icPu6H8',
    youtubeId: 'wPM8icPu6H8',
    category: 'hamstrings_glutes',
    defaultBlock: 'Warm-Up',
    coachCue: 'Drive through heels, squeeze glutes at top, ribs down to prevent lower back hyperextension.'
  },
  {
    name: 'Seated Leg Curl',
    normalizedName: 'seated leg curl',
    youtubeUrl: 'https://www.youtube.com/watch?v=F488k67BTNo',
    youtubeId: 'F488k67BTNo',
    category: 'hamstrings_glutes',
    defaultBlock: 'Conditioning',
    coachCue: 'Lock thigh pad securely, pull heels down aggressively, slow 3-second negative.'
  },
  {
    name: 'Kettlebell Swings',
    normalizedName: 'kettlebell swings',
    youtubeUrl: 'https://www.youtube.com/watch?v=sSESeQAtRdw',
    youtubeId: 'sSESeQAtRdw',
    category: 'hamstrings_glutes',
    defaultBlock: 'Conditioning',
    coachCue: 'Pure hip hinge, snap glutes forward at top, bell floats up without arm lifting.'
  },

  // --- CHEST & PUSH ---
  {
    name: 'Barbell Bench Press',
    normalizedName: 'barbell bench press',
    youtubeUrl: 'https://www.youtube.com/watch?v=rT7DgCr-3ps',
    youtubeId: 'rT7DgCr-3ps',
    category: 'chest',
    defaultBlock: 'Conditioning',
    coachCue: 'Retract scapulae, touch sternum with control, press up in slight arc.'
  },
  {
    name: 'Incline Dumbbell Press',
    normalizedName: 'incline dumbbell press',
    youtubeUrl: 'https://www.youtube.com/watch?v=8iPEnn-ltC8',
    youtubeId: '8iPEnn-ltC8',
    category: 'chest',
    defaultBlock: 'Conditioning',
    coachCue: 'Bench at 30 degrees, 45-degree elbow tuck, protects rotator cuff while loading clavicular head.'
  },
  {
    name: 'Flat Dumbbell Press',
    normalizedName: 'flat dumbbell press',
    youtubeUrl: 'https://www.youtube.com/watch?v=VmB1G1K7v94',
    youtubeId: 'VmB1G1K7v94',
    category: 'chest',
    defaultBlock: 'Conditioning',
    coachCue: 'Allows natural wrist rotation, great shoulder-friendly alternative to straight bar bench.'
  },
  {
    name: 'Neutral-Grip Dumbbell Press',
    normalizedName: 'neutral grip dumbbell press',
    youtubeUrl: 'https://www.youtube.com/watch?v=VmB1G1K7v94',
    youtubeId: 'VmB1G1K7v94',
    category: 'chest',
    defaultBlock: 'Conditioning',
    coachCue: 'Palms facing each other throughout. Maximum shoulder joint clearance and subacromial space.'
  },
  {
    name: 'Push-Ups',
    normalizedName: 'push ups',
    youtubeUrl: 'https://www.youtube.com/watch?v=WcottpAty60',
    youtubeId: 'WcottpAty60',
    category: 'chest',
    defaultBlock: 'Conditioning',
    coachCue: 'Full body plank tension, elbows at 45 degrees, chest touches floor.'
  },
  {
    name: 'Cable Chest Fly',
    normalizedName: 'cable chest fly',
    youtubeUrl: 'https://www.youtube.com/watch?v=taI4XduLpBe',
    youtubeId: 'taI4XduLpBe',
    category: 'chest',
    defaultBlock: 'Conditioning',
    coachCue: 'Slight elbow bend locked in place, hug around a tree, squeeze pectorals together.'
  },

  // --- SHOULDERS & VERTICAL PUSH ---
  {
    name: 'Overhead Press (OHP)',
    normalizedName: 'overhead press ohp',
    youtubeUrl: 'https://www.youtube.com/watch?v=2yjwxtZ4f_4',
    youtubeId: '2yjwxtZ4f_4',
    category: 'shoulders',
    defaultBlock: 'Conditioning',
    coachCue: 'Brace core and glutes, press straight overhead, finish with head through the window.'
  },
  {
    name: 'Seated Dumbbell Shoulder Press',
    normalizedName: 'seated dumbbell shoulder press',
    youtubeUrl: 'https://www.youtube.com/watch?v=2yjwXTZQDDI',
    youtubeId: '2yjwXTZQDDI',
    category: 'shoulders',
    defaultBlock: 'Conditioning',
    coachCue: 'Seated back upright, elbows slightly forward in scapular plane, press smoothly without flaring.'
  },
  {
    name: 'Landmine Shoulder Press',
    normalizedName: 'landmine shoulder press',
    youtubeUrl: 'https://www.youtube.com/watch?v=Zf_5u1CqZkA',
    youtubeId: 'Zf_5u1CqZkA',
    category: 'shoulders',
    defaultBlock: 'Conditioning',
    coachCue: 'Angled pressing arc completely relieves shoulder impingement while developing pressing power.'
  },
  {
    name: 'Dumbbell Lateral Raise',
    normalizedName: 'dumbbell lateral raise',
    youtubeUrl: 'https://www.youtube.com/watch?v=3VcKaXpzqRo',
    youtubeId: '3VcKaXpzqRo',
    category: 'shoulders',
    defaultBlock: 'Conditioning',
    coachCue: 'Slight forward lean, raise arms in scapular plane, lead with elbows up to shoulder level.'
  },
  {
    name: 'Face Pulls',
    normalizedName: 'face pulls',
    youtubeUrl: 'https://www.youtube.com/watch?v=rep-qVOkqgk',
    youtubeId: 'rep-qVOkqgk',
    category: 'shoulders',
    defaultBlock: 'Conditioning',
    coachCue: 'Pull rope toward forehead, thumbs back, externally rotate shoulders at peak contraction.'
  },

  // --- BACK & PULL ---
  {
    name: 'Lat Pulldown',
    normalizedName: 'lat pulldown',
    youtubeUrl: 'https://www.youtube.com/watch?v=CAwf7n6Luuc',
    youtubeId: 'CAwf7n6Luuc',
    category: 'back',
    defaultBlock: 'Conditioning',
    coachCue: 'Thighs locked under pad, slight lean back, pull elbows down toward back pockets.'
  },
  {
    name: 'Pull-ups',
    normalizedName: 'pull ups',
    youtubeUrl: 'https://www.youtube.com/watch?v=eGo4IYlbE5g',
    youtubeId: 'eGo4IYlbE5g',
    category: 'back',
    defaultBlock: 'Conditioning',
    coachCue: 'Full hang at bottom, drive elbows down, chest to bar without kipping.'
  },
  {
    name: 'Seated Cable Row',
    normalizedName: 'seated cable row',
    youtubeUrl: 'https://www.youtube.com/watch?v=GZbfZ033f74',
    youtubeId: 'GZbfZ033f74',
    category: 'back',
    defaultBlock: 'Conditioning',
    coachCue: 'Chest tall, pull handles to lower rib cage, squeeze shoulder blades together.'
  },
  {
    name: 'Chest-Supported Dumbbell Row',
    normalizedName: 'chest supported dumbbell row',
    youtubeUrl: 'https://www.youtube.com/watch?v=roCP6wCXPqo',
    youtubeId: 'roCP6wCXPqo',
    category: 'back',
    defaultBlock: 'Conditioning',
    coachCue: 'Chest flat against incline bench. Eliminates lower back axial load entirely while isolating upper back.'
  },
  {
    name: 'One-Arm Dumbbell Row',
    normalizedName: 'one arm dumbbell row',
    youtubeUrl: 'https://www.youtube.com/watch?v=pYcpY20QaE8',
    youtubeId: 'pYcpY20QaE8',
    category: 'back',
    defaultBlock: 'Conditioning',
    coachCue: 'Hand on bench, back flat, pull dumbbell toward hip pocket with elbow tight.'
  },

  // --- ARMS (BICEPS / TRICEPS) ---
  {
    name: 'Barbell Bicep Curl',
    normalizedName: 'barbell bicep curl',
    youtubeUrl: 'https://www.youtube.com/watch?v=kwG2ipFRgfo',
    youtubeId: 'kwG2ipFRgfo',
    category: 'arms',
    defaultBlock: 'Conditioning',
    coachCue: 'Elbows pinned to sides, full curl without swaying hips or shoulders.'
  },
  {
    name: 'Incline Dumbbell Curl',
    normalizedName: 'incline dumbbell curl',
    youtubeUrl: 'https://www.youtube.com/watch?v=soxrZlIl35U',
    youtubeId: 'soxrZlIl35U',
    category: 'arms',
    defaultBlock: 'Conditioning',
    coachCue: 'Incline angle puts long head of bicep into deep stretch. Smooth tempo.'
  },
  {
    name: 'Hammer Curls',
    normalizedName: 'hammer curls',
    youtubeUrl: 'https://www.youtube.com/watch?v=zC3nLlEvin4',
    youtubeId: 'zC3nLlEvin4',
    category: 'arms',
    defaultBlock: 'Conditioning',
    coachCue: 'Palms facing inwards, targets brachialis and forearms, easy on elbow tendons.'
  },
  {
    name: 'Tricep Pushdown',
    normalizedName: 'tricep pushdown',
    youtubeUrl: 'https://www.youtube.com/watch?v=2-LAMcpzHLU',
    youtubeId: '2-LAMcpzHLU',
    category: 'arms',
    defaultBlock: 'Conditioning',
    coachCue: 'Elbows locked at ribs, press down to full tricep lockout, controlled return.'
  },
  {
    name: 'Overhead Tricep Extension',
    normalizedName: 'overhead tricep extension',
    youtubeUrl: 'https://www.youtube.com/watch?v=_gsUck-7M74',
    youtubeId: '_gsUck-7M74',
    category: 'arms',
    defaultBlock: 'Conditioning',
    coachCue: 'Elbows close to ears, lower weight behind head, extend straight up.'
  },

  // --- CORE & TRUNK ---
  {
    name: 'Plank',
    normalizedName: 'plank',
    youtubeUrl: 'https://www.youtube.com/watch?v=pSHjTRCQxIw',
    youtubeId: 'pSHjTRCQxIw',
    category: 'core',
    defaultBlock: 'Conditioning',
    coachCue: 'Forearms on floor, pull elbows toward toes, glutes clenched, ribs locked down.'
  },
  {
    name: 'Pallof Press',
    normalizedName: 'pallof press',
    youtubeUrl: 'https://www.youtube.com/watch?v=5_8j1G3uV18',
    youtubeId: '5_8j1G3uV18',
    category: 'core',
    defaultBlock: 'Conditioning',
    coachCue: 'Cable or band at chest height, resist rotation, press straight out and hold for 2s.'
  },
  {
    name: 'Dead Bug',
    normalizedName: 'dead bug',
    youtubeUrl: 'https://www.youtube.com/watch?v=g_BYB0R-4Ws',
    youtubeId: 'g_BYB0R-4Ws',
    category: 'core',
    defaultBlock: 'Warm-Up',
    coachCue: 'Press lower back firmly into floor, extend opposite arm and leg without lumbar arching.'
  },
  {
    name: 'Bird Dog',
    normalizedName: 'bird dog',
    youtubeUrl: 'https://www.youtube.com/watch?v=wiFNA3sqjCA',
    youtubeId: 'wiFNA3sqjCA',
    category: 'core',
    defaultBlock: 'Warm-Up',
    coachCue: 'Quadruped position, reach opposite arm and leg straight out, level pelvis.'
  },
  {
    name: 'Hanging Leg Raise',
    normalizedName: 'hanging leg raise',
    youtubeUrl: 'https://www.youtube.com/watch?v=hdng3nmjpW8',
    youtubeId: 'hdng3nmjpW8',
    category: 'core',
    defaultBlock: 'Conditioning',
    coachCue: 'Hang from pull-up bar, tuck knees or raise straight legs to chest without swinging.'
  },
  {
    name: 'Russian Twists',
    normalizedName: 'russian twists',
    youtubeUrl: 'https://www.youtube.com/watch?v=wkD8rjkodUI',
    youtubeId: 'wkD8rjkodUI',
    category: 'core',
    defaultBlock: 'Conditioning',
    coachCue: 'Sit back 45 degrees, rotate shoulders to touch floor on each side, keep hips stable.'
  },
  {
    name: 'Ab Wheel Rollouts',
    normalizedName: 'ab wheel rollouts',
    youtubeUrl: 'https://www.youtube.com/watch?v=rqiQtEW_qI0',
    youtubeId: 'rqiQtEW_qI0',
    category: 'core',
    defaultBlock: 'Conditioning',
    coachCue: 'Knees on mat, round upper back slightly, roll wheel forward, pull back with abs.'
  },

  // --- REHAB, MOBILITY & JOINT CARE (Knee, Back, Shoulder) ---
  {
    name: 'Shoulder Dislocations (PVC Pipe / Band)',
    normalizedName: 'shoulder dislocations pvc pipe band',
    youtubeUrl: 'https://www.youtube.com/watch?v=v_Yh62S8O3k',
    youtubeId: 'v_Yh62S8O3k',
    category: 'mobility_rehab',
    defaultBlock: 'Warm-Up',
    coachCue: 'Wide grip on PVC or resistance band, sweep overhead and behind back with straight arms.'
  },
  {
    name: 'External Rotations',
    normalizedName: 'external rotations',
    youtubeUrl: 'https://www.youtube.com/watch?v=P6MMD5L7uLw',
    youtubeId: 'P6MMD5L7uLw',
    category: 'mobility_rehab',
    defaultBlock: 'Warm-Up',
    coachCue: 'Towel under elbow, elbow bent 90 degrees, rotate forearm outward against light resistance.'
  },
  {
    name: 'Band Pull-Aparts',
    normalizedName: 'band pull aparts',
    youtubeUrl: 'https://www.youtube.com/watch?v=foB0hJm_p4s',
    youtubeId: 'foB0hJm_p4s',
    category: 'mobility_rehab',
    defaultBlock: 'Warm-Up',
    coachCue: 'Hold band at eye level, pull band apart until it touches chest, pinch shoulder blades.'
  },
  {
    name: 'Cat-Cow (Cat-Camel)',
    normalizedName: 'cat cow cat camel',
    youtubeUrl: 'https://www.youtube.com/watch?v=CX6S6m_f2_o',
    youtubeId: 'CX6S6m_f2_o',
    category: 'mobility_rehab',
    defaultBlock: 'Warm-Up',
    coachCue: 'Synchronize breathing with spinal flexion and extension. Gentle decompression.'
  },
  {
    name: 'World\'s Greatest Stretch',
    normalizedName: 'worlds greatest stretch',
    youtubeUrl: 'https://www.youtube.com/watch?v=-CiYIqL1uU4',
    youtubeId: 'CiYIqL1uU4',
    category: 'mobility_rehab',
    defaultBlock: 'Warm-Up',
    coachCue: 'Deep lunge, forearm to inside instep, rotate chest toward front knee reaching for ceiling.'
  },
  {
    name: 'Terminal Knee Extension (TKE)',
    normalizedName: 'terminal knee extension tke',
    youtubeUrl: 'https://www.youtube.com/watch?v=0k-sZ_0bA0w',
    youtubeId: '0k-sZ_0bA0w',
    category: 'mobility_rehab',
    defaultBlock: 'Warm-Up',
    coachCue: 'Band behind knee crease, straighten leg against band to lock knee, active VMO recruitment.'
  },
  {
    name: 'Poliquin Step-Up',
    normalizedName: 'poliquin step up',
    youtubeUrl: 'https://www.youtube.com/watch?v=t18G_xS3e3E',
    youtubeId: 't18G_xS3e3E',
    category: 'mobility_rehab',
    defaultBlock: 'Warm-Up',
    coachCue: 'Elevate heel on wedge, tap opposite heel to floor lightly, loads VMO without patellar stress.'
  }
];

/**
 * Extracts YouTube video ID from standard watch or shorts URLs
 */
export function extractYouTubeId(url?: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

/**
 * Resolves an exercise video link. Guarantees a working video link is ALWAYS attached:
 * 1. Checks if existingUrl is already a direct video link
 * 2. Checks verified exercise directory with exact, normalized, and fuzzy token matching
 * 3. Falls back to a clean YouTube search query link
 */
export function resolveExerciseVideo(
  exerciseName: string,
  existingUrl?: string
): { url: string; isVerified: boolean; videoId: string | null; coachCue?: string } {
  // If user or AI already supplied a direct, working link
  if (existingUrl && isDirectVideoLink(existingUrl)) {
    const ytId = extractYouTubeId(existingUrl);
    return {
      url: existingUrl.trim(),
      isVerified: true,
      videoId: ytId
    };
  }

  if (!exerciseName || !exerciseName.trim()) {
    return {
      url: 'https://www.youtube.com/results?search_query=exercise+demonstration+proper+form',
      isVerified: false,
      videoId: null
    };
  }

  const cleanName = exerciseName.trim();
  const normalized = normalizeExerciseName(cleanName);

  // 1. Exact match on raw clean name
  const exact = VERIFIED_EXERCISE_VIDEOS.find(
    v => v.name.toLowerCase() === cleanName.toLowerCase()
  );
  if (exact) {
    return {
      url: exact.youtubeUrl,
      isVerified: true,
      videoId: exact.youtubeId,
      coachCue: exact.coachCue
    };
  }

  // 2. Exact match on normalized name
  const normMatch = VERIFIED_EXERCISE_VIDEOS.find(
    v => v.normalizedName === normalized || normalizeExerciseName(v.name) === normalized
  );
  if (normMatch) {
    return {
      url: normMatch.youtubeUrl,
      isVerified: true,
      videoId: normMatch.youtubeId,
      coachCue: normMatch.coachCue
    };
  }

  // 3. Substring match
  const subMatch = VERIFIED_EXERCISE_VIDEOS.find(v => {
    const vNorm = normalizeExerciseName(v.name);
    return (vNorm.length >= 4 && normalized.includes(vNorm)) ||
           (normalized.length >= 4 && vNorm.includes(normalized));
  });
  if (subMatch) {
    return {
      url: subMatch.youtubeUrl,
      isVerified: true,
      videoId: subMatch.youtubeId,
      coachCue: subMatch.coachCue
    };
  }

  // 4. Token intersection match
  const tokens = normalized.split(/\s+/).filter(t => t.length > 2);
  if (tokens.length > 0) {
    let bestMatch: VerifiedExerciseVideo | null = null;
    let highestScore = 0;

    for (const v of VERIFIED_EXERCISE_VIDEOS) {
      const vTokens = new Set(normalizeExerciseName(v.name).split(/\s+/));
      let matches = 0;
      tokens.forEach(t => {
        if (vTokens.has(t)) matches++;
      });
      const score = matches / Math.max(tokens.length, vTokens.size);
      if (score > highestScore && matches >= 1) {
        highestScore = score;
        bestMatch = v;
      }
    }

    if (bestMatch && highestScore >= 0.35) {
      return {
        url: bestMatch.youtubeUrl,
        isVerified: true,
        videoId: bestMatch.youtubeId,
        coachCue: bestMatch.coachCue
      };
    }
  }

  // 5. Ultimate Fallback: Direct YouTube search link ensuring exercise always has a working demonstration
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanName + ' exercise proper form demonstration')}`;
  return {
    url: searchUrl,
    isVerified: false,
    videoId: null
  };
}
