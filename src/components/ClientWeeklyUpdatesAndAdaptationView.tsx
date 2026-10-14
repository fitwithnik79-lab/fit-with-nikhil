import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { 
  Sparkles, 
  CheckCircle, 
  AlertTriangle, 
  Calendar, 
  Dumbbell, 
  ArrowRight, 
  Loader2, 
  RefreshCw, 
  Edit3, 
  Check, 
  Trash2, 
  ExternalLink, 
  Plus, 
  Play, 
  Flame, 
  Zap, 
  X,
  MessageSquare,
  ShieldCheck,
  ChevronRight,
  Info,
  Video,
  FileText,
  UserCheck,
  Star,
  Search,
  CheckCircle2
} from 'lucide-react';
import { collection, addDoc, updateDoc, doc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, Workout, WeeklyCheckIn, AdaptedWorkoutDay, ProgramAdaptationResult, Exercise } from '../types';
import { adaptProgramWithAI } from '../lib/gemini';
import { saveExercisesToGlobalLibrary, extractAllVaultExercises } from '../lib/vaultExerciseHelper';
import { triggerPushNotification, sendInAppNotification } from '../lib/notifications';
import { 
  VERIFIED_EXERCISE_VIDEOS, 
  resolveExerciseVideo, 
  extractYouTubeId, 
  VerifiedExerciseVideo 
} from '../lib/verifiedExerciseVideos';
import { cn } from '../lib/utils';
import { format, addDays, startOfWeek } from 'date-fns';

function getYouTubeId(url?: string): string | null {
  return extractYouTubeId(url);
}

interface ClientWeeklyUpdatesAndAdaptationViewProps {
  client: UserProfile;
  weeklyCheckIns: WeeklyCheckIn[];
  workouts: Workout[];
  currentUser: { uid: string; displayName?: string };
  showToast: (msg: string, type?: 'success' | 'error') => void;
  confirmAction: (title: string, message: string, onConfirm: () => void) => void;
}

