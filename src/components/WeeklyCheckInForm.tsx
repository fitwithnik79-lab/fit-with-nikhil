import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Star, Sparkles, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { ClientType, UserProfile } from '../types';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { triggerPushNotification, sendInAppNotification } from '../lib/notifications';

interface WeeklyCheckInFormProps {
  profile: UserProfile;
  weekOf: string;
  onSuccess: () => void;
  onCancel?: () => void;
}

export function WeeklyCheckInForm({ profile, weekOf, onSuccess, onCancel }: WeeklyCheckInFormProps) {
  const clientType = profile.clientType || 'fitness';

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // --- QUESTION STATES ---
  // Common to all
  const [workoutPattern, setWorkoutPattern] = useState<'boring' | 'interesting' | null>(null);
  const [programRating, setProgramRating] = useState<number>(5);
  const [sleepRating, setSleepRating] = useState<number>(4);
  const [freeText, setFreeText] = useState('');

  // AI Exercise Adaptation Specifics
  const [selectedPainAreas, setSelectedPainAreas] = useState<string[]>([]);
  const [exerciseFeedbackNotes, setExerciseFeedbackNotes] = useState('');
  const [exercisesTooHardInput, setExercisesTooHardInput] = useState('');
  const [exercisesTooEasyInput, setExercisesTooEasyInput] = useState('');
  const [equipmentConstraints, setEquipmentConstraints] = useState<'full_gym' | 'dumbbells' | 'bodyweight_travel' | 'custom'>('full_gym');
  const [customEquipmentNote, setCustomEquipmentNote] = useState('');

  // Fitness only
  const [strengthGain, setStrengthGain] = useState<boolean | null>(null);
  const [energyLevel, setEnergyLevel] = useState<number | null>(null);
  const [dietAdherence, setDietAdherence] = useState<'yes' | 'partial' | 'no' | null>(null);

  // Injury clients (Knee, Back, Shoulder)
  const [painReduction, setPainReduction] = useState<'better' | 'same' | 'worse' | null>(null);
  const [movementImprovement, setMovementImprovement] = useState<'easier' | 'same' | 'harder' | null>(null);

  // Knee only
  const [kneeStiffness, setKneeStiffness] = useState<boolean | null>(null);

  // Back only
  const [sharpPain, setSharpPain] = useState<boolean | null>(null);

  // Shoulder only
  const [overheadReach, setOverheadReach] = useState<'yes' | 'no' | 'didnt_test' | null>(null);
  const [sleepAffected, setSleepAffected] = useState<boolean | null>(null);

  const togglePainArea = (area: string) => {
    if (area === 'none') {
      setSelectedPainAreas(['none']);
      return;
    }
    const filtered = selectedPainAreas.filter(a => a !== 'none');
    if (filtered.includes(area)) {
      setSelectedPainAreas(filtered.filter(a => a !== area));
    } else {
      setSelectedPainAreas([...filtered, area]);
    }
  };

  const validateForm = (): boolean => {
    if (!workoutPattern) return setErrorMsg('Please choose your workout pattern (Boring or Interesting).');
    if (programRating === undefined || programRating < 1) return setErrorMsg('Please rate your program.');

    if (clientType === 'fitness') {
      if (strengthGain === null) return setErrorMsg('Please answer if you felt stronger this week.');
      if (energyLevel === null) return setErrorMsg('Please rate your energy level.');
      if (!dietAdherence) return setErrorMsg('Please rate your nutrition plan adherence.');
    } else {
      // Injury common
      if (!painReduction) return setErrorMsg('Please answer: Pain this week vs last week?');
      
      if (clientType === 'knee_injury') {
        if (!movementImprovement) return setErrorMsg('Please answer: Daily movement (walking, stairs)?');
        if (kneeStiffness === null) return setErrorMsg('Please answer: Knee stiff today?');
      } else if (clientType === 'back_injury') {
        if (!movementImprovement) return setErrorMsg('Please answer: Daily movement?');
        if (sharpPain === null) return setErrorMsg('Please answer: Any sharp or shooting pain during exercises?');
      } else if (clientType === 'shoulder_injury') {
        if (!overheadReach) return setErrorMsg('Please answer: Overhead reach improved?');
        if (sleepAffected === null) return setErrorMsg('Please answer: Is pain affecting your sleep?');
      }
    }

    setValidationError(null);
    return true;
  };

  const setErrorMsg = (msg: string): boolean => {
    setValidationError(msg);
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      // Mapping logic to fit the database schema in types.ts
      const payload: any = {
        uid: profile.uid,
        clientType,
        weekOf,
        submittedAt: new Date().toISOString(),
        workoutPattern,
        programRating,
        sleepRating,
        freeText: freeText.trim() || undefined,
        // AI Routine adaptation fields
        painAreas: selectedPainAreas.filter(a => a !== 'none'),
        exerciseFeedbackNotes: exerciseFeedbackNotes.trim() || undefined,
        exercisesTooHard: exercisesTooHardInput ? exercisesTooHardInput.split(',').map(s => s.trim()).filter(Boolean) : [],
        exercisesTooEasy: exercisesTooEasyInput ? exercisesTooEasyInput.split(',').map(s => s.trim()).filter(Boolean) : [],
        equipmentConstraints: equipmentConstraints === 'custom' 
          ? (customEquipmentNote || 'Custom equipment') 
          : equipmentConstraints === 'full_gym' ? 'Full standard gym' : equipmentConstraints === 'dumbbells' ? 'Dumbbells & Bench only' : 'Bodyweight & Travel',
        aiAdaptedStatus: 'pending'
      };

      if (clientType === 'fitness') {
        payload.strengthGain = strengthGain ? 'yes' : 'no';
        payload.energyLevel = energyLevel;
        payload.dietAdherence = dietAdherence === 'partial' ? 'partially' : dietAdherence;
      } else {
        // Map BETTER/SAME/WORSE to 'moderate'/'slight'/'no'
        if (painReduction === 'better') payload.painReduction = 'moderate';
        else if (painReduction === 'same') payload.painReduction = 'slight';
        else if (painReduction === 'worse') payload.painReduction = 'no';

        if (clientType === 'knee_injury') {
          if (movementImprovement === 'easier') payload.movementImprovement = 'moderate';
          else if (movementImprovement === 'same') payload.movementImprovement = 'slight';
          else if (movementImprovement === 'harder') payload.movementImprovement = 'no';

          payload.kneeStiffness = kneeStiffness ? 'yes' : 'no';
        } else if (clientType === 'back_injury') {
          if (movementImprovement === 'easier') payload.movementImprovement = 'moderate';
          else if (movementImprovement === 'same') payload.movementImprovement = 'slight';
          else if (movementImprovement === 'harder') payload.movementImprovement = 'no';

          payload.sharpPain = sharpPain ? 'yes' : 'no';
        } else if (clientType === 'shoulder_injury') {
          if (overheadReach === 'yes') payload.overheadReach = 'yes';
          else if (overheadReach === 'no') payload.overheadReach = 'no';
          // if 'didnt_test', omit or set to undefined

          payload.sleepAffected = sleepAffected ? 'yes' : 'no';
        }
      }

      await addDoc(collection(db, 'weeklyCheckIns'), payload).catch(err => {
        handleFirestoreError(err, OperationType.CREATE, 'weeklyCheckIns');
      });

      // Send push and in-app notifications to all admins
      try {
        const adminsQuery = query(collection(db, 'users'), where('role', '==', 'admin'));
        const adminsSnap = await getDocs(adminsQuery);
        const clientName = profile.displayName || 'An athlete';

        adminsSnap.forEach((adminDoc) => {
          const adminId = adminDoc.id;
          triggerPushNotification(
            adminId,
            'Check-In Submitted 📋',
            `${clientName} submitted their weekly check-in.`,
            { type: 'checkin', clientId: profile.uid }
          ).catch(e => console.error("Admin push failed:", e));

          sendInAppNotification(
            adminId,
            'Check-In Submitted 📋',
            `${clientName} submitted their weekly check-in.`,
            'feedback',
            profile.uid
          ).catch(e => console.error("Admin in-app notification failed:", e));
        });
      } catch (notifyErr) {
        console.error("Failed to notify admin:", notifyErr);
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 3000);
    } catch (err) {
      console.error('Check-in submission error:', err);
      setValidationError('Failed to submit weekly check-in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getClientTypeLabel = (type: ClientType) => {
    switch (type) {
      case 'fitness': return 'Fitness';
      case 'knee_injury': return 'Knee Injury';
      case 'back_injury': return 'Back Injury';
      case 'shoulder_injury': return 'Shoulder Injury';
      default: return 'Fitness';
    }
  };

  return (
    <div id="weekly-checkin-wrapper" className="bg-zinc-950 border border-zinc-800 rounded-[40px] p-6 md:p-10 max-w-3xl mx-auto shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none">
        <Sparkles className="w-48 h-48 text-orange-500" />
      </div>

      <AnimatePresence mode="wait">
        {success ? (
          <motion.div
            key="success-state"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center text-center py-12 space-y-6"
          >
            <div className="p-4 bg-green-500/10 text-green-500 rounded-full animate-bounce">
              <CheckCircle className="w-16 h-16" />
            </div>
            <h3 className="text-2xl font-black tracking-tight text-white">Sent to Nik 🙌</h3>
            <p className="text-zinc-400 max-w-md font-medium">
              Thanks! Nik will review this before tuning your program.
            </p>
          </motion.div>
        ) : (
          <motion.form
            key="form-state"
            onSubmit={handleSubmit}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-orange-500/10 text-orange-500 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
                  {getClientTypeLabel(clientType)} check-in
                </span>
                <span className="text-zinc-500 text-xs font-semibold">Week of {weekOf}</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white">
                How was your training & body this week?
              </h2>
              <p className="text-sm text-zinc-400 mt-2">
                Help Nik tune your program by completing this quick 2-minute update.
              </p>
            </div>

            {validationError && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl flex items-center gap-3 text-sm font-semibold">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            <div className="space-y-8">
              {/* === FITNESS ONLY (Show first) === */}
              {clientType === 'fitness' && (
                <div className="space-y-6">
                  {/* Q1: Did you feel stronger this week? YES / NO (min 56px height) */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-zinc-200">
                      Did you feel stronger this week?
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setStrengthGain(true)}
                        className={`min-h-[56px] px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          strengthGain === true
                            ? 'bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/20'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        YES
                      </button>
                      <button
                        type="button"
                        onClick={() => setStrengthGain(false)}
                        className={`min-h-[56px] px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          strengthGain === false
                            ? 'bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/20'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        NO
                      </button>
                    </div>
                  </div>

                  {/* Q2: Energy level -> 5 large numbered buttons (1-5) */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-zinc-200 block">
                      Energy level:
                    </label>
                    <div className="flex items-center gap-3">
                      {[1, 2, 3, 4, 5].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setEnergyLevel(num)}
                          className={`w-14 h-14 rounded-2xl text-lg font-black transition-all border flex items-center justify-center ${
                            energyLevel === num
                              ? 'bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/20'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q3: Nutrition plan adherence -> YES / PARTLY / NO */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-zinc-200">
                      Did you follow your nutrition plan?
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setDietAdherence('yes')}
                        className={`py-4 px-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          dietAdherence === 'yes'
                            ? 'bg-orange-500 border-orange-400 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        YES
                      </button>
                      <button
                        type="button"
                        onClick={() => setDietAdherence('partial')}
                        className={`py-4 px-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          dietAdherence === 'partial'
                            ? 'bg-orange-500 border-orange-400 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        PARTLY
                      </button>
                      <button
                        type="button"
                        onClick={() => setDietAdherence('no')}
                        className={`py-4 px-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          dietAdherence === 'no'
                            ? 'bg-orange-500 border-orange-400 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        NO
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* === KNEE INJURY SPECIFIC === */}
              {clientType === 'knee_injury' && (
                <div className="space-y-6">
                  {/* Q1: Pain this week vs last week? -> BETTER / SAME / WORSE */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-zinc-200">
                      Pain this week vs last week?
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setPainReduction('better')}
                        className={`py-4 px-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          painReduction === 'better'
                            ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/10'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'
                        }`}
                      >
                        BETTER
                      </button>
                      <button
                        type="button"
                        onClick={() => setPainReduction('same')}
                        className={`py-4 px-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          painReduction === 'same'
                            ? 'bg-zinc-600 border-zinc-550 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'
                        }`}
                      >
                        SAME
                      </button>
                      <button
                        type="button"
                        onClick={() => setPainReduction('worse')}
                        className={`py-4 px-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          painReduction === 'worse'
                            ? 'bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-600/10'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'
                        }`}
                      >
                        WORSE
                      </button>
                    </div>
                  </div>

                  {/* Q2: Daily movement (walking, stairs)? -> EASIER / SAME / HARDER */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-zinc-200">
                      Daily movement (walking, stairs)?
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setMovementImprovement('easier')}
                        className={`py-4 px-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          movementImprovement === 'easier'
                            ? 'bg-orange-500 border-orange-400 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        EASIER
                      </button>
                      <button
                        type="button"
                        onClick={() => setMovementImprovement('same')}
                        className={`py-4 px-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          movementImprovement === 'same'
                            ? 'bg-orange-500 border-orange-400 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        SAME
                      </button>
                      <button
                        type="button"
                        onClick={() => setMovementImprovement('harder')}
                        className={`py-4 px-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          movementImprovement === 'harder'
                            ? 'bg-orange-500 border-orange-400 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        HARDER
                      </button>
                    </div>
                  </div>

                  {/* Q3: Knee stiff today? -> YES / NO */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-zinc-200">
                      Knee stiff today?
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setKneeStiffness(true)}
                        className={`min-h-[56px] px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          kneeStiffness === true
                            ? 'bg-orange-500 border-orange-400 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        YES
                      </button>
                      <button
                        type="button"
                        onClick={() => setKneeStiffness(false)}
                        className={`min-h-[56px] px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          kneeStiffness === false
                            ? 'bg-orange-500 border-orange-400 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        NO
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* === BACK INJURY SPECIFIC === */}
              {clientType === 'back_injury' && (
                <div className="space-y-6">
                  {/* Q1: Pain this week vs last week? -> BETTER / SAME / WORSE */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-zinc-200">
                      Pain this week vs last week?
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setPainReduction('better')}
                        className={`py-4 px-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          painReduction === 'better'
                            ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/10'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'
                        }`}
                      >
                        BETTER
                      </button>
                      <button
                        type="button"
                        onClick={() => setPainReduction('same')}
                        className={`py-4 px-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          painReduction === 'same'
                            ? 'bg-zinc-600 border-zinc-550 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'
                        }`}
                      >
                        SAME
                      </button>
                      <button
                        type="button"
                        onClick={() => setPainReduction('worse')}
                        className={`py-4 px-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          painReduction === 'worse'
                            ? 'bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-600/10'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'
                        }`}
                      >
                        WORSE
                      </button>
                    </div>
                  </div>

                  {/* Q2: Daily movement? -> EASIER / SAME / HARDER */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-zinc-200">
                      Daily movement?
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setMovementImprovement('easier')}
                        className={`py-4 px-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          movementImprovement === 'easier'
                            ? 'bg-orange-500 border-orange-400 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        EASIER
                      </button>
                      <button
                        type="button"
                        onClick={() => setMovementImprovement('same')}
                        className={`py-4 px-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          movementImprovement === 'same'
                            ? 'bg-orange-500 border-orange-400 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        SAME
                      </button>
                      <button
                        type="button"
                        onClick={() => setMovementImprovement('harder')}
                        className={`py-4 px-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          movementImprovement === 'harder'
                            ? 'bg-orange-500 border-orange-400 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        HARDER
                      </button>
                    </div>
                  </div>

                  {/* Q3: Any sharp or shooting pain during exercises? -> YES / NO */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-zinc-200">
                      Any sharp or shooting pain during exercises?
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setSharpPain(true)}
                        className={`min-h-[56px] px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          sharpPain === true
                            ? 'bg-orange-500 border-orange-400 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        YES
                      </button>
                      <button
                        type="button"
                        onClick={() => setSharpPain(false)}
                        className={`min-h-[56px] px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          sharpPain === false
                            ? 'bg-orange-500 border-orange-400 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        NO
                      </button>
                    </div>
                    {sharpPain === true && (
                      <div className="flex items-center gap-2 mt-3 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl text-xs font-semibold animate-pulse">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Note this to Nik →</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* === SHOULDER INJURY SPECIFIC === */}
              {clientType === 'shoulder_injury' && (
                <div className="space-y-6">
                  {/* Q1: Pain this week vs last week? -> BETTER / SAME / WORSE */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-zinc-200">
                      Pain this week vs last week?
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setPainReduction('better')}
                        className={`py-4 px-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          painReduction === 'better'
                            ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/10'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'
                        }`}
                      >
                        BETTER
                      </button>
                      <button
                        type="button"
                        onClick={() => setPainReduction('same')}
                        className={`py-4 px-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          painReduction === 'same'
                            ? 'bg-zinc-600 border-zinc-550 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'
                        }`}
                      >
                        SAME
                      </button>
                      <button
                        type="button"
                        onClick={() => setPainReduction('worse')}
                        className={`py-4 px-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          painReduction === 'worse'
                            ? 'bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-600/10'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'
                        }`}
                      >
                        WORSE
                      </button>
                    </div>
                  </div>

                  {/* Q2: Overhead reach improved? -> YES / NO / DIDN'T TEST */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-zinc-200">
                      Overhead reach improved?
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setOverheadReach('yes')}
                        className={`py-4 px-1 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                          overheadReach === 'yes'
                            ? 'bg-orange-500 border-orange-400 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        YES
                      </button>
                      <button
                        type="button"
                        onClick={() => setOverheadReach('no')}
                        className={`py-4 px-1 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                          overheadReach === 'no'
                            ? 'bg-orange-500 border-orange-400 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        NO
                      </button>
                      <button
                        type="button"
                        onClick={() => setOverheadReach('didnt_test')}
                        className={`py-4 px-1 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                          overheadReach === 'didnt_test'
                            ? 'bg-orange-500 border-orange-400 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        DIDN'T TEST
                      </button>
                    </div>
                  </div>

                  {/* Q3: Is pain affecting your sleep? -> YES / NO */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-zinc-200">
                      Is pain affecting your sleep?
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setSleepAffected(true)}
                        className={`min-h-[56px] px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          sleepAffected === true
                            ? 'bg-orange-500 border-orange-400 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        YES
                      </button>
                      <button
                        type="button"
                        onClick={() => setSleepAffected(false)}
                        className={`min-h-[56px] px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                          sleepAffected === false
                            ? 'bg-orange-500 border-orange-400 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        NO
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* === COMMON QUESTIONS (Show last) === */}
              <div className="pt-6 border-t border-zinc-900 space-y-6">
                {/* Workout Pattern: "😴 Boring" | "💪 Interesting" */}
                <div className="space-y-3">
                  <label className="text-sm font-bold text-zinc-200">
                    Workout pattern:
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setWorkoutPattern('boring')}
                      className={`min-h-[56px] px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                        workoutPattern === 'boring'
                          ? 'bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/20'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      😴 Boring
                    </button>
                    <button
                      type="button"
                      onClick={() => setWorkoutPattern('interesting')}
                      className={`min-h-[56px] px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                        workoutPattern === 'interesting'
                          ? 'bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/20'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      💪 Interesting
                    </button>
                  </div>
                </div>

                {/* Program Rating: 5 tap-able stars */}
                <div className="space-y-3">
                  <label className="text-sm font-bold text-zinc-200 block">
                    Program rating:
                  </label>
                  <div className="flex items-center gap-3">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setProgramRating(star)}
                        className="focus:outline-none transition-transform active:scale-95 animate-none"
                      >
                        <Star
                          className={`w-10 h-10 transition-all ${
                            star <= programRating
                              ? 'text-orange-500 fill-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.4)]'
                              : 'text-zinc-700 hover:text-zinc-500'
                          }`}
                        />
                      </button>
                    ))}
                    <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest ml-2">
                      {programRating} / 5 Stars
                    </span>
                  </div>
                </div>

                {/* Sleep & Recovery Rating */}
                <div className="space-y-3">
                  <label className="text-sm font-bold text-zinc-200 block">
                    Sleep & Recovery Quality:
                  </label>
                  <div className="flex items-center gap-3">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setSleepRating(level)}
                        className={`w-12 h-12 rounded-2xl text-sm font-black transition-all border flex items-center justify-center ${
                          sleepRating === level
                            ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/20'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'
                        }`}
                      >
                        {level}★
                      </button>
                    ))}
                    <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest ml-2">
                      {sleepRating >= 4 ? 'Deep Rest' : sleepRating === 3 ? 'Average' : 'High Fatigue'}
                    </span>
                  </div>
                </div>

                {/* === AI EXERCISE ROUTINE CUSTOMIZATION SECTION === */}
                <div className="p-6 bg-zinc-900/60 border border-orange-500/20 rounded-3xl space-y-6">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-orange-500/10 rounded-xl text-orange-500">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black uppercase tracking-wider text-white">
                        AI Exercise Routine Customizer
                      </h4>
                      <p className="text-xs text-zinc-400">
                        The AI will adapt your next week exercises based on your feedback below.
                      </p>
                    </div>
                  </div>

                  {/* Joint Discomfort Hotspots */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-zinc-300 block uppercase tracking-wider">
                      Any joint stiffness or discomfort during workouts this week?
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'none', label: '✅ Pain-Free & Great' },
                        { id: 'knees', label: '🦵 Knees' },
                        { id: 'lower_back', label: '🦴 Lower Back' },
                        { id: 'shoulders', label: '💪 Shoulders' },
                        { id: 'elbows', label: '🦾 Elbows' },
                        { id: 'wrists', label: '✋ Wrists' },
                        { id: 'hips', label: '🏃 Hips' },
                        { id: 'neck', label: '🧘 Neck' }
                      ].map((chip) => {
                        const isSelected = selectedPainAreas.includes(chip.id);
                        return (
                          <button
                            key={chip.id}
                            type="button"
                            onClick={() => togglePainArea(chip.id)}
                            className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all border ${
                              isSelected
                                ? chip.id === 'none'
                                  ? 'bg-emerald-500 border-emerald-400 text-white'
                                  : 'bg-red-500/20 border-red-500 text-red-300'
                                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                            }`}
                          >
                            {chip.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Exercises that caused pain / need swapping */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-300 block uppercase tracking-wider">
                      Specific exercises that felt awkward or aggravated pain:
                    </label>
                    <input
                      type="text"
                      value={exerciseFeedbackNotes}
                      onChange={(e) => setExerciseFeedbackNotes(e.target.value)}
                      placeholder="e.g., Barbell Back Squat irritated left knee, Overhead press pinched shoulder"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-xs focus:border-orange-500 outline-none text-white placeholder:text-zinc-650"
                    />
                    <span className="text-[10px] text-zinc-500">
                      💡 The AI will automatically swap these exercises for joint-friendly alternatives in next week's split.
                    </span>
                  </div>

                  {/* Progression / Overload */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-300 block uppercase tracking-wider">
                        Felt Too Easy / Ready to Increase:
                      </label>
                      <input
                        type="text"
                        value={exercisesTooEasyInput}
                        onChange={(e) => setExercisesTooEasyInput(e.target.value)}
                        placeholder="e.g., Bench Press, Lat Pulldown"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-3.5 text-xs focus:border-orange-500 outline-none text-white placeholder:text-zinc-650"
                      />
                      <span className="text-[10px] text-zinc-500">
                        AI will increase load or intensity targets.
                      </span>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-300 block uppercase tracking-wider">
                        Felt Too Heavy / Stalled:
                      </label>
                      <input
                        type="text"
                        value={exercisesTooHardInput}
                        onChange={(e) => setExercisesTooHardInput(e.target.value)}
                        placeholder="e.g., Barbell Deadlift, Pull-Ups"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-3.5 text-xs focus:border-orange-500 outline-none text-white placeholder:text-zinc-650"
                      />
                      <span className="text-[10px] text-zinc-500">
                        AI will adjust volume or provide regressions.
                      </span>
                    </div>
                  </div>

                  {/* Equipment for Next Week */}
                  <div className="space-y-2.5">
                    <label className="text-xs font-bold text-zinc-300 block uppercase tracking-wider">
                      Equipment availability for Next Week:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {[
                        { id: 'full_gym', label: '🏋️ Full Gym' },
                        { id: 'dumbbells', label: '🔩 DBs & Bench' },
                        { id: 'bodyweight_travel', label: '✈️ Bodyweight / Travel' },
                        { id: 'custom', label: '⚙️ Custom' }
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setEquipmentConstraints(item.id as any)}
                          className={`p-3 rounded-2xl text-xs font-bold transition-all border text-center ${
                            equipmentConstraints === item.id
                              ? 'bg-orange-500 border-orange-400 text-white'
                              : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    {equipmentConstraints === 'custom' && (
                      <input
                        type="text"
                        value={customEquipmentNote}
                        onChange={(e) => setCustomEquipmentNote(e.target.value)}
                        placeholder="Describe what equipment you have access to..."
                        className="w-full mt-2 bg-zinc-950 border border-zinc-800 rounded-2xl p-3.5 text-xs focus:border-orange-500 outline-none text-white"
                      />
                    )}
                  </div>
                </div>

                {/* Free Text: optional textarea "Anything Nik should know?" */}
                <div className="space-y-3">
                  <label className="text-sm font-bold text-zinc-200 block">
                    Personal note to Coach Nik:
                  </label>
                  <textarea
                    value={freeText}
                    onChange={(e) => setFreeText(e.target.value)}
                    placeholder="Tell Nik how you felt, where you struggled, or any milestones..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-5 text-sm focus:ring-1 focus:ring-orange-500 outline-none min-h-[100px] text-zinc-100 placeholder:text-zinc-600"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-zinc-900">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-black uppercase tracking-widest text-xs py-4 px-8 rounded-3xl transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Check-In'
                )}
              </button>
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="bg-zinc-900 hover:bg-zinc-850 text-zinc-400 font-bold px-8 py-4 rounded-3xl text-sm transition-all border border-zinc-800"
                >
                  Close
                </button>
              )}
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
