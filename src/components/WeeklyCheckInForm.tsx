import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Star, Sparkles, Loader2, CheckCircle, AlertTriangle, HelpCircle } from 'lucide-react';
import { ClientType, UserProfile } from '../types';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';

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

  // Question States
  const [strengthGain, setStrengthGain] = useState<'yes' | 'no' | null>(null);
  const [painReduction, setPainReduction] = useState<'slight' | 'moderate' | 'no' | null>(null);
  const [movementImprovement, setMovementImprovement] = useState<'slight' | 'moderate' | 'no' | null>(null);
  const [workoutPattern, setWorkoutPattern] = useState<'boring' | 'interesting' | null>(null);
  const [programRating, setProgramRating] = useState<number>(5);
  const [sharpPain, setSharpPain] = useState<'yes' | 'no' | null>(null);
  const [kneeStiffness, setKneeStiffness] = useState<'yes' | 'no' | null>(null);
  const [overheadReach, setOverheadReach] = useState<'yes' | 'no' | null>(null);
  const [sleepAffected, setSleepAffected] = useState<'yes' | 'no' | null>(null);
  const [energyLevel, setEnergyLevel] = useState<number>(3);
  const [dietAdherence, setDietAdherence] = useState<'yes' | 'partially' | 'no' | null>(null);
  const [freeText, setFreeText] = useState('');

  const validateForm = (): boolean => {
    if (clientType === 'fitness') {
      if (!strengthGain) return setErrorMsg('Please answer if you felt stronger this week.');
      if (!workoutPattern) return setErrorMsg('Please share how your workout pattern felt.');
      if (!energyLevel) return setErrorMsg('Please rate your energy level.');
      if (!dietAdherence) return setErrorMsg('Please rate your nutrition plan adherence.');
      if (programRating === undefined) return setErrorMsg('Please rate last week\'s program.');
    } else if (clientType === 'knee_injury') {
      if (!painReduction) return setErrorMsg('Please rate your pain reduction.');
      if (!movementImprovement) return setErrorMsg('Please rate your daily movement improvement.');
      if (!kneeStiffness) return setErrorMsg('Please let us know if your knee was stiff today.');
      if (!workoutPattern) return setErrorMsg('Please share your workout pattern feel.');
      if (programRating === undefined) return setErrorMsg('Please rate last week\'s program.');
    } else if (clientType === 'back_injury') {
      if (!painReduction) return setErrorMsg('Please rate your pain reduction.');
      if (!movementImprovement) return setErrorMsg('Please rate your daily movement improvement.');
      if (!sharpPain) return setErrorMsg('Please indicate if you felt any sharp pain during exercise.');
      if (!workoutPattern) return setErrorMsg('Please share your workout pattern feel.');
      if (programRating === undefined) return setErrorMsg('Please rate last week\'s program.');
    } else if (clientType === 'shoulder_injury') {
      if (!painReduction) return setErrorMsg('Please rate your pain reduction.');
      if (!overheadReach) return setErrorMsg('Please indicate if your overhead reach improved.');
      if (!sleepAffected) return setErrorMsg('Please share if pain affected your sleep.');
      if (!workoutPattern) return setErrorMsg('Please share your workout pattern feel.');
      if (programRating === undefined) return setErrorMsg('Please rate last week\'s program.');
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
      const payload: any = {
        uid: profile.uid,
        clientType,
        weekOf,
        submittedAt: new Date().toISOString(),
        freeText,
        programRating,
        workoutPattern,
      };

      if (clientType === 'fitness') {
        payload.strengthGain = strengthGain;
        payload.energyLevel = energyLevel;
        payload.dietAdherence = dietAdherence;
      } else if (clientType === 'knee_injury') {
        payload.painReduction = painReduction;
        payload.movementImprovement = movementImprovement;
        payload.kneeStiffness = kneeStiffness;
      } else if (clientType === 'back_injury') {
        payload.painReduction = painReduction;
        payload.movementImprovement = movementImprovement;
        payload.sharpPain = sharpPain;
      } else if (clientType === 'shoulder_injury') {
        payload.painReduction = painReduction;
        payload.overheadReach = overheadReach;
        payload.sleepAffected = sleepAffected;
      }

      await addDoc(collection(db, 'weeklyCheckIns'), payload).catch(err => {
        handleFirestoreError(err, OperationType.CREATE, 'weeklyCheckIns');
      });

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 3000);
    } catch (err) {
      console.error('Check-in error:', err);
      setValidationError('Failed to submit weekly check-in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getClientTypeLabel = (type: ClientType) => {
    switch (type) {
      case 'fitness': return 'Fitness';
      case 'knee_injury': return 'Knee Injury Rehab';
      case 'back_injury': return 'Back Injury Rehab';
      case 'shoulder_injury': return 'Shoulder Injury Rehab';
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
            <h3 className="text-2xl font-black tracking-tight text-white">Check-In Completed!</h3>
            <p className="text-zinc-400 max-w-md font-medium">
              Thanks! Nik will review this before your next session 🙌
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
                  {getClientTypeLabel(clientType)}
                </span>
                <span className="text-zinc-500 text-xs font-semibold">Week of {weekOf}</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white">
                How was your training & body this week?
              </h2>
              <p className="text-sm text-zinc-400 mt-2">
                Help Nik tailor your upcoming program changes by answering these specialized questions.
              </p>
            </div>

            {validationError && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl flex items-center gap-3 text-sm font-semibold">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            <div className="space-y-6 divide-y divide-zinc-900">
              {/* Question Sets depending on Type */}
              {clientType === 'fitness' && (
                <div className="space-y-6">
                  {/* Q1: Did you feel stronger this week? -> Yes/No Toggle */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-zinc-200">
                      Did you feel stronger this week?
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      {['yes', 'no'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setStrengthGain(val as 'yes' | 'no')}
                          className={`py-3.5 px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                            strengthGain === val
                              ? 'bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/20'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q2: Workout Pattern -> Boring/Interesting */}
                  <div className="space-y-3 pt-6">
                    <label className="text-sm font-bold text-zinc-200">
                      How was your workout pattern?
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      {['boring', 'interesting'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setWorkoutPattern(val as 'boring' | 'interesting')}
                          className={`py-3.5 px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                            workoutPattern === val
                              ? 'bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/20'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q3: Energy Level -> 1-5 Star Tap */}
                  <div className="space-y-3 pt-6">
                    <label className="text-sm font-bold text-zinc-200 block">
                      Energy level this week:
                    </label>
                    <div className="flex items-center gap-3">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setEnergyLevel(star)}
                          className="focus:outline-none transition-transform active:scale-95"
                        >
                          <Star
                            className={`w-10 h-10 transition-all ${
                              star <= energyLevel
                                ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]'
                                : 'text-zinc-700 hover:text-zinc-500'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q4: Nutrition plan adherence -> Yes, Partially, No (3 Button select) */}
                  <div className="space-y-3 pt-6">
                    <label className="text-sm font-bold text-zinc-200">
                      Did you follow your nutrition plan?
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {['yes', 'partially', 'no'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setDietAdherence(val as 'yes' | 'partially' | 'no')}
                          className={`py-3 px-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                            dietAdherence === val
                              ? 'bg-orange-500 border-orange-400 text-white'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Knee Injury Form */}
              {clientType === 'knee_injury' && (
                <div className="space-y-6">
                  {/* Q1: pain reduction -> Slight, Moderate, No */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-zinc-200 block">
                      Did you experience pain reduction this week?
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {['slight', 'moderate', 'no'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setPainReduction(val as 'slight' | 'moderate' | 'no')}
                          className={`py-3 px-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                            painReduction === val
                              ? 'bg-orange-500 border-orange-400 text-white'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q2: movement improvement -> Slight, Moderate, No */}
                  <div className="space-y-3 pt-6">
                    <label className="text-sm font-bold text-zinc-200 block">
                      Daily movement improvement?
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {['slight', 'moderate', 'no'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setMovementImprovement(val as 'slight' | 'moderate' | 'no')}
                          className={`py-3 px-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                            movementImprovement === val
                              ? 'bg-orange-500 border-orange-400 text-white'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q3: was knee stiff today? Toggle */}
                  <div className="space-y-3 pt-6">
                    <label className="text-sm font-bold text-zinc-200 block">
                      Was your knee stiff today?
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      {['yes', 'no'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setKneeStiffness(val as 'yes' | 'no')}
                          className={`py-3.5 px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                            kneeStiffness === val
                              ? 'bg-orange-500 border-orange-400 text-white'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q4: workout pattern */}
                  <div className="space-y-3 pt-6">
                    <label className="text-sm font-bold text-zinc-200">
                      How was your workout pattern?
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      {['boring', 'interesting'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setWorkoutPattern(val as 'boring' | 'interesting')}
                          className={`py-3.5 px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                            workoutPattern === val
                              ? 'bg-orange-500 border-orange-400 text-white'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Back Injury Form */}
              {clientType === 'back_injury' && (
                <div className="space-y-6">
                  {/* Q1: pain reduction */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-zinc-200 block">
                      Pain reduction this week?
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {['slight', 'moderate', 'no'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setPainReduction(val as 'slight' | 'moderate' | 'no')}
                          className={`py-3 px-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                            painReduction === val
                              ? 'bg-orange-500 border-orange-400 text-white'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q2: movement improvement */}
                  <div className="space-y-3 pt-6">
                    <label className="text-sm font-bold text-zinc-200 block">
                      Daily movement improvement?
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {['slight', 'moderate', 'no'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setMovementImprovement(val as 'slight' | 'moderate' | 'no')}
                          className={`py-3 px-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                            movementImprovement === val
                              ? 'bg-orange-500 border-orange-400 text-white'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q3: sharp pain Toggle */}
                  <div className="space-y-3 pt-6">
                    <label className="text-sm font-bold text-zinc-200 block">
                      Did you feel any sharp pain during exercises?
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      {['yes', 'no'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setSharpPain(val as 'yes' | 'no')}
                          className={`py-3.5 px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                            sharpPain === val
                              ? 'bg-orange-500 border-orange-400 text-white'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q4: workout pattern */}
                  <div className="space-y-3 pt-6">
                    <label className="text-sm font-bold text-zinc-200">
                      How was your workout pattern?
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      {['boring', 'interesting'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setWorkoutPattern(val as 'boring' | 'interesting')}
                          className={`py-3.5 px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                            workoutPattern === val
                              ? 'bg-orange-500 border-orange-400 text-white'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Shoulder Injury Form */}
              {clientType === 'shoulder_injury' && (
                <div className="space-y-6">
                  {/* Q1: pain reduction */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-zinc-200 block">
                      Pain reduction this week?
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {['slight', 'moderate', 'no'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setPainReduction(val as 'slight' | 'moderate' | 'no')}
                          className={`py-3 px-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                            painReduction === val
                              ? 'bg-orange-500 border-orange-400 text-white'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q2: overhead reach Toggle */}
                  <div className="space-y-3 pt-6">
                    <label className="text-sm font-bold text-zinc-200 block">
                      Overhead reach improvement?
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      {['yes', 'no'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setOverheadReach(val as 'yes' | 'no')}
                          className={`py-3.5 px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                            overheadReach === val
                              ? 'bg-orange-500 border-orange-400 text-white'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q3: sleep affected Toggle */}
                  <div className="space-y-3 pt-6">
                    <label className="text-sm font-bold text-zinc-200 block">
                      Is pain affecting your sleep?
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      {['yes', 'no'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setSleepAffected(val as 'yes' | 'no')}
                          className={`py-3.5 px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                            sleepAffected === val
                              ? 'bg-orange-500 border-orange-400 text-white'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q4: workout pattern */}
                  <div className="space-y-3 pt-6">
                    <label className="text-sm font-bold text-zinc-200">
                      How was your workout pattern?
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      {['boring', 'interesting'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setWorkoutPattern(val as 'boring' | 'interesting')}
                          className={`py-3.5 px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                            workoutPattern === val
                              ? 'bg-orange-500 border-orange-400 text-white'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Shared Question Q5: Program Rating (0-5 stars) */}
              <div className="space-y-3 pt-6">
                <label className="text-sm font-bold text-zinc-200 block">
                  Rate last week's program:
                </label>
                <div className="flex items-center gap-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setProgramRating(star)}
                      className="focus:outline-none transition-transform active:scale-95"
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

              {/* Shared Question Q6: Free text field anything else (optional) */}
              <div className="space-y-3 pt-6">
                <label className="text-sm font-bold text-zinc-200 block">
                  {clientType === 'fitness' ? 'Anything else?' : 'Any pain notes, limitations or comments? (optional)'}
                </label>
                <textarea
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder="Tell Nik how you felt, where you struggled, or any milestones..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-5 text-sm focus:ring-1 focus:ring-orange-500 outline-none min-h-[120px] text-zinc-100 placeholder:text-zinc-600"
                />
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
