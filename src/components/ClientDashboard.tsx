import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, Workout, Exercise, Feedback } from '../types';
import { CheckCircle, ExternalLink, Play, MessageSquare, Trophy, Calendar, Dumbbell, ChevronRight, Sparkles, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { generateMotivationalMessage } from '../lib/gemini';

interface ClientDashboardProps {
  user: User;
  profile: UserProfile;
}

export default function ClientDashboard({ user, profile }: ClientDashboardProps) {
  const [currentWorkout, setCurrentWorkout] = useState<Workout | null>(null);
  const [lastFeedback, setLastFeedback] = useState<Feedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [clientNote, setClientNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Get the latest workout assigned to this client
    const q = query(
      collection(db, 'workouts'), 
      where('clientId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data() as Workout;
        setCurrentWorkout({ id: snapshot.docs[0].id, ...data });
      }
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [user.uid]);

  useEffect(() => {
    // Get the latest feedback to show motivational message
    const q = query(
      collection(db, 'feedback'),
      where('clientId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setLastFeedback({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Feedback);
      }
    });

    return () => unsubscribe();
  }, [user.uid]);

  const handleComplete = async () => {
    if (!currentWorkout) return;
    setSubmitting(true);
    try {
      const motivationalMessage = await generateMotivationalMessage(profile.displayName || 'Champ', currentWorkout.weekNumber);
      
      await addDoc(collection(db, 'feedback'), {
        clientId: user.uid,
        workoutId: currentWorkout.id,
        weekNumber: currentWorkout.weekNumber,
        dayNumber: currentWorkout.dayNumber,
        completionStatus: true,
        clientNote: clientNote,
        motivationalMessage,
        createdAt: serverTimestamp()
      });
      
      setShowFeedbackForm(false);
      setClientNote('');
    } catch (error) {
      console.error('Error submitting feedback:', error);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <Dumbbell className="w-12 h-12 text-orange-500 opacity-50" />
        </motion.div>
        <p className="text-zinc-500 font-medium">Loading your routine...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {lastFeedback?.motivationalMessage && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-orange-500/10 border border-orange-500/20 p-6 rounded-2xl relative overflow-hidden"
        >
          <Sparkles className="absolute -right-2 -top-2 w-16 h-16 text-orange-500/10 rotate-12" />
          <div className="flex items-start gap-4">
            <div className="p-3 bg-orange-500 rounded-full text-white shadow-lg shadow-orange-500/20">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-orange-500 text-sm uppercase tracking-wider mb-1">Coach Nik says:</h4>
              <p className="text-white text-lg font-medium leading-relaxed italic">
                "{lastFeedback.motivationalMessage}"
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {currentWorkout ? (
        <div className="space-y-6">
          <div className="flex items-end justify-between px-2">
            <div>
              <div className="flex items-center gap-2 text-orange-500 font-bold text-sm uppercase tracking-widest mb-1">
                <Calendar className="w-4 h-4" />
                Week {currentWorkout.weekNumber} • Day {currentWorkout.dayNumber}
              </div>
              <h2 className="text-3xl font-bold tracking-tight">Today's Session</h2>
            </div>
            <div className="text-right">
              <span className="text-zinc-500 text-sm font-medium">{currentWorkout.exercises.length} Exercises</span>
            </div>
          </div>

          <div className="space-y-4">
            {currentWorkout.exercises.map((ex, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="group bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-all"
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold group-hover:text-orange-500 transition-colors">{ex.name}</h3>
                    <div className="flex flex-wrap gap-3 mt-2">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-950 rounded-lg border border-zinc-800 text-xs font-bold text-zinc-400">
                        <span className="text-orange-500">{ex.sets}</span> SETS
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-950 rounded-lg border border-zinc-800 text-xs font-bold text-zinc-400">
                        <span className="text-orange-500">{ex.reps}</span> REPS
                      </div>
                      {ex.weight && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-950 rounded-lg border border-zinc-800 text-xs font-bold text-zinc-400">
                          <span className="text-orange-500">{ex.weight}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-950 rounded-lg border border-zinc-800 text-xs font-bold text-zinc-400">
                        <span className="text-orange-500">{ex.rest}</span> REST
                      </div>
                    </div>
                  </div>
                  
                  {ex.youtubeLink && (
                    <a
                      href={ex.youtubeLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl hover:bg-orange-500 hover:border-orange-500 hover:text-white transition-all text-zinc-400"
                    >
                      <Play className="w-5 h-5 fill-current" />
                    </a>
                  )}
                </div>

                {ex.coachNote && (
                  <div className="flex gap-2 items-start bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50 text-sm text-zinc-400">
                    <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0 text-orange-500/50" />
                    <p>{ex.coachNote}</p>
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          <AnimatePresence>
            {!showFeedbackForm ? (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => setShowFeedbackForm(true)}
                className="w-full bg-orange-500 text-white font-bold py-5 rounded-2xl hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-3 text-lg"
              >
                <CheckCircle className="w-6 h-6" />
                Complete Workout
              </motion.button>
            ) : (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4"
              >
                <h3 className="font-bold text-xl">How was the session?</h3>
                <textarea
                  value={clientNote}
                  onChange={(e) => setClientNote(e.target.value)}
                  placeholder="Any notes for Coach Nik? (e.g. weight felt light, knee felt a bit tight...)"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm focus:ring-1 focus:ring-orange-500 outline-none min-h-[120px]"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowFeedbackForm(false)}
                    className="flex-1 py-4 px-6 border border-zinc-800 rounded-xl font-bold text-zinc-400 hover:bg-zinc-800 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleComplete}
                    disabled={submitting}
                    className="flex-[2] bg-orange-500 text-white font-bold py-4 px-6 rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-all shadow-lg shadow-orange-500/20"
                  >
                    {submitting ? 'Submitting...' : 'Submit & Finish'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="py-20 text-center space-y-6">
          <div className="inline-flex p-6 bg-zinc-900 rounded-full border border-zinc-800">
            <Activity className="w-12 h-12 text-zinc-700" />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-bold">No Workout Assigned</h3>
            <p className="text-zinc-500 max-w-xs mx-auto">
              Coach Nik hasn't assigned your next routine yet. Check back soon!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
