import { Exercise, WorkoutTemplate, ProgramTemplate, ExerciseLibraryItem } from '../types';
import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, increment } from 'firebase/firestore';

export interface VaultExerciseItem {
  id: string;
  name: string;
  youtubeLink: string;
  sets?: number;
  reps?: string;
  weight?: string;
  rest?: string;
  coachNote?: string;
  block?: string;
  sourceName?: string;
  sourceId?: string;
  sourceType?: 'global_library' | 'custom_sheet' | 'custom_template' | 'curated_program' | 'curated_template';
  isCustom?: boolean;
  usageCount?: number;
}

/**
 * Checks if a URL is a direct video link rather than an empty string or generic search fallback.
 */
export function isDirectVideoLink(url?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (!clean || clean.startsWith('about:blank') || clean === '#' || clean === 'none') return false;
  // If it's a generic YouTube search query without a specific video ID, it's a fallback
  if (clean.includes('youtube.com/results?search_query=') || clean.includes('youtube.com/results?')) {
    return false;
  }
  return clean.includes('youtube.com/') || 
         clean.includes('youtu.be/') || 
         clean.includes('vimeo.com/') || 
         clean.includes('drive.google.com/') || 
         clean.includes('loom.com/') || 
         clean.includes('streamable.com/') ||
         clean.startsWith('http://') || 
         clean.startsWith('https://');
}

/**
 * Normalizes an exercise name for robust comparison and fuzzy matching.
 * E.g. "DB Romanian Deadlift (RDL) - 3x10" -> "romanian deadlift"
 */
export function normalizeExerciseName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')       // Remove text inside parentheses (e.g. "(RDL)")
    .replace(/\[.*?\]/g, ' ')       // Remove text inside brackets
    .replace(/\b(db|bb|dumbbell|barbell|cable|machine|kettlebell|kb|band|banded|smith machine|seated|standing|incline|flat|decline|single leg|bilateral|unilateral)\b/gi, ' ')
    .replace(/[^a-z0-9\s]/gi, ' ')  // Replace special characters with spaces
    .replace(/\s+/g, ' ')           // Collapse consecutive spaces
    .trim();
}

/**
 * Generates a deterministic, URL-safe document ID for an exercise in Firestore.
 */
export function sanitizeExerciseDocId(normalizedName: string): string {
  return (
    normalizedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 100) || `ex_${Date.now()}`
  );
}

/**
 * Extracts and aggregates all exercises from the persistent Global Exercise Library,
 * custom templates, imported spreadsheets, and curated database templates.
 */