export function ClientWeeklyUpdatesAndAdaptationView({
  client,
  weeklyCheckIns,
  workouts,
  currentUser,
  showToast,
  confirmAction
}: ClientWeeklyUpdatesAndAdaptationViewProps) {
  // Filter check-ins for this athlete
  const clientCheckIns = useMemo(() => {
    return weeklyCheckIns
      .filter(c => c.uid === client.uid)
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }, [weeklyCheckIns, client.uid]);

  const [selectedCheckIn, setSelectedCheckIn] = useState<WeeklyCheckIn | null>(() => {
    return clientCheckIns.length > 0 ? clientCheckIns[0] : null;
  });

  // Keep selectedCheckIn in sync if list updates
  useEffect(() => {
    if (!selectedCheckIn && clientCheckIns.length > 0) {
      setSelectedCheckIn(clientCheckIns[0]);
    }
  }, [clientCheckIns, selectedCheckIn]);

  // Determine current maximum week number for this client
  const maxExistingWeek = useMemo(() => {
    const clientWorkouts = workouts.filter(w => w.clientId === client.uid);
    if (clientWorkouts.length === 0) return 1;
    return Math.max(...clientWorkouts.map(w => w.weekNumber || 1));
  }, [workouts, client.uid]);

  // Adaptation target week state
  const [previousWeekNumber, setPreviousWeekNumber] = useState<number>(() => maxExistingWeek);
  const [targetWeekNumber, setTargetWeekNumber] = useState<number>(() => maxExistingWeek + 1);

  // When maxExistingWeek changes, sync
  useEffect(() => {
    setPreviousWeekNumber(maxExistingWeek);
    setTargetWeekNumber(maxExistingWeek + 1);
  }, [maxExistingWeek]);

  // Workouts of previous week
  const previousWeekWorkouts = useMemo(() => {
    return workouts
      .filter(w => w.clientId === client.uid && w.weekNumber === previousWeekNumber)
      .sort((a, b) => (a.dayNumber || 1) - (b.dayNumber || 1));
  }, [workouts, client.uid, previousWeekNumber]);

  // AI Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [adaptationResult, setAdaptationResult] = useState<ProgramAdaptationResult | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [activePreviewDay, setActivePreviewDay] = useState<number>(1);

  // In-app Video Player Modal State
  const [activeVideoModal, setActiveVideoModal] = useState<{ url: string; title: string; cue?: string } | null>(null);

  // Video Selector Modal State
  const [videoSelectorTarget, setVideoSelectorTarget] = useState<{ dayIdx: number; exIdx: number; currentUrl?: string; name: string } | null>(null);
  const [videoSearchQuery, setVideoSearchQuery] = useState('');
  const [customVideoUrlInput, setCustomVideoUrlInput] = useState('');

  // Weekly Meeting & Check-In Modal State
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [isSavingMeeting, setIsSavingMeeting] = useState(false);

  // Meeting Form Fields
  const [meetingWeekOf, setMeetingWeekOf] = useState(() => format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [meetingProgramRating, setMeetingProgramRating] = useState<number>(5);
  const [meetingEnergyLevel, setMeetingEnergyLevel] = useState<number>(8);
  const [meetingSleepRating, setMeetingSleepRating] = useState<number>(4);
  const [meetingDietAdherence, setMeetingDietAdherence] = useState<'yes' | 'partial' | 'no'>('yes');
  const [meetingPainAreas, setMeetingPainAreas] = useState<string[]>([]);
  const [meetingPainReduction, setMeetingPainReduction] = useState<'better' | 'same' | 'worse'>('better');
  const [meetingExercisesTooHard, setMeetingExercisesTooHard] = useState('');
  const [meetingExercisesTooEasy, setMeetingExercisesTooEasy] = useState('');
  const [meetingEquipmentConstraints, setMeetingEquipmentConstraints] = useState<'full_gym' | 'dumbbells' | 'bodyweight_travel' | 'custom'>('full_gym');
  const [meetingNotes, setMeetingNotes] = useState('');
  const [meetingClientMessage, setMeetingClientMessage] = useState('');

  const toggleMeetingPainArea = (area: string) => {
    if (area === 'none') {
      setMeetingPainAreas(['none']);
      return;
    }
    const filtered = meetingPainAreas.filter(a => a !== 'none');
    if (filtered.includes(area)) {
      setMeetingPainAreas(filtered.filter(a => a !== area));
    } else {
      setMeetingPainAreas([...filtered, area]);
    }
  };

  // Save Weekly Meeting Check-In
  const handleSaveMeetingCheckIn = async (thenGenerateAI: boolean = false) => {
    setIsSavingMeeting(true);
    try {
      const clientType = client.clientType || 'fitness';
      const cleanPainAreas = meetingPainAreas.filter(a => a !== 'none');

      const payload: any = {
        uid: client.uid,
        clientType: ['fitness', 'knee_injury', 'back_injury', 'shoulder_injury'].includes(clientType) 
          ? clientType 
          : 'fitness',
        weekOf: meetingWeekOf,
        submittedAt: new Date().toISOString(),
        programRating: meetingProgramRating,
        energyLevel: meetingEnergyLevel,
        sleepRating: meetingSleepRating,
        dietAdherence: meetingDietAdherence,
        painAreas: cleanPainAreas,
        painReduction: meetingPainReduction,
        exercisesTooHard: meetingExercisesTooHard.trim() ? [meetingExercisesTooHard.trim()] : [],
        exercisesTooEasy: meetingExercisesTooEasy.trim() ? [meetingExercisesTooEasy.trim()] : [],
        equipmentConstraints: meetingEquipmentConstraints === 'full_gym' ? 'Full standard gym' :
                             meetingEquipmentConstraints === 'dumbbells' ? 'Dumbbells and bench only' :
                             meetingEquipmentConstraints === 'bodyweight_travel' ? 'Bodyweight & hotel travel' : 'Custom constraints',
        exerciseFeedbackNotes: meetingNotes.trim() || undefined,
        freeText: meetingClientMessage.trim() || undefined,
        aiAdaptedStatus: 'pending',
        conductedInMeeting: true,
        meetingNotes: meetingNotes.trim() || `Weekly review meeting conducted on ${format(new Date(), 'MMM d, yyyy')}`,
        coachConductedBy: currentUser.uid,
        workoutPattern: 'interesting'
      };

      const docRef = await addDoc(collection(db, 'weeklyCheckIns'), payload);
      const newCheckIn: WeeklyCheckIn = {
        id: docRef.id,
        ...payload
      };

      setSelectedCheckIn(newCheckIn);
      setShowMeetingModal(false);
      showToast(`Weekly Meeting Check-In recorded for ${client.displayName || 'athlete'}!`, 'success');

      // If requested, immediately launch AI workout generation with video links attached
      if (thenGenerateAI) {
        await executeAIAdaptation(newCheckIn);
      }
    } catch (err: any) {
      console.error('Failed to save meeting check-in:', err);
      showToast(err.message || 'Failed to save meeting check-in', 'error');
    } finally {
      setIsSavingMeeting(false);
    }
  };

  // Trigger AI adaptation logic
  const executeAIAdaptation = async (checkInToUse: WeeklyCheckIn) => {
    setIsGenerating(true);
    setGenerationStep('Analyzing joint discomfort flags & recovery report...');

    try {
      setTimeout(() => setGenerationStep('Evaluating previous exercise loads, volume & tempo...'), 600);
      setTimeout(() => setGenerationStep('Selecting joint-friendly exercises & attaching verified demonstration video links...'), 1400);

      const result = await adaptProgramWithAI({
        clientProfile: client,
        weeklyCheckIn: checkInToUse,
        previousWeekNumber,
        targetWeekNumber,
        previousWeekWorkouts,
        globalLibraryExercises: VERIFIED_EXERCISE_VIDEOS
      });

      if (!result || !result.adaptedDays || result.adaptedDays.length === 0) {
        throw new Error('AI could not produce a valid adapted program split.');
      }

      // Guarantee video links on all exercises
      if (result.adaptedDays) {
        result.adaptedDays.forEach((day: any) => {
          if (Array.isArray(day.exercises)) {
            day.exercises.forEach((ex: any) => {
              const res = resolveExerciseVideo(ex.name, ex.youtubeLink);
              ex.youtubeLink = res.url;
              if (res.coachCue && (!ex.coachNote || ex.coachNote.length < 5)) {
                ex.coachNote = res.coachCue;
              }
            });
          }
        });
      }

      setAdaptationResult(result);
      setActivePreviewDay(result.adaptedDays[0]?.dayNumber || 1);
      showToast(`AI successfully tailored Week ${targetWeekNumber} Routine with Video Demos attached!`, 'success');
    } catch (err: any) {
      console.error('Failed to adapt program with AI:', err);
      showToast(err.message || 'Failed to adapt program with AI', 'error');
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  const handleGenerateAdaptation = async () => {
    if (!selectedCheckIn && clientCheckIns.length === 0) {
      setShowMeetingModal(true);
      showToast('No check-in found yet. Record your weekly meeting notes first to generate the workout plan.', 'error');
      return;
    }

    const checkInToUse = selectedCheckIn || clientCheckIns[0];
    await executeAIAdaptation(checkInToUse);
  };

  // Modify exercise inside preview
  const handleUpdateAdaptedExercise = (dayIdx: number, exIdx: number, updatedFields: Partial<Exercise>) => {
    if (!adaptationResult) return;
    const updatedDays = [...adaptationResult.adaptedDays];
    const targetDay = { ...updatedDays[dayIdx] };
    const updatedExercises = [...targetDay.exercises];
    updatedExercises[exIdx] = { ...updatedExercises[exIdx], ...updatedFields };
    targetDay.exercises = updatedExercises;
    updatedDays[dayIdx] = targetDay;

    setAdaptationResult({
      ...adaptationResult,
      adaptedDays: updatedDays
    });
  };

  // Add new exercise to day in preview
  const handleAddExerciseToDay = (dayIdx: number) => {
    if (!adaptationResult) return;
    const updatedDays = [...adaptationResult.adaptedDays];
    const targetDay = { ...updatedDays[dayIdx] };
    const defaultVerified = VERIFIED_EXERCISE_VIDEOS[0];
    const newEx = {
      name: 'Custom Exercise',
      block: 'Conditioning' as const,
      sets: 3,
      reps: '10-12 reps',
      weight: 'Moderate',
      rest: '60s',
      coachNote: 'Focus on clean technique and controlled eccentric.',
      youtubeLink: defaultVerified?.youtubeUrl || '',
      changeType: 'new' as const,
      adaptationReason: 'Added by Coach Nik'
    };
    targetDay.exercises = [...targetDay.exercises, newEx];
    updatedDays[dayIdx] = targetDay;
    setAdaptationResult({
      ...adaptationResult,
      adaptedDays: updatedDays
    });
  };

  // Remove exercise from day in preview
  const handleRemoveExerciseFromDay = (dayIdx: number, exIdx: number) => {
    if (!adaptationResult) return;
    const updatedDays = [...adaptationResult.adaptedDays];
    const targetDay = { ...updatedDays[dayIdx] };
    targetDay.exercises = targetDay.exercises.filter((_, idx) => idx !== exIdx);
    updatedDays[dayIdx] = targetDay;
    setAdaptationResult({
      ...adaptationResult,
      adaptedDays: updatedDays
    });
  };

  // Deploy adapted program to client's workouts
  const handleDeployProgram = async () => {
    if (!adaptationResult || !adaptationResult.adaptedDays) return;

    confirmAction(
      `Deploy Week ${targetWeekNumber} Routine`,
      `This will create ${adaptationResult.adaptedDays.length} custom training days for ${client.displayName || 'this athlete'} in Week ${targetWeekNumber}, calibrated directly from their weekly update with video links attached to every exercise. Proceed?`,
      async () => {
        setIsDeploying(true);
        try {
          const mondayDate = startOfWeek(addDays(new Date(), 7), { weekStartsOn: 1 });
          const allNewExercises: Exercise[] = [];

          for (let i = 0; i < adaptationResult.adaptedDays.length; i++) {
            const day = adaptationResult.adaptedDays[i];
            const scheduledDateStr = format(addDays(mondayDate, i * 2), 'yyyy-MM-dd');

            const exercisesToSave = day.exercises.map(e => {
              const videoRes = resolveExerciseVideo(e.name, e.youtubeLink);
              return {
                name: e.name,
                block: e.block || 'Conditioning',
                sets: Number(e.sets) || 3,
                reps: String(e.reps || '10 reps'),
                weight: String(e.weight || 'BW'),
                rest: String(e.rest || '60s'),
                coachNote: e.coachNote || videoRes.coachCue || '',
                youtubeLink: videoRes.url,
                isCompleted: false
              };
            });

            allNewExercises.push(...exercisesToSave);

            await addDoc(collection(db, 'workouts'), {
              clientId: client.uid,
              weekNumber: targetWeekNumber,
              dayNumber: day.dayNumber || (i + 1),
              title: day.label || `Week ${targetWeekNumber} Day ${i + 1}`,
              exercises: exercisesToSave,
              scheduledDate: scheduledDateStr,
              notes: day.focusNotes || adaptationResult.executiveSummary || '',
              createdAt: serverTimestamp()
            });
          }

          // Upsert exercises into global library
          if (allNewExercises.length > 0) {
            saveExercisesToGlobalLibrary(
              allNewExercises,
              `AI Adapted - ${client.displayName || 'Athlete'} Week ${targetWeekNumber}`
            );
          }

          // Update check-in document status
          const checkInToUpdate = selectedCheckIn || clientCheckIns[0];
          if (checkInToUpdate?.id) {
            await updateDoc(doc(db, 'weeklyCheckIns', checkInToUpdate.id), {
              aiAdaptedStatus: 'applied',
              targetNextWeek: targetWeekNumber,
              adaptationSummary: adaptationResult.executiveSummary,
              adaptedAt: new Date().toISOString()
            });
          }

          // Send in-app notification & chat message to athlete
          const notificationMessage = `Coach Nik has customized your Week ${targetWeekNumber} workout plan with video demonstrations attached to every exercise! Check out your updated program.`;
          
          await sendInAppNotification(
            client.uid,
            `✨ Week ${targetWeekNumber} Routine Ready!`,
            notificationMessage,
            'workout'
          );

          await triggerPushNotification(
            client.uid,
            `✨ Week ${targetWeekNumber} Routine Ready!`,
            notificationMessage,
            { type: 'workout', weekNumber: targetWeekNumber }
          );

          await addDoc(collection(db, 'messages'), {
            senderId: currentUser.uid,
            receiverId: client.uid,
            participants: [currentUser.uid, client.uid],
            text: `🎯 Great news! Following our weekly check-in, I customized your Week ${targetWeekNumber} workout plan! Every exercise now includes a video link demonstrating exact form.\n\nSummary:\n${adaptationResult.executiveSummary}\n\nLet's get after it! 💪🔥`,
            isRead: false,
            type: 'motivation',
            createdAt: serverTimestamp()
          });

          // Celebration confetti
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
          });

          showToast(`Week ${targetWeekNumber} routine deployed with video links attached!`, 'success');
          setAdaptationResult(null);
        } catch (err: any) {
          console.error('Error deploying adapted program:', err);
          showToast(err.message || 'Failed to deploy program.', 'error');
        } finally {
          setIsDeploying(false);
        }
      }
    );
  };

  // Filter verified videos for selector modal
  const filteredVerifiedVideos = useMemo(() => {
    if (!videoSearchQuery.trim()) return VERIFIED_EXERCISE_VIDEOS;
    const q = videoSearchQuery.toLowerCase();
    return VERIFIED_EXERCISE_VIDEOS.filter(
      v => v.name.toLowerCase().includes(q) || v.category.toLowerCase().includes(q) || v.coachCue.toLowerCase().includes(q)
    );
  }, [videoSearchQuery]);

  return (
    <div className="space-y-8">
      {/* Top Banner & Context */}
      <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-[32px] p-6 md:p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Sparkles className="w-48 h-48 text-orange-500" />
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="px-3 py-1 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-black uppercase tracking-wider rounded-full">
                Weekly Meeting & AI Customizer
              </span>
              <span className="text-zinc-500 text-xs font-bold uppercase tracking-wider">
                {client.displayName || 'Athlete'} • {client.clientType || 'Fitness'}
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white flex items-center gap-3">
              Weekly Meeting Check-In & Workout Generator
            </h2>
            <p className="text-zinc-400 text-xs md:text-sm max-w-2xl leading-relaxed">
              Conduct weekly sync meetings with your athlete, log joint comfort and performance updates, and allow AI to generate their customized next-week workout routine with video demonstrations attached to every exercise.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowMeetingModal(true)}
              className="px-5 py-3.5 bg-zinc-900 hover:bg-zinc-850 text-white border border-zinc-700 hover:border-orange-500/50 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2.5 transition-all shadow-lg hover:scale-105 active:scale-95"
            >
              <Video className="w-4 h-4 text-orange-400" />
              Conduct Weekly Meeting Check-In
            </button>

            <button
              onClick={handleGenerateAdaptation}
              disabled={isGenerating || (clientCheckIns.length === 0 && !selectedCheckIn)}
              className="px-6 py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-orange-500/20 flex items-center gap-2.5 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isGenerating ? 'Generating Routines...' : `Generate Week ${targetWeekNumber} Routine`}
            </button>
          </div>
        </div>

        {isGenerating && (
          <div className="mt-6 pt-6 border-t border-zinc-800 flex items-center gap-3 text-orange-400 text-xs font-bold animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span>{generationStep || 'Analyzing weekly performance metrics and attaching video links...'}</span>
          </div>
        )}
      </div>

      {/* Main Grid: Check-in Selector vs AI Adaptation Result */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Weekly Updates History & Detail (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-orange-500" />
              Weekly Check-Ins & Meetings ({clientCheckIns.length})
            </h3>
            <button
              onClick={() => setShowMeetingModal(true)}
              className="text-[10px] font-bold text-orange-400 hover:text-orange-300 uppercase tracking-wider flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              New Meeting Record
            </button>
          </div>

          {clientCheckIns.length === 0 ? (
            <div className="p-8 bg-zinc-950 border border-zinc-900 rounded-3xl text-center space-y-4">
              <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center mx-auto text-zinc-600">
                <Video className="w-6 h-6 text-orange-500/60" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">No Weekly Check-Ins Yet</p>
                <p className="text-[11px] text-zinc-500 leading-relaxed max-w-xs mx-auto">
                  Click below to record your weekly meeting check-in with {client.displayName || 'this athlete'} and immediately generate their next-week workout routine!
                </p>
              </div>
              <button
                onClick={() => setShowMeetingModal(true)}
                className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
              >
                Log Weekly Meeting Now
              </button>
            </div>
          ) : (
            <div className="space-y-3 max-h-[680px] overflow-y-auto pr-1 custom-scrollbar">
              {clientCheckIns.map((ci) => {
                const isSelected = selectedCheckIn?.id === ci.id;
                const dateStr = ci.submittedAt ? format(new Date(ci.submittedAt), 'MMM d, yyyy') : 'Unknown';
                const hasPain = ci.painAreas && ci.painAreas.length > 0 && !ci.painAreas.includes('none');
                const isAdapted = ci.aiAdaptedStatus === 'applied';
                const isMeeting = !!ci.conductedInMeeting;

                return (
                  <div
                    key={ci.id || ci.submittedAt}
                    onClick={() => setSelectedCheckIn(ci)}
                    className={cn(
                      "p-5 rounded-3xl border transition-all cursor-pointer space-y-3.5 relative",
                      isSelected
                        ? "bg-zinc-900 border-orange-500/40 shadow-xl shadow-orange-500/5 ring-1 ring-orange-500/20"
                        : "bg-zinc-950/80 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/40"
                    )}
                  >
                    {/* Header info */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-white uppercase tracking-wider">
                          Week of {ci.weekOf || dateStr}
                        </span>
                        {isMeeting ? (
                          <span className="px-2 py-0.5 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-md text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                            <Video className="w-2.5 h-2.5" />
                            Meeting
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded-md text-[9px] font-bold uppercase">
                            Athlete Portal
                          </span>
                        )}
                      </div>
                      <span className={cn(
                        "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                        isAdapted 
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                          : "bg-orange-500/10 border-orange-500/30 text-orange-400"
                      )}>
                        {isAdapted ? 'Routine Ready' : 'Pending AI'}
                      </span>
                    </div>

                    {/* Quick Stats: Program Rating, Energy, Sleep */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-zinc-950 p-2 rounded-xl border border-zinc-850">
                        <span className="text-[9px] font-bold text-zinc-500 uppercase block">Rating</span>
                        <span className="text-xs font-black text-white">{ci.programRating || 5} / 5 ★</span>
                      </div>
                      <div className="bg-zinc-950 p-2 rounded-xl border border-zinc-850">
                        <span className="text-[9px] font-bold text-zinc-500 uppercase block">Energy</span>
                        <span className="text-xs font-black text-orange-400">{ci.energyLevel || 8}/10</span>
                      </div>
                      <div className="bg-zinc-950 p-2 rounded-xl border border-zinc-850">
                        <span className="text-[9px] font-bold text-zinc-500 uppercase block">Diet</span>
                        <span className="text-xs font-black text-emerald-400 capitalize">{ci.dietAdherence || 'yes'}</span>
                      </div>
                    </div>

                    {/* Joint Pain Badges */}
                    {hasPain ? (
                      <div className="space-y-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-red-400 block">
                          ⚠️ Joint Discomfort Areas:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {ci.painAreas!.map(area => (
                            <span key={area} className="px-2 py-0.5 bg-red-500/15 border border-red-500/30 text-red-300 rounded-lg text-[10px] font-bold capitalize">
                              {area.replace('_', ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Pain-free / Zero joint issues reported</span>
                      </div>
                    )}

                    {/* Meeting Notes */}
                    {ci.meetingNotes && (
                      <div className="p-3 bg-zinc-950 rounded-2xl border border-zinc-850 text-xs text-zinc-300 space-y-1">
                        <span className="text-[9px] font-black uppercase tracking-wider text-purple-400 flex items-center gap-1">
                          <FileText className="w-3 h-3" /> Coach Meeting Notes:
                        </span>
                        <p className="italic text-zinc-300">{ci.meetingNotes}</p>
                      </div>
                    )}

                    {/* Exercise Notes */}
                    {ci.exerciseFeedbackNotes && !ci.meetingNotes && (
                      <div className="p-3 bg-zinc-950 rounded-2xl border border-zinc-850 text-xs text-zinc-300 space-y-1">
                        <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500 block">
                          Exercise Feedback:
                        </span>
                        <p className="italic text-zinc-400">"{ci.exerciseFeedbackNotes}"</p>
                      </div>
                    )}

                    {/* Progress & Stalled highlights */}
                    {(ci.exercisesTooEasy?.length || ci.exercisesTooHard?.length) ? (
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        {ci.exercisesTooEasy && ci.exercisesTooEasy.length > 0 && (
                          <div className="p-2 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-emerald-400">
                            <span className="font-bold block uppercase tracking-wider">Ready to Progress:</span>
                            <span>{Array.isArray(ci.exercisesTooEasy) ? ci.exercisesTooEasy.join(', ') : ci.exercisesTooEasy}</span>
                          </div>
                        )}
                        {ci.exercisesTooHard && ci.exercisesTooHard.length > 0 && (
                          <div className="p-2 bg-amber-500/5 border border-amber-500/20 rounded-xl text-amber-400">
                            <span className="font-bold block uppercase tracking-wider">Deload / Stalled:</span>
                            <span>{Array.isArray(ci.exercisesTooHard) ? ci.exercisesTooHard.join(', ') : ci.exercisesTooHard}</span>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {/* Equipment Constraints */}
                    {ci.equipmentConstraints && (
                      <div className="text-[10px] text-zinc-500 flex items-center gap-1.5">
                        <span className="font-bold text-zinc-400">Equipment:</span>
                        <span>{ci.equipmentConstraints}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: AI Adaptation Studio (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Target Week Controls */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block">
                  Previous Week Ref
                </label>
                <select
                  value={previousWeekNumber}
                  onChange={(e) => setPreviousWeekNumber(Number(e.target.value))}
                  className="bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:border-orange-500"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(w => (
                    <option key={w} value={w}>Week {w}</option>
                  ))}
                </select>
              </div>

              <ArrowRight className="w-4 h-4 text-zinc-600 mt-4" />

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-orange-400 block">
                  Target Next Week
                </label>
                <select
                  value={targetWeekNumber}
                  onChange={(e) => setTargetWeekNumber(Number(e.target.value))}
                  className="bg-zinc-900 border border-orange-500/40 text-orange-400 rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:border-orange-500"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(w => (
                    <option key={w} value={w}>Week {w}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerateAdaptation}
                disabled={isGenerating || (clientCheckIns.length === 0 && !selectedCheckIn)}
                className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-orange-500/20 disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isGenerating && "animate-spin")} />
                {adaptationResult ? 'Re-Generate AI Routine' : 'Generate Adapted Routine'}
              </button>
            </div>
          </div>

          {/* Adaptation Result Display */}
          {adaptationResult ? (
            <div className="space-y-6">
              {/* Executive Summary Card */}
              <div className="bg-zinc-900/90 border border-orange-500/30 rounded-3xl p-6 space-y-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-orange-500" />
                    <h4 className="text-sm font-black uppercase tracking-wider text-white">
                      AI Coach Adaptation Rationale
                    </h4>
                  </div>
                  <span className="px-3 py-1 bg-orange-500/10 text-orange-400 rounded-full text-[10px] font-black uppercase tracking-wider">
                    Week {targetWeekNumber} Tailored
                  </span>
                </div>

                <p className="text-xs md:text-sm text-zinc-300 leading-relaxed font-medium">
                  {adaptationResult.executiveSummary}
                </p>

                {adaptationResult.keyChanges && adaptationResult.keyChanges.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-zinc-800">
                    <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block">
                      Key Adaptation Highlights:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {adaptationResult.keyChanges.map((change, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs text-zinc-300 bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-850">
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{change}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Day Selector Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                {adaptationResult.adaptedDays.map((day, idx) => (
                  <button
                    key={day.dayNumber || idx}
                    onClick={() => setActivePreviewDay(day.dayNumber)}
                    className={cn(
                      "px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-2",
                      activePreviewDay === day.dayNumber
                        ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20"
                        : "bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
                    )}
                  >
                    <span>Day {day.dayNumber}</span>
                    <span className="text-[10px] opacity-80">({day.label || `Day ${day.dayNumber}`})</span>
                    <span className="px-1.5 py-0.5 rounded bg-black/30 text-[9px]">
                      {day.exercises.length} lifts
                    </span>
                  </button>
                ))}
              </div>

              {/* Active Day Exercise List */}
              {(() => {
                const dayIndex = adaptationResult.adaptedDays.findIndex(d => d.dayNumber === activePreviewDay);
                if (dayIndex === -1) return null;
                const currentDay = adaptationResult.adaptedDays[dayIndex];

                return (
                  <div className="bg-zinc-950 border border-zinc-800/80 rounded-3xl p-6 space-y-4 shadow-xl">
                    <div className="flex items-center justify-between pb-3 border-b border-zinc-850">
                      <div>
                        <h4 className="text-sm font-black uppercase tracking-wider text-white">
                          {currentDay.label || `Day ${currentDay.dayNumber}`} Lifts
                        </h4>
                        {currentDay.focusNotes && (
                          <p className="text-xs text-zinc-400 mt-0.5">{currentDay.focusNotes}</p>
                        )}
                      </div>

                      <button
                        onClick={() => handleAddExerciseToDay(dayIndex)}
                        className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-wider text-orange-400 flex items-center gap-1.5 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Lift
                      </button>
                    </div>

                    <div className="space-y-3">
                      {currentDay.exercises.map((ex, exIdx) => {
                        const isSubstituted = ex.changeType === 'substituted';
                        const isProgressed = ex.changeType === 'progressed';
                        const isDeloaded = ex.changeType === 'deloaded';
                        const ytId = getYouTubeId(ex.youtubeLink);

                        return (
                          <div
                            key={exIdx}
                            className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 space-y-3 hover:border-zinc-700 transition-all"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <span className="w-6 h-6 rounded-lg bg-zinc-800 text-zinc-400 text-xs font-black flex items-center justify-center shrink-0">
                                  {exIdx + 1}
                                </span>
                                <input
                                  type="text"
                                  value={ex.name}
                                  onChange={(e) => handleUpdateAdaptedExercise(dayIndex, exIdx, { name: e.target.value })}
                                  className="bg-transparent font-black text-sm text-white focus:outline-none focus:border-b focus:border-orange-500 px-1 py-0.5"
                                />
                              </div>

                              <div className="flex items-center gap-2 self-start sm:self-auto">
                                <span className={cn(
                                  "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                                  isSubstituted ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
                                  isProgressed ? "bg-orange-500/10 border-orange-500/30 text-orange-400" :
                                  isDeloaded ? "bg-blue-500/10 border-blue-500/30 text-blue-400" :
                                  "bg-zinc-800 border-zinc-700 text-zinc-400"
                                )}>
                                  {ex.changeType || 'Unchanged'}
                                </span>

                                <button
                                  onClick={() => handleRemoveExerciseFromDay(dayIndex, exIdx)}
                                  className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-all"
                                  title="Remove exercise"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Adaptation Reason Tag */}
                            {ex.adaptationReason && (
                              <div className="p-2.5 bg-orange-500/5 border border-orange-500/20 rounded-xl text-xs text-orange-300 flex items-start gap-2">
                                <Info className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
                                <span>{ex.adaptationReason}</span>
                              </div>
                            )}

                            {/* Sets / Reps / Load / Rest Inputs */}
                            <div className="grid grid-cols-4 gap-2 text-xs">
                              <div className="space-y-1">
                                <span className="text-[9px] font-bold text-zinc-500 uppercase block">Sets</span>
                                <input
                                  type="number"
                                  value={ex.sets}
                                  onChange={(e) => handleUpdateAdaptedExercise(dayIndex, exIdx, { sets: Number(e.target.value) })}
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2 text-center text-xs font-bold text-white outline-none focus:border-orange-500"
                                />
                              </div>
                              <div className="space-y-1">
                                <span className="text-[9px] font-bold text-zinc-500 uppercase block">Reps</span>
                                <input
                                  type="text"
                                  value={ex.reps}
                                  onChange={(e) => handleUpdateAdaptedExercise(dayIndex, exIdx, { reps: e.target.value })}
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2 text-center text-xs font-bold text-white outline-none focus:border-orange-500"
                                />
                              </div>
                              <div className="space-y-1">
                                <span className="text-[9px] font-bold text-zinc-500 uppercase block">Weight</span>
                                <input
                                  type="text"
                                  value={ex.weight}
                                  onChange={(e) => handleUpdateAdaptedExercise(dayIndex, exIdx, { weight: e.target.value })}
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2 text-center text-xs font-bold text-white outline-none focus:border-orange-500"
                                />
                              </div>
                              <div className="space-y-1">
                                <span className="text-[9px] font-bold text-zinc-500 uppercase block">Rest</span>
                                <input
                                  type="text"
                                  value={ex.rest}
                                  onChange={(e) => handleUpdateAdaptedExercise(dayIndex, exIdx, { rest: e.target.value })}
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2 text-center text-xs font-bold text-white outline-none focus:border-orange-500"
                                />
                              </div>
                            </div>

                            {/* Coach Cue & Video Link Demonstration */}
                            <div className="space-y-2 pt-2 border-t border-zinc-850">
                              <input
                                type="text"
                                value={ex.coachNote || ''}
                                onChange={(e) => handleUpdateAdaptedExercise(dayIndex, exIdx, { coachNote: e.target.value })}
                                placeholder="Coaching cue / form instructions..."
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 placeholder:text-zinc-650 outline-none focus:border-orange-500"
                              />

                              {/* Video Link Display Card with Thumbnail & In-App Watch Button */}
                              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-zinc-950 p-2.5 rounded-xl border border-zinc-850">
                                <div className="flex items-center gap-2.5 overflow-hidden">
                                  {ytId ? (
                                    <div 
                                      onClick={() => setActiveVideoModal({ url: ex.youtubeLink!, title: ex.name, cue: ex.coachNote })}
                                      className="relative w-16 h-10 rounded-lg overflow-hidden shrink-0 cursor-pointer group/thumb border border-zinc-800"
                                    >
                                      <img
                                        src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
                                        alt={ex.name}
                                        className="w-full h-full object-cover group-hover/thumb:scale-110 transition-transform"
                                      />
                                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                        <Play className="w-4 h-4 text-white fill-white" />
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0 text-orange-400">
                                      <Video className="w-4 h-4" />
                                    </div>
                                  )}

                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Video Link Attached
                                      </span>
                                    </div>
                                    <p className="text-[11px] font-mono text-zinc-400 truncate max-w-[200px] sm:max-w-xs">
                                      {ex.youtubeLink || 'No video link'}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                                  {ex.youtubeLink && (
                                    <button
                                      type="button"
                                      onClick={() => setActiveVideoModal({ url: ex.youtubeLink!, title: ex.name, cue: ex.coachNote })}
                                      className="px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all"
                                    >
                                      <Play className="w-3 h-3 fill-orange-400" />
                                      Watch Demo
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setVideoSelectorTarget({
                                        dayIdx: dayIndex,
                                        exIdx,
                                        currentUrl: ex.youtubeLink,
                                        name: ex.name
                                      });
                                      setCustomVideoUrlInput(ex.youtubeLink || '');
                                      setVideoSearchQuery('');
                                    }}
                                    className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-zinc-800 transition-all"
                                  >
                                    Change Video
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Deploy / Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <button
                  onClick={handleDeployProgram}
                  disabled={isDeploying}
                  className="flex-1 py-4 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2.5 hover:scale-[1.01] active:scale-95 disabled:opacity-50"
                >
                  {isDeploying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  {isDeploying ? 'Deploying Program...' : `Approve & Deploy Week ${targetWeekNumber} Routine`}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-12 bg-zinc-950 border border-dashed border-zinc-800 rounded-[32px] text-center space-y-4">
              <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-3xl flex items-center justify-center mx-auto text-orange-500">
                <Sparkles className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-black uppercase tracking-tight text-white">
                  Ready to Generate Week {targetWeekNumber} Routine
                </h4>
                <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                  Every exercise generated will automatically include a verified video link demonstrating exact form and biomechanics. Click above or record your weekly meeting notes to begin.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setShowMeetingModal(true)}
                  className="px-5 py-3 bg-zinc-900 hover:bg-zinc-850 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all border border-zinc-800 flex items-center gap-2"
                >
                  <Video className="w-4 h-4 text-orange-400" />
                  Log Weekly Meeting Check-In
                </button>

                <button
                  onClick={handleGenerateAdaptation}
                  disabled={isGenerating || (clientCheckIns.length === 0 && !selectedCheckIn)}
                  className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-orange-500/20 inline-flex items-center gap-2 disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  Generate Week {targetWeekNumber} Routine
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================
          MODAL 1: WEEKLY MEETING & CHECK-IN FORM
      ======================================================== */}
      <AnimatePresence>
        {showMeetingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-zinc-950 border border-zinc-800 rounded-[32px] p-6 md:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-6 shadow-2xl custom-scrollbar"
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between pb-4 border-b border-zinc-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      <Video className="w-4 h-4" />
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">
                      Weekly Coach Meeting Sync
                    </span>
                  </div>
                  <h3 className="text-xl font-black uppercase tracking-tight text-white">
                    Weekly Meeting with {client.displayName || 'Athlete'}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Record feedback, recovery metrics, and joint notes from your weekly session to immediately adapt their next workout routine with video links.
                  </p>
                </div>
                <button
                  onClick={() => setShowMeetingModal(false)}
                  className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-900 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Controls */}
              <div className="space-y-5">
                {/* Week of & Meeting Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                      Week Of (Monday Start)
                    </label>
                    <input
                      type="date"
                      value={meetingWeekOf}
                      onChange={(e) => setMeetingWeekOf(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:border-orange-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                      Program Satisfaction Rating
                    </label>
                    <div className="flex items-center gap-1.5 pt-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setMeetingProgramRating(star)}
                          className={cn(
                            "p-2 rounded-xl border transition-all",
                            meetingProgramRating >= star
                              ? "bg-amber-500/10 border-amber-500/40 text-amber-400"
                              : "bg-zinc-900 border-zinc-800 text-zinc-650 hover:text-zinc-400"
                          )}
                        >
                          <Star className="w-4 h-4 fill-current" />
                        </button>
                      ))}
                      <span className="text-xs font-bold text-zinc-400 ml-2">{meetingProgramRating} / 5</span>
                    </div>
                  </div>
                </div>

                {/* Energy & Sleep & Diet */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                      Energy Level (1-10)
                    </label>
                    <select
                      value={meetingEnergyLevel}
                      onChange={(e) => setMeetingEnergyLevel(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-orange-400 outline-none focus:border-orange-500"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                        <option key={n} value={n}>{n} - {n >= 8 ? 'High' : n >= 5 ? 'Moderate' : 'Low'}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                      Sleep Quality (1-5)
                    </label>
                    <select
                      value={meetingSleepRating}
                      onChange={(e) => setMeetingSleepRating(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-blue-400 outline-none focus:border-orange-500"
                    >
                      {[1, 2, 3, 4, 5].map(n => (
                        <option key={n} value={n}>{n} Stars</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                      Diet Adherence
                    </label>
                    <select
                      value={meetingDietAdherence}
                      onChange={(e) => setMeetingDietAdherence(e.target.value as any)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-emerald-400 outline-none focus:border-orange-500"
                    >
                      <option value="yes">100% On Track</option>
                      <option value="partial">Partially (70-80%)</option>
                      <option value="no">Off Track (&lt;50%)</option>
                    </select>
                  </div>
                </div>

                {/* Joint Discomfort & Injury Protocol */}
                <div className="space-y-2 pt-2 border-t border-zinc-850">
                  <label className="text-[10px] font-black uppercase tracking-widest text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Joint Discomfort / Pain Flags Discussed
                  </label>
                  <p className="text-[11px] text-zinc-500">
                    Select any areas the athlete reported discomfort with during the meeting. AI will automatically substitute aggravating movements.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {[
                      { id: 'none', label: 'None / Pain-Free' },
                      { id: 'knee', label: 'Knees' },
                      { id: 'lower_back', label: 'Lower Back' },
                      { id: 'shoulder', label: 'Shoulders' },
                      { id: 'neck', label: 'Neck' },
                      { id: 'hip', label: 'Hips' },
                      { id: 'elbow', label: 'Elbows' },
                      { id: 'ankle', label: 'Ankles' }
                    ].map(area => {
                      const isSelected = area.id === 'none' 
                        ? (meetingPainAreas.length === 0 || meetingPainAreas.includes('none'))
                        : meetingPainAreas.includes(area.id);

                      return (
                        <button
                          key={area.id}
                          type="button"
                          onClick={() => toggleMeetingPainArea(area.id)}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-xs font-bold transition-all border",
                            isSelected
                              ? area.id === 'none'
                                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                                : "bg-red-500/15 border-red-500/40 text-red-400"
                              : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                          )}
                        >
                          {area.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Pain Trend */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    Joint Pain Trend vs Previous Week
                  </label>
                  <div className="flex gap-2">
                    {[
                      { id: 'better', label: 'Improved / Better' },
                      { id: 'same', label: 'About the Same' },
                      { id: 'worse', label: 'Worse / Flare-Up' }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setMeetingPainReduction(opt.id as any)}
                        className={cn(
                          "flex-1 py-2 rounded-xl text-xs font-bold transition-all border",
                          meetingPainReduction === opt.id
                            ? "bg-orange-500/15 border-orange-500/40 text-orange-400"
                            : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Exercises Discussed */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                      Exercises to Swap or Deload (Felt Hard / Painful)
                    </label>
                    <input
                      type="text"
                      value={meetingExercisesTooHard}
                      onChange={(e) => setMeetingExercisesTooHard(e.target.value)}
                      placeholder="e.g. Barbell Back Squat, Flat Bench..."
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-650 outline-none focus:border-orange-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                      Exercises to Progress (Felt Easy / Ready for +kg)
                    </label>
                    <input
                      type="text"
                      value={meetingExercisesTooEasy}
                      onChange={(e) => setMeetingExercisesTooEasy(e.target.value)}
                      placeholder="e.g. Lat Pulldown, Romanian Deadlift..."
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-650 outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                {/* Equipment for Next Week */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    Next Week Equipment Constraints
                  </label>
                  <select
                    value={meetingEquipmentConstraints}
                    onChange={(e) => setMeetingEquipmentConstraints(e.target.value as any)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-300 outline-none focus:border-orange-500"
                  >
                    <option value="full_gym">Full Gym (Barbells, Cables, Dumbbells, Machines)</option>
                    <option value="dumbbells">Dumbbells & Bench Only (Home Gym)</option>
                    <option value="bodyweight_travel">Traveling / Bodyweight & Bands Only</option>
                    <option value="custom">Custom Setup Discussed</option>
                  </select>
                </div>

                {/* Coach Meeting Notes */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-purple-400">
                    Coach Meeting Notes & Key Takeaways
                  </label>
                  <textarea
                    rows={3}
                    value={meetingNotes}
                    onChange={(e) => setMeetingNotes(e.target.value)}
                    placeholder="e.g. Met on Zoom. Athlete noted knee twinge during deep barbell squats. Agreed to switch to goblet box squats and Spanish squats for 2 weeks. Upper body pulling strength is increasing..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-300 placeholder:text-zinc-650 outline-none focus:border-orange-500 custom-scrollbar"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => handleSaveMeetingCheckIn(false)}
                  disabled={isSavingMeeting}
                  className="px-5 py-3.5 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border border-zinc-800"
                >
                  {isSavingMeeting ? 'Saving...' : 'Save Check-In Only'}
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveMeetingCheckIn(true)}
                  disabled={isSavingMeeting}
                  className="flex-1 py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2"
                >
                  {isSavingMeeting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Save & Generate Adapted Plan with Video Links
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          MODAL 2: IN-APP VIDEO DEMO PLAYER MODAL
      ======================================================== */}
      <AnimatePresence>
        {activeVideoModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-950 border border-zinc-800 rounded-[28px] max-w-2xl w-full overflow-hidden shadow-2xl relative"
            >
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-orange-400 fill-orange-400" />
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">
                    {activeVideoModal.title}
                  </h3>
                </div>
                <button
                  onClick={() => setActiveVideoModal(null)}
                  className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-900 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Video Player */}
              <div className="relative aspect-video bg-black">
                {getYouTubeId(activeVideoModal.url) ? (
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${getYouTubeId(activeVideoModal.url)}?autoplay=1&rel=0&modestbranding=1`}
                    title={activeVideoModal.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full border-0"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
                    <Video className="w-12 h-12 text-zinc-600" />
                    <p className="text-sm font-bold text-zinc-400">External Demonstration Link</p>
                    <a
                      href={activeVideoModal.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Watch Video on YouTube
                    </a>
                  </div>
                )}
              </div>

              {activeVideoModal.cue && (
                <div className="p-4 bg-zinc-900/80 border-t border-zinc-800 flex items-start gap-2.5 text-xs text-zinc-300">
                  <Info className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white uppercase tracking-wider text-[10px] block">Coaching Form Cue:</span>
                    <span>{activeVideoModal.cue}</span>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          MODAL 3: SELECT / CHANGE VERIFIED VIDEO DEMO
      ======================================================== */}
      <AnimatePresence>
        {videoSelectorTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-950 border border-zinc-800 rounded-[28px] max-w-xl w-full p-6 space-y-5 shadow-2xl max-h-[85vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-orange-400">
                    Video Demonstration Picker
                  </span>
                  <h3 className="text-base font-black uppercase tracking-tight text-white">
                    Select Demo for {videoSelectorTarget.name}
                  </h3>
                </div>
                <button
                  onClick={() => setVideoSelectorTarget(null)}
                  className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-900"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Custom URL Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  Direct YouTube / Shorts URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customVideoUrlInput}
                    onChange={(e) => setCustomVideoUrlInput(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-zinc-300 outline-none focus:border-orange-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (videoSelectorTarget) {
                        handleUpdateAdaptedExercise(
                          videoSelectorTarget.dayIdx,
                          videoSelectorTarget.exIdx,
                          { youtubeLink: customVideoUrlInput.trim() }
                        );
                        setVideoSelectorTarget(null);
                        showToast('Video link updated!', 'success');
                      }
                    }}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider"
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* Verified Exercises Library Search */}
              <div className="space-y-3 pt-2 border-t border-zinc-850">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    Or Pick from Verified Exercise Library
                  </label>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {filteredVerifiedVideos.length} exercises
                  </span>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={videoSearchQuery}
                    onChange={(e) => setVideoSearchQuery(e.target.value)}
                    placeholder="Search exercise name or category..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-zinc-650 outline-none focus:border-orange-500"
                  />
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                  {filteredVerifiedVideos.map((video) => (
                    <div
                      key={video.youtubeId + video.name}
                      onClick={() => {
                        if (videoSelectorTarget) {
                          handleUpdateAdaptedExercise(
                            videoSelectorTarget.dayIdx,
                            videoSelectorTarget.exIdx,
                            { 
                              youtubeLink: video.youtubeUrl,
                              coachNote: video.coachCue || undefined 
                            }
                          );
                          setVideoSelectorTarget(null);
                          showToast(`Attached verified video for ${video.name}`, 'success');
                        }
                      }}
                      className="p-3 bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 rounded-xl cursor-pointer flex items-center justify-between gap-3 transition-all hover:border-orange-500/40"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={`https://img.youtube.com/vi/${video.youtubeId}/mqdefault.jpg`}
                          alt={video.name}
                          className="w-12 h-8 object-cover rounded-lg border border-zinc-800 shrink-0"
                        />
                        <div>
                          <p className="text-xs font-bold text-white">{video.name}</p>
                          <p className="text-[10px] text-zinc-500 capitalize">{video.category.replace('_', ' ')}</p>
                        </div>
                      </div>

                      <span className="text-[10px] font-black text-orange-400 uppercase tracking-wider shrink-0">
                        Select
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