export function extractAllVaultExercises(
  templates: (WorkoutTemplate | ProgramTemplate | any)[] = [],
  curatedTemplates: WorkoutTemplate[] = [],
  curatedPrograms: ProgramTemplate[] = [],
  libraryExercises: (ExerciseLibraryItem | any)[] = []
): VaultExerciseItem[] {
  const exerciseMap = new Map<string, VaultExerciseItem>();

  const processExercise = (
    ex: any, 
    sourceName: string, 
    sourceId: string, 
    sourceType: VaultExerciseItem['sourceType'], 
    isCustom: boolean,
    usageCount?: number
  ) => {
    if (!ex || !ex.name || typeof ex.name !== 'string' || !ex.name.trim()) return;

    const trimmedName = ex.name.trim();
    const normalized = normalizeExerciseName(trimmedName);
    if (!normalized) return;

    const currentLink = ex.youtubeLink || ex.link || ex.videoUrl || ex.video || '';
    const hasDirectLink = isDirectVideoLink(currentLink);

    const existing = exerciseMap.get(normalized);

    // Priority ordering:
    // 1. global_library takes precedence over everything
    // 2. Direct video links take precedence over generic/empty links
    // 3. Custom user spreadsheet/template takes precedence over static curated
    const isGlobalLib = sourceType === 'global_library';
    const existingIsGlobal = existing?.sourceType === 'global_library';

    const shouldReplace = 
      !existing || 
      (isGlobalLib && (!existingIsGlobal || hasDirectLink)) ||
      (!existingIsGlobal && !isDirectVideoLink(existing.youtubeLink) && hasDirectLink) ||
      (!existingIsGlobal && isCustom && !existing.isCustom && hasDirectLink);

    if (shouldReplace) {
      exerciseMap.set(normalized, {
        id: isGlobalLib ? (sourceId || sanitizeExerciseDocId(normalized)) : `${sourceId}_${normalized.replace(/\s+/g, '_')}`,
        name: trimmedName,
        youtubeLink: currentLink,
        sets: typeof ex.sets === 'number' ? ex.sets : parseInt(ex.sets) || 3,
        reps: ex.reps || '10-12',
        weight: ex.weight || 'Moderate',
        rest: ex.rest || '60s',
        coachNote: ex.coachNote || ex.cue || ex.notes || '',
        block: ex.block || 'Conditioning',
        sourceName: sourceName || 'Global Exercise Library',
        sourceId,
        sourceType,
        isCustom,
        usageCount: usageCount || ex.usageCount || 0
      });
    }
  };

  // 1. Process persistent Global Exercise Library first (highest authority)
  if (Array.isArray(libraryExercises)) {
    libraryExercises.forEach((item) => {
      const sourceName = item.source ? `Global Library (${item.source})` : 'Global Exercise Library';
      const docId = item.id || sanitizeExerciseDocId(normalizeExerciseName(item.name));
      processExercise(item, sourceName, docId, 'global_library', true, item.usageCount);
    });
  }

  // 2. Process custom templates and synced spreadsheets
  if (Array.isArray(templates)) {
    templates.forEach((t) => {
      const sourceName = t.name || t.sourceSheet || 'Imported Template';
      const sourceId = t.id || 'custom';
      const sourceType = t.isSynced ? 'custom_sheet' : 'custom_template';
      const isCustom = true;

      // Handle multi-day program structures
      if (t.weeks && Array.isArray(t.weeks)) {
        t.weeks.forEach((w: any) => {
          if (w.days && Array.isArray(w.days)) {
            w.days.forEach((d: any) => {
              if (d.exercises && Array.isArray(d.exercises)) {
                d.exercises.forEach((ex: any) => {
                  processExercise(ex, `${sourceName} (${d.label || 'Day'})`, sourceId, sourceType, isCustom);
                });
              }
            });
          }
        });
      }

      // Handle flat exercises array
      if (t.exercises && Array.isArray(t.exercises)) {
        t.exercises.forEach((ex: any) => {
          processExercise(ex, sourceName, sourceId, sourceType, isCustom);
        });
      }
    });
  }

  // 3. Process curated programs
  if (Array.isArray(curatedPrograms)) {
    curatedPrograms.forEach((p) => {
      const sourceName = p.name || 'Curated Program';
      const sourceId = p.id || 'curated_prog';
      if (p.weeks && Array.isArray(p.weeks)) {
        p.weeks.forEach((w: any) => {
          if (w.days && Array.isArray(w.days)) {
            w.days.forEach((d: any) => {
              if (d.exercises && Array.isArray(d.exercises)) {
                d.exercises.forEach((ex: any) => {
                  processExercise(ex, `${sourceName} (${d.label || 'Day'})`, sourceId, 'curated_program', false);
                });
              }
            });
          }
        });
      }
    });
  }

  // 4. Process curated single workout templates
  if (Array.isArray(curatedTemplates)) {
    curatedTemplates.forEach((t) => {
      const sourceName = t.name || 'Curated Classic';
      const sourceId = t.id || 'curated_temp';
      if (t.exercises && Array.isArray(t.exercises)) {
        t.exercises.forEach((ex: any) => {
          processExercise(ex, sourceName, sourceId, 'curated_template', false);
        });
      }
    });
  }

  return Array.from(exerciseMap.values());
}

/**
 * Automatically persists or updates exercises in the Global Exercise Library in Firestore.
 * Automatically called whenever a coach adds or saves exercises in a client workout or program.
 */
export async function saveExercisesToGlobalLibrary(
  exercises: (Exercise | any)[],
  sourceLabel: string = 'Client Program'
): Promise<{ added: number; updated: number }> {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    return { added: 0, updated: 0 };
  }

  let added = 0;
  let updated = 0;

  for (const ex of exercises) {
    if (!ex || !ex.name || typeof ex.name !== 'string' || !ex.name.trim()) continue;
    const trimmedName = ex.name.trim();
    const normalized = normalizeExerciseName(trimmedName);
    if (!normalized) continue;

    const docId = sanitizeExerciseDocId(normalized);
    const docRef = doc(db, 'exerciseLibrary', docId);

    try {
      const snap = await getDoc(docRef);
      const directVideo = isDirectVideoLink(ex.youtubeLink) ? ex.youtubeLink.trim() : '';

      if (snap.exists()) {
        const existingData = snap.data();
        const updatePayload: any = {
          usageCount: increment(1),
          updatedAt: serverTimestamp()
        };

        // If incoming exercise has a direct video link, update it
        if (directVideo && (!isDirectVideoLink(existingData.youtubeLink) || directVideo !== existingData.youtubeLink)) {
          updatePayload.youtubeLink = directVideo;
        }

        // If incoming exercise has a coach cue and existing didn't, or if cue is provided
        if (ex.coachNote && ex.coachNote.trim() && (!existingData.coachNote || ex.coachNote.trim() !== existingData.coachNote)) {
          updatePayload.coachNote = ex.coachNote.trim();
        }

        if (ex.block && !existingData.block) {
          updatePayload.block = ex.block;
        }

        if (ex.sets && !existingData.sets) {
          updatePayload.sets = typeof ex.sets === 'number' ? ex.sets : parseInt(ex.sets as any) || 3;
        }

        if (ex.reps && !existingData.reps) {
          updatePayload.reps = ex.reps;
        }

        await updateDoc(docRef, updatePayload);
        updated++;
      } else {
        const createPayload = {
          name: trimmedName,
          normalizedName: normalized,
          youtubeLink: directVideo || '',
          sets: typeof ex.sets === 'number' ? ex.sets : parseInt(ex.sets as any) || 3,
          reps: ex.reps || '10-12',
          weight: ex.weight || 'Moderate',
          rest: ex.rest || '60s',
          coachNote: ex.coachNote || '',
          block: ex.block || 'Conditioning',
          usageCount: 1,
          source: sourceLabel,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        await setDoc(docRef, createPayload);
        added++;
      }
    } catch (err) {
      console.warn(`[GlobalExerciseLibrary] Error persisting ${trimmedName}:`, err);
    }
  }

  return { added, updated };
}

/**
 * Debounced / real-time single exercise synchronization to Global Exercise Library.
 */
let syncTimeoutMap = new Map<string, any>();
export function syncSingleExerciseToGlobalLibrary(
  exercise: Exercise | { name: string; youtubeLink?: string; coachNote?: string; sets?: number; reps?: string; weight?: string; rest?: string; block?: string },
  sourceLabel: string = 'Client Program'
) {
  if (!exercise || !exercise.name || !exercise.name.trim() || exercise.name.trim().length < 2) return;
  const norm = normalizeExerciseName(exercise.name.trim());
  if (!norm) return;

  if (syncTimeoutMap.has(norm)) {
    clearTimeout(syncTimeoutMap.get(norm));
  }

  const timeoutId = setTimeout(() => {
    saveExercisesToGlobalLibrary([exercise], sourceLabel).catch(() => {});
    syncTimeoutMap.delete(norm);
  }, 1000);

  syncTimeoutMap.set(norm, timeoutId);
}

/**
 * Directly updates an exercise's demo link or cues in the Global Exercise Library.
 */
export async function updateLibraryExerciseLink(
  exerciseName: string,
  youtubeLink: string,
  coachNote?: string
): Promise<void> {
  const normalized = normalizeExerciseName(exerciseName);
  if (!normalized) return;
  const docId = sanitizeExerciseDocId(normalized);
  const docRef = doc(db, 'exerciseLibrary', docId);

  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const payload: any = {
      youtubeLink: youtubeLink.trim(),
      updatedAt: serverTimestamp()
    };
    if (coachNote !== undefined) payload.coachNote = coachNote;
    await updateDoc(docRef, payload);
  } else {
    await setDoc(docRef, {
      name: exerciseName.trim(),
      normalizedName: normalized,
      youtubeLink: youtubeLink.trim(),
      coachNote: coachNote || '',
      sets: 3,
      reps: '10-12',
      weight: 'Moderate',
      rest: '60s',
      block: 'Conditioning',
      usageCount: 1,
      source: 'Master Directory',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
}

/**
 * Removes an exercise from the Global Exercise Library.
 */
export async function deleteExerciseFromGlobalLibrary(docId: string): Promise<void> {
  if (!docId) return;
  await deleteDoc(doc(db, 'exerciseLibrary', docId));
}

/**
 * Searches the Vault for an exercise that matches the given name.
 * Uses exact, normalized, substring, and token intersection matching.
 */
export function findVaultExerciseMatch(
  exerciseName: string,
  vaultExercises: VaultExerciseItem[]
): VaultExerciseItem | null {
  if (!exerciseName || !vaultExercises || vaultExercises.length === 0) return null;

  const rawClean = exerciseName.trim().toLowerCase();
  const normalized = normalizeExerciseName(rawClean);
  if (!normalized) return null;

  // 1. Exact raw match (case-insensitive)
  const exact = vaultExercises.find(v => v.name.trim().toLowerCase() === rawClean);
  if (exact) return exact;

  // 2. Exact normalized match
  const normMatch = vaultExercises.find(v => normalizeExerciseName(v.name) === normalized);
  if (normMatch) return normMatch;

  // 3. Substring match (either input contains vault name or vault name contains input)
  const subMatch = vaultExercises.find(v => {
    const vNorm = normalizeExerciseName(v.name);
    return (vNorm.length >= 4 && normalized.includes(vNorm)) || 
           (normalized.length >= 4 && vNorm.includes(normalized));
  });
  if (subMatch) return subMatch;

  // 4. Word intersection matching (e.g. "Incline Dumbbell Press" vs "Incline DB Press")
  const inputWords = normalized.split(/\s+/).filter(w => w.length > 2);
  if (inputWords.length > 0) {
    let bestMatch: VaultExerciseItem | null = null;
    let maxOverlap = 0;

    for (const v of vaultExercises) {
      const vWords = normalizeExerciseName(v.name).split(/\s+/).filter(w => w.length > 2);
      const overlap = inputWords.filter(w => vWords.includes(w)).length;
      
      // If at least 2 key words overlap or more than 60% of words match
      if (overlap >= 2 && overlap > maxOverlap) {
        maxOverlap = overlap;
        bestMatch = v;
      }
    }

    if (bestMatch && maxOverlap >= Math.min(2, inputWords.length)) {
      return bestMatch;
    }
  }

  return null;
}

/**
 * Enriches a list of workout exercises with video links and coaching cues stored in the Vault.
 * Ensures the coach's imported Excel sheet links are automatically transferred into the client's plan.
 */
export function enrichExercisesWithVault(
  exercises: Exercise[],
  vaultExercises: VaultExerciseItem[]
): { enriched: Exercise[]; matchCount: number } {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    return { enriched: exercises || [], matchCount: 0 };
  }

  let matchCount = 0;

  const enriched = exercises.map(ex => {
    if (!ex.name) return ex;

    const match = findVaultExerciseMatch(ex.name, vaultExercises);
    if (!match) return ex;

    const currentHasDirect = isDirectVideoLink(ex.youtubeLink);
    const vaultHasDirect = isDirectVideoLink(match.youtubeLink);

    let updatedLink = ex.youtubeLink;

    // Use vault's link if current link is empty, generic, or if vault has a custom/library link
    if (!currentHasDirect && vaultHasDirect) {
      updatedLink = match.youtubeLink;
      matchCount++;
    } else if ((match.isCustom || match.sourceType === 'global_library') && vaultHasDirect && (!currentHasDirect || match.youtubeLink !== ex.youtubeLink)) {
      updatedLink = match.youtubeLink;
      matchCount++;
    }

    return {
      ...ex,
      youtubeLink: updatedLink,
      coachNote: ex.coachNote || match.coachNote || '',
      block: ex.block || match.block || 'Conditioning',
      sets: typeof ex.sets === 'number' ? ex.sets : (match.sets || 3),
      reps: ex.reps || match.reps || '10-12',
      weight: ex.weight || match.weight || 'Moderate',
      rest: ex.rest || match.rest || '60s'
    };
  });

  return { enriched, matchCount };
}

/**
 * Enriches an entire Program structure (weeks, days, exercises) with Vault links.
 */
export function enrichProgramWithVault(
  program: any,
  vaultExercises: VaultExerciseItem[]
): { program: any; totalMatches: number } {
  if (!program) return { program, totalMatches: 0 };

  let totalMatches = 0;
  const cloned = JSON.parse(JSON.stringify(program));

  if (cloned.weeks && Array.isArray(cloned.weeks)) {
    cloned.weeks = cloned.weeks.map((w: any) => {
      if (w.days && Array.isArray(w.days)) {
        w.days = w.days.map((d: any) => {
          if (d.exercises && Array.isArray(d.exercises)) {
            const { enriched, matchCount } = enrichExercisesWithVault(d.exercises, vaultExercises);
            totalMatches += matchCount;
            return { ...d, exercises: enriched };
          }
          return d;
        });
      }
      return w;
    });
  }

  if (cloned.exercises && Array.isArray(cloned.exercises)) {
    const { enriched, matchCount } = enrichExercisesWithVault(cloned.exercises, vaultExercises);
    totalMatches += matchCount;
    cloned.exercises = enriched;
  }

  return { program: cloned, totalMatches };
}
