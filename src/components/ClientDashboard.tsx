import { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, limit, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, Workout, Exercise, Feedback, BodyMetrics } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { 
  CheckCircle, 
  ExternalLink, 
  Play, 
  MessageSquare, 
  Trophy, 
  Calendar as CalendarIcon, 
  Dumbbell, 
  ChevronRight, 
  Sparkles, 
  Activity, 
  X,
  LayoutDashboard,
  Target,
  Folder,
  Utensils,
  TrendingUp,
  Award,
  Users,
  User as UserIcon,
  ChevronLeft,
  Clock,
  MessageCircle,
  Droplets,
  Footprints,
  Flame,
  Plus,
  Save,
  Scale,
  Loader2,
  Trash2,
  Upload,
  Camera,
  Settings,
  User as UserIcon2,
  LogOut,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import Chat from './Chat';
import { generateMotivationalMessage, analyzeMealImage, analyzeMealText } from '../lib/gemini';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  subDays,
  isToday,
  parseISO,
  startOfDay,
  differenceInDays
} from 'date-fns';

const StreakDisplay = ({ history }: { history: BodyMetrics[] }) => {
  const calculateStreak = () => {
    if (history.length === 0) return 0;
    const sorted = [...history].sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());
    
    let streak = 0;
    let current = new Date();
    
    // If last log wasn't today or yesterday, streak is broken
    const lastLogDate = parseISO(sorted[0].date);
    if (differenceInDays(current, lastLogDate) > 1) return 0;

    for (let i = 0; i < sorted.length; i++) {
      const logDate = parseISO(sorted[i].date);
      if (i === 0) {
        streak = 1;
      } else {
        const prevLogDate = parseISO(sorted[i-1].date);
        if (differenceInDays(prevLogDate, logDate) === 1) {
          streak++;
        } else {
          break;
        }
      }
    }
    return streak;
  };

  const streak = calculateStreak();

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex items-center justify-between overflow-hidden relative group">
      <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
        <Flame className="w-32 h-32 text-orange-500" />
      </div>
      <div className="space-y-1">
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Current Streak</p>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-black text-white">{streak}</span>
          <span className="text-zinc-400 font-medium">Days</span>
        </div>
      </div>
      <div className="flex gap-1">
        {[...Array(7)].map((_, i) => {
          const isActive = i < streak % 7 || (streak > 0 && streak % 7 === 0);
          return (
            <div 
              key={i} 
              className={cn(
                "w-2 h-8 rounded-full transition-all duration-500",
                isActive ? "bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]" : "bg-zinc-800"
              )} 
            />
          );
        })}
      </div>
    </div>
  );
};

const QuickLog = ({ todayMetrics, onLog }: { todayMetrics: BodyMetrics | null, onLog: (data: Partial<BodyMetrics>) => void }) => {
  if (todayMetrics && todayMetrics.waterIntake > 0 && todayMetrics.stepCount > 0) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-orange-500 rounded-[32px] p-8 text-black shadow-2xl shadow-orange-500/20"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <h3 className="text-2xl font-black uppercase tracking-tight leading-none">Quick Log</h3>
          <p className="text-black/70 font-medium">Keep the momentum going! Log your vitals.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {!todayMetrics?.waterIntake && (
            <button 
              onClick={() => onLog({ waterIntake: 250 })}
              className="bg-black text-white px-6 py-3 rounded-2xl font-bold text-sm hover:scale-105 transition-transform flex items-center gap-2"
            >
              <Droplets className="w-4 h-4" />
              +1 Glass Water
            </button>
          )}
          {!todayMetrics?.stepCount && (
            <button 
              onClick={() => onLog({ stepCount: 5000 })}
              className="bg-black text-white px-6 py-3 rounded-2xl font-bold text-sm hover:scale-105 transition-transform flex items-center gap-2"
            >
              <Footprints className="w-4 h-4" />
              Log 5k Steps
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell } from 'recharts';

function getYouTubeId(url: string) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

interface ClientDashboardProps {
  user: User;
  profile: UserProfile;
}

export default function ClientDashboard({ user, profile }: ClientDashboardProps) {
  const [currentWorkout, setCurrentWorkout] = useState<Workout | null>(null);
  const [allWorkouts, setAllWorkouts] = useState<Workout[]>([]);
  const [allFeedback, setAllFeedback] = useState<Feedback[]>([]);
  const [lastFeedback, setLastFeedback] = useState<Feedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [clientNote, setClientNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [adminProfile, setAdminProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'dash' | 'calendar' | 'goals' | 'program' | 'meal' | 'progress' | 'badges' | 'classes' | 'profile' | 'meal-ai'>('dash');
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [metrics, setMetrics] = useState<BodyMetrics[]>([]);
  const [todayMetrics, setTodayMetrics] = useState<BodyMetrics | null>(null);
  const [meals, setMeals] = useState<any[]>([]);

  // Helper to send automated coach messages
  const sendAutomatedCoachMessage = async (text: string, type: 'motivation' | 'reminder' = 'motivation') => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'admin'), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const adminUid = snap.docs[0].id;
        await addDoc(collection(db, 'messages'), {
          senderId: adminUid,
          receiverId: user.uid,
          text,
          isRead: false,
          type,
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error("Error sending automated message:", error);
    }
  };

  useEffect(() => {
    // Fetch admin profile for chat
    const q = query(collection(db, 'users'), where('role', '==', 'admin'));
    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        // Find the specific admin if possible, otherwise take the first one
        const adminDoc = snap.docs.find(d => d.data().email === 'fitwithnik79@gmail.com') || snap.docs[0];
        setAdminProfile({ uid: adminDoc.id, ...adminDoc.data() } as UserProfile);
      } else {
        // Fallback: search for the specific admin email if role check fails
        const q2 = query(collection(db, 'users'), where('email', '==', 'fitwithnik79@gmail.com'));
        getDocs(q2).then(snap2 => {
          if (!snap2.empty) {
            setAdminProfile({ uid: snap2.docs[0].id, ...snap2.docs[0].data() } as UserProfile);
          }
        }).catch(err => {
          console.error("Error fetching admin profile fallback:", err);
        });
      }
    }, (error) => {
      console.error("Error fetching admin profile:", error);
      // If permission denied, try a direct fetch for the specific admin email
      const q2 = query(collection(db, 'users'), where('email', '==', 'fitwithnik79@gmail.com'));
      getDocs(q2).then(snap2 => {
        if (!snap2.empty) {
          setAdminProfile({ uid: snap2.docs[0].id, ...snap2.docs[0].data() } as UserProfile);
        }
      }).catch(err => console.error("Final fallback failed:", err));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Fetch metrics
    const q = query(
      collection(db, 'metrics'),
      where('clientId', '==', user.uid),
      orderBy('date', 'desc'),
      limit(30)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const metricsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as BodyMetrics);
      setMetrics(metricsData);
      
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const today = metricsData.find(m => m.date === todayStr);
      setTodayMetrics(today || null);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'metrics');
    });

    return () => unsubscribe();
  }, [user.uid]);

  useEffect(() => {
    // Fetch meals
    const q = query(
      collection(db, 'meals'),
      where('clientId', '==', user.uid),
      orderBy('date', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const mealsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMeals(mealsData);
    }, (error) => {
      console.error("Error fetching meals:", error);
    });

    return () => unsubscribe();
  }, [user.uid]);

  useEffect(() => {
    // Fetch all workouts for calendar and program
    const qAll = query(
      collection(db, 'workouts'),
      where('clientId', '==', user.uid),
      orderBy('scheduledDate', 'desc')
    );

    const unsubscribe = onSnapshot(qAll, (snapshot) => {
      const workouts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Workout);
      setAllWorkouts(workouts);
      
      // Find today's workout
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const todayWorkout = workouts.find(w => w.scheduledDate === todayStr);
      
      if (todayWorkout) {
        setCurrentWorkout(todayWorkout);
      } else if (workouts.length > 0) {
        // Fallback to latest
        setCurrentWorkout(workouts[0]);
      }
      
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'workouts');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user.uid]);

  useEffect(() => {
    // Get feedback for the last 30 days
    const thirtyDaysAgo = subDays(new Date(), 30);
    const q = query(
      collection(db, 'feedback'),
      where('clientId', '==', user.uid),
      where('createdAt', '>=', thirtyDaysAgo),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const feedbacks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Feedback);
      setAllFeedback(feedbacks);
      if (feedbacks.length > 0) {
        setLastFeedback(feedbacks[0]);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'feedback');
    });

    return () => unsubscribe();
  }, [user.uid]);

  // Automated reminders for missed workouts/meals
  useEffect(() => {
    const checkMissedCheckins = async () => {
      const lastCheckKey = `last_checkin_reminder_${user.uid}_${format(new Date(), 'yyyy-MM-dd')}`;
      if (localStorage.getItem(lastCheckKey)) return;

      const yesterday = subDays(new Date(), 1);
      const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
      
      // Check for missed workout
      const wasWorkoutScheduled = allWorkouts.find(w => w.scheduledDate === yesterdayStr);
      const wasWorkoutCompleted = allFeedback.some(f => {
        if (!f.createdAt) return false;
        const fDate = (f.createdAt as any).toDate ? (f.createdAt as any).toDate() : new Date(f.createdAt as any);
        return isSameDay(fDate, yesterday);
      });

      if (wasWorkoutScheduled && !wasWorkoutCompleted) {
        await sendAutomatedCoachMessage("Hey champ! I noticed you missed your scheduled workout yesterday. Life happens, but let's get back on track today! You've got this. 💪", 'reminder');
      }

      // Check for missed meals
      const mealsYesterday = meals.filter(m => m.date === yesterdayStr);
      if (mealsYesterday.length === 0) {
        await sendAutomatedCoachMessage("Consistency is key in the kitchen too! Don't forget to log your meals so we can track your progress accurately. 🥗", 'reminder');
      }

      localStorage.setItem(lastCheckKey, 'true');
    };

    if (!loading && allWorkouts.length > 0 && allFeedback.length > 0) {
      checkMissedCheckins();
    }
  }, [loading, allWorkouts, allFeedback, meals, user.uid]);

  const handleComplete = async (workout: Workout, exerciseFeedback?: Record<number, { completedWeight: string, clientNote: string }>) => {
    setSubmitting(true);
    try {
      const motivationalMessage = await generateMotivationalMessage(profile.displayName || 'Champ', workout.weekNumber);
      
      // Update the workout document with the client's actual performance
      if (workout.id && exerciseFeedback) {
        const updatedExercises = workout.exercises.map((ex, idx) => ({
          ...ex,
          completedWeight: exerciseFeedback[idx]?.completedWeight || '',
          clientNote: exerciseFeedback[idx]?.clientNote || ''
        }));
        
        await updateDoc(doc(db, 'workouts', workout.id), {
          exercises: updatedExercises
        }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `workouts/${workout.id}`));
      }

      await addDoc(collection(db, 'feedback'), {
        clientId: user.uid,
        workoutId: workout.id,
        weekNumber: workout.weekNumber,
        dayNumber: workout.dayNumber,
        completionStatus: true,
        clientNote: clientNote,
        motivationalMessage,
        createdAt: serverTimestamp()
      }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'feedback'));

      // AI Milestone Messages
      const workoutCount = allWorkouts.filter(w => w.id && w.exercises.some(e => e.completedWeight)).length + 1;
      if (workoutCount === 1) {
        await sendAutomatedCoachMessage("Boom! First workout in the books. This is where the transformation begins! 🚀");
      } else if (workoutCount % 5 === 0) {
        await sendAutomatedCoachMessage(`Incredible consistency! You've crushed ${workoutCount} workouts. You're becoming unstoppable! 🔥`);
      } else {
        await sendAutomatedCoachMessage("Workout crushed! Proud of your effort today. Now refuel and recover well! 💪");
      }

      // Automatically send a message to the coach
      if (adminProfile) {
        await addDoc(collection(db, 'messages'), {
          senderId: user.uid,
          receiverId: adminProfile.uid,
          text: `Workout Completed! ${profile.displayName || 'Client'} finished Week ${workout.weekNumber} Day ${workout.dayNumber}. Notes: ${clientNote || 'No notes provided.'}`,
          isRead: false,
          type: 'motivation',
          createdAt: serverTimestamp()
        }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'messages'));
      }
      
      setShowFeedbackForm(false);
      setClientNote('');
      if (selectedWorkout?.id === workout.id) {
        setSelectedWorkout(null);
      }
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

  const sidebarItems = [
    { id: 'dash', label: 'Dash', icon: LayoutDashboard },
    { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
    { id: 'goals', label: 'Goals and Habits', icon: Target },
    { id: 'program', label: 'Training Program', icon: Folder },
    { id: 'meal-ai', label: 'Daily Nutrition', icon: Utensils },
    { id: 'progress', label: 'Progress', icon: TrendingUp },
    { id: 'profile', label: 'My Profile', icon: UserIcon },
  ];

  return (
    <div className="flex min-h-[calc(100vh-4rem)] bg-black text-white -m-4 sm:-m-8 relative">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-zinc-950 border-b border-zinc-900 z-[100] flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full overflow-hidden border border-zinc-800">
            <img 
              src={profile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`} 
              alt={profile.displayName || 'User'} 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <span className="font-bold text-sm">{profile.displayName}</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-zinc-400 hover:text-white"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Activity className="w-4 h-4" />}
        </button>
      </div>

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-[110] w-64 bg-zinc-950 border-r border-zinc-900 flex flex-col transition-transform duration-300 md:relative md:translate-x-0",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Profile Section */}
        <div className="p-8 flex flex-col items-center text-center space-y-4">
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-zinc-800">
              <img 
                src={profile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`} 
                alt={profile.displayName || 'User'} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-zinc-200">{profile.displayName || 'User'}</h3>
            <div className="flex flex-col gap-2 mt-4">
              <button 
                onClick={() => {
                  setShowChat(true);
                  setIsMobileMenuOpen(false);
                }}
                className="flex items-center gap-2 text-zinc-500 hover:text-orange-500 transition-colors text-sm font-medium"
              >
                <MessageCircle className="w-4 h-4" />
                Message
              </button>
              <button 
                onClick={() => {
                  setActiveTab('profile');
                  setIsMobileMenuOpen(false);
                }}
                className="flex items-center gap-2 text-zinc-500 hover:text-orange-500 transition-colors text-sm font-medium"
              >
                <UserIcon className="w-4 h-4" />
                View Profile
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 px-4 py-2 space-y-1 overflow-y-auto custom-scrollbar">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id as any);
                setIsMobileMenuOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all group",
                activeTab === item.id 
                  ? "bg-orange-500 text-black shadow-lg shadow-orange-500/20" 
                  : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900"
              )}
            >
              <item.icon className={cn(
                "w-5 h-5",
                activeTab === item.id ? "text-black" : "text-zinc-500 group-hover:text-zinc-200"
              )} />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[105] md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 pt-16 md:pt-0">
        <div className="flex-1 p-4 sm:p-8 overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'dash' && (
              <motion.div
                key="dash"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-4xl mx-auto space-y-8"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <StreakDisplay history={metrics} />
                  <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Today's Calories</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-black text-white">{todayMetrics?.calories || 0}</span>
                        <span className="text-zinc-400 font-medium">/ 2500</span>
                      </div>
                    </div>
                    <div className="w-16 h-16 rounded-full border-4 border-zinc-800 flex items-center justify-center relative">
                      <svg className="w-full h-full -rotate-90">
                        <circle
                          cx="32"
                          cy="32"
                          r="28"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="transparent"
                          className="text-zinc-800"
                        />
                        <circle
                          cx="32"
                          cy="32"
                          r="28"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="transparent"
                          strokeDasharray={175.9}
                          strokeDashoffset={175.9 - (175.9 * Math.min((todayMetrics?.calories || 0) / 2500, 1)) }
                          className="text-orange-500"
                        />
                      </svg>
                      <Flame className="w-6 h-6 text-orange-500 absolute inset-0 m-auto" />
                    </div>
                  </div>
                </div>

                <QuickLog 
                  todayMetrics={todayMetrics} 
                  onLog={async (data) => {
                    const dateStr = format(new Date(), 'yyyy-MM-dd');
                    const q = query(collection(db, 'metrics'), where('clientId', '==', user.uid), where('date', '==', dateStr));
                    const snap = await getDocs(q);
                    
                    if (!snap.empty) {
                      await updateDoc(doc(db, 'metrics', snap.docs[0].id), {
                        ...data,
                        createdAt: serverTimestamp()
                      });
                    } else {
                      await addDoc(collection(db, 'metrics'), {
                        clientId: user.uid,
                        date: dateStr,
                        waterIntake: 0,
                        stepCount: 0,
                        calories: 0,
                        ...data,
                        createdAt: serverTimestamp()
                      });
                    }
                  }} 
                />

                {lastFeedback?.motivationalMessage && (
                  <div className="bg-orange-500/10 border border-orange-500/20 p-6 rounded-2xl relative overflow-hidden">
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
                  </div>
                )}

                {currentWorkout ? (
                  <WorkoutCard 
                    workout={currentWorkout} 
                    onComplete={() => setShowFeedbackForm(true)}
                    showFeedbackForm={showFeedbackForm}
                    setShowFeedbackForm={setShowFeedbackForm}
                    clientNote={clientNote}
                    setClientNote={setClientNote}
                    submitting={submitting}
                    handleComplete={(feedback) => handleComplete(currentWorkout, feedback)}
                  />
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
              </motion.div>
            )}

            {activeTab === 'profile' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <ProfileSection user={user} profile={profile} setShowChat={setShowChat} />
              </motion.div>
            )}

            {activeTab === 'meal-ai' && (
              <motion.div
                key="meal-ai"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <MealAI 
                  user={user} 
                  todayMetrics={todayMetrics} 
                  metrics={metrics}
                  meals={meals}
                  sendAutomatedCoachMessage={sendAutomatedCoachMessage} 
                />
              </motion.div>
            )}

            {activeTab === 'calendar' && (
              <motion.div
                key="calendar"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-6xl mx-auto"
              >
                <ClientCalendar 
                  workouts={allWorkouts} 
                  onSelectWorkout={(w) => setSelectedWorkout(w)} 
                />
              </motion.div>
            )}

            {activeTab === 'program' && (
              <motion.div
                key="program"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-4xl mx-auto space-y-6"
              >
                <div className="flex items-center gap-4 mb-8">
                  <div className="p-3 bg-orange-500 rounded-2xl text-white shadow-lg shadow-orange-500/20">
                    <Folder className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold">Training Program</h2>
                    <p className="text-zinc-500">All your assigned workouts in one place.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {allWorkouts.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => setSelectedWorkout(w)}
                      className="text-left p-6 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-orange-500/50 transition-all group"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-orange-500 font-bold text-xs uppercase tracking-widest">
                          <CalendarIcon className="w-3 h-3" />
                          {w.scheduledDate ? format(parseISO(w.scheduledDate), 'MMM do, yyyy') : 'Unscheduled'}
                        </div>
                        <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-orange-500 transition-colors" />
                      </div>
                      <h3 className="text-xl font-bold mb-2">Week {w.weekNumber} • Day {w.dayNumber}</h3>
                      <p className="text-zinc-500 text-sm">{w.exercises.length} Exercises</p>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'progress' && (
              <motion.div
                key="progress"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-4xl mx-auto space-y-8"
              >
                <div className="flex items-center gap-4 mb-8">
                  <div className="p-3 bg-orange-500 rounded-2xl text-white shadow-lg shadow-orange-500/20">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold">Your Progress</h2>
                    <p className="text-zinc-500">Track your consistency and body metrics.</p>
                  </div>
                </div>

                <MetricsTracker 
                  user={user} 
                  todayMetrics={todayMetrics} 
                  history={metrics} 
                  meals={meals}
                  allWorkouts={allWorkouts}
                  allFeedback={allFeedback}
                />

                {/* Nutrition Breakdown */}
                <div className="bg-zinc-900 p-8 rounded-[32px] border border-zinc-800 space-y-6">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Flame className="w-5 h-5 text-orange-500" />
                    Daily Nutrition Breakdown
                  </h3>
                  <div className="grid grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <div className="flex justify-between items-end">
                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Protein</span>
                        <span className="text-lg font-bold text-blue-400">{todayMetrics?.protein || 0}g</span>
                      </div>
                      <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min((todayMetrics?.protein || 0) / 2, 100)}%` }}
                          className="h-full bg-blue-400" 
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-end">
                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Carbs</span>
                        <span className="text-lg font-bold text-green-400">{todayMetrics?.carbs || 0}g</span>
                      </div>
                      <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min((todayMetrics?.carbs || 0) / 3, 100)}%` }}
                          className="h-full bg-green-400" 
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-end">
                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Fats</span>
                        <span className="text-lg font-bold text-yellow-400">{todayMetrics?.fats || 0}g</span>
                      </div>
                      <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min((todayMetrics?.fats || 0) / 1, 100)}%` }}
                          className="h-full bg-yellow-400" 
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <Scale className="w-5 h-5 text-purple-500" />
                      Weight Progress
                    </h3>
                    <div className="h-[200px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={[...metrics].reverse()}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                          <XAxis 
                            dataKey="date" 
                            stroke="#71717a" 
                            fontSize={10} 
                            tickFormatter={(str) => format(parseISO(str), 'MMM d')}
                          />
                          <YAxis stroke="#71717a" fontSize={10} domain={['auto', 'auto']} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                            itemStyle={{ color: '#a855f7' }}
                          />
                          <Line type="monotone" dataKey="weight" stroke="#a855f7" strokeWidth={3} dot={{ fill: '#a855f7', r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <Flame className="w-5 h-5 text-orange-500" />
                      Calorie Intake
                    </h3>
                    <div className="h-[200px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={[...metrics].reverse()}>
                          <defs>
                            <linearGradient id="colorCalories" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                          <XAxis 
                            dataKey="date" 
                            stroke="#71717a" 
                            fontSize={10} 
                            tickFormatter={(str) => format(parseISO(str), 'MMM d')}
                          />
                          <YAxis stroke="#71717a" fontSize={10} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                            itemStyle={{ color: '#f97316' }}
                          />
                          <Area type="monotone" dataKey="calories" stroke="#f97316" fillOpacity={1} fill="url(#colorCalories)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <Footprints className="w-5 h-5 text-blue-500" />
                      Step Count
                    </h3>
                    <div className="h-[200px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={[...metrics].reverse()}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                          <XAxis 
                            dataKey="date" 
                            stroke="#71717a" 
                            fontSize={10} 
                            tickFormatter={(str) => format(parseISO(str), 'MMM d')}
                          />
                          <YAxis stroke="#71717a" fontSize={10} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                            itemStyle={{ color: '#3b82f6' }}
                          />
                          <Line type="monotone" dataKey="stepCount" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {['goals', 'meal', 'badges', 'classes'].includes(activeTab) && (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="h-full flex flex-col items-center justify-center text-center space-y-4 py-20"
              >
                <div className="p-6 bg-zinc-900 rounded-full border border-zinc-800">
                  {activeTab === 'goals' && <Target className="w-12 h-12 text-zinc-700" />}
                  {activeTab === 'meal' && <Utensils className="w-12 h-12 text-zinc-700" />}
                  {activeTab === 'progress' && <TrendingUp className="w-12 h-12 text-zinc-700" />}
                  {activeTab === 'badges' && <Award className="w-12 h-12 text-zinc-700" />}
                  {activeTab === 'classes' && <Users className="w-12 h-12 text-zinc-700" />}
                </div>
                <div>
                  <h3 className="text-2xl font-bold capitalize">{activeTab.replace(/([A-Z])/g, ' $1')}</h3>
                  <p className="text-zinc-500 max-w-xs mx-auto">
                    This section is being customized for your fitness journey. Stay tuned!
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Workout Detail Modal */}
      <AnimatePresence>
        {selectedWorkout && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedWorkout(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-3xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                <div>
                  <div className="flex items-center gap-2 text-orange-500 font-bold text-xs uppercase tracking-widest mb-1">
                    <CalendarIcon className="w-3 h-3" />
                    Week {selectedWorkout.weekNumber} • Day {selectedWorkout.dayNumber}
                  </div>
                  <h3 className="font-bold text-xl">Workout Details</h3>
                </div>
                <button 
                  onClick={() => setSelectedWorkout(null)}
                  className="p-2 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-500 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                <WorkoutCard 
                  workout={selectedWorkout} 
                  onComplete={() => setShowFeedbackForm(true)}
                  showFeedbackForm={showFeedbackForm}
                  setShowFeedbackForm={setShowFeedbackForm}
                  clientNote={clientNote}
                  setClientNote={setClientNote}
                  submitting={submitting}
                  handleComplete={(feedback) => handleComplete(selectedWorkout, feedback)}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Chat Button (Mobile) */}
      <div className="fixed bottom-6 right-6 z-[60] md:hidden">
        <button
          onClick={() => setShowChat(!showChat)}
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95",
            showChat ? "bg-zinc-800 text-white" : "bg-orange-500 text-white shadow-orange-500/20"
          )}
        >
          {showChat ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
        </button>
      </div>

      {/* Chat Sidebar/Modal */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            className="fixed bottom-24 right-6 z-[110] w-[calc(100vw-3rem)] sm:w-96 h-[600px] max-h-[calc(100vh-10rem)] shadow-2xl"
          >
            {adminProfile ? (
              <Chat 
                currentUser={{ uid: user.uid, role: profile.role }} 
                otherUser={adminProfile} 
                onClose={() => setShowChat(false)}
              />
            ) : (
              <div className="flex flex-col h-full bg-zinc-950 rounded-3xl border border-zinc-800 overflow-hidden shadow-2xl">
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-500/10 rounded-lg text-orange-500">
                      <MessageCircle className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-sm">Chat with Coach</h3>
                  </div>
                  <button onClick={() => setShowChat(false)} className="p-2 hover:bg-zinc-800 rounded-xl text-zinc-500">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800">
                    <Loader2 className="w-8 h-8 text-zinc-700 animate-spin" />
                  </div>
                  <div className="space-y-2">
                    <p className="font-bold text-zinc-300">Connecting to Coach...</p>
                    <p className="text-xs text-zinc-500">We're setting up your secure connection to Coach Nik.</p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MetricsTracker({ 
  user, 
  todayMetrics, 
  history,
  meals,
  allWorkouts,
  allFeedback
}: { 
  user: User, 
  todayMetrics: BodyMetrics | null, 
  history: BodyMetrics[],
  meals: any[],
  allWorkouts: Workout[],
  allFeedback: Feedback[]
}) {
  const [water, setWater] = useState(todayMetrics?.waterIntake || 0);
  const [steps, setSteps] = useState(todayMetrics?.stepCount || 0);
  const [calories, setCalories] = useState(todayMetrics?.calories || 0);
  const [protein, setProtein] = useState(todayMetrics?.protein || 0);
  const [carbs, setCarbs] = useState(todayMetrics?.carbs || 0);
  const [fats, setFats] = useState(todayMetrics?.fats || 0);
  const [weight, setWeight] = useState(todayMetrics?.weight || 0);
  const [isSaving, setIsSaving] = useState(false);

  const consistencyData = useMemo(() => {
    const data = [];
    for (let i = 29; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dateStr = format(date, 'yyyy-MM-dd');
      
      const wasScheduled = allWorkouts.find(w => w.scheduledDate === dateStr);
      const wasCompleted = allFeedback.find(f => {
        if (!f.createdAt) return false;
        const fDate = (f.createdAt as any).toDate ? (f.createdAt as any).toDate() : new Date(f.createdAt as any);
        return isSameDay(fDate, date);
      });

      let status = 'none';
      if (wasScheduled && wasCompleted) status = 'completed';
      else if (wasScheduled && !wasCompleted && date < startOfDay(new Date())) status = 'missed';
      else if (wasScheduled) status = 'scheduled';

      data.push({
        dateStr,
        displayDate: format(date, 'MMM d'),
        value: 1,
        status
      });
    }
    return data;
  }, [allWorkouts, allFeedback]);

  useEffect(() => {
    if (todayMetrics) {
      setWater(todayMetrics.waterIntake);
      setSteps(todayMetrics.stepCount);
      setCalories(todayMetrics.calories);
      setProtein(todayMetrics.protein || 0);
      setCarbs(todayMetrics.carbs || 0);
      setFats(todayMetrics.fats || 0);
      setWeight(todayMetrics.weight || 0);
    }
  }, [todayMetrics]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const metricsData = {
        clientId: user.uid,
        date: todayStr,
        waterIntake: Number(water),
        stepCount: Number(steps),
        calories: Number(calories),
        protein: Number(protein),
        carbs: Number(carbs),
        fats: Number(fats),
        weight: Number(weight),
        createdAt: serverTimestamp()
      };

      if (todayMetrics?.id) {
        await updateDoc(doc(db, 'metrics', todayMetrics.id), metricsData)
          .catch(err => handleFirestoreError(err, OperationType.UPDATE, `metrics/${todayMetrics.id}`));
      } else {
        await addDoc(collection(db, 'metrics'), metricsData)
          .catch(err => handleFirestoreError(err, OperationType.CREATE, 'metrics'));
      }
    } catch (error) {
      console.error('Error saving metrics:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-blue-500/10 rounded-xl text-blue-500">
              <Droplets className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Water (ml)</span>
          </div>
          <input 
            type="number" 
            value={water} 
            onChange={(e) => setWater(Number(e.target.value))}
            className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-2 text-xl font-bold focus:ring-1 focus:ring-blue-500 outline-none"
          />
          <div className="flex gap-1">
            {[250, 500].map(amount => (
              <button 
                key={amount}
                onClick={() => setWater(prev => prev + amount)}
                className="flex-1 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-[10px] font-bold transition-colors"
              >
                +{amount}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-green-500/10 rounded-xl text-green-500">
              <Footprints className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Steps</span>
          </div>
          <input 
            type="number" 
            value={steps} 
            onChange={(e) => setSteps(Number(e.target.value))}
            className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-2 text-xl font-bold focus:ring-1 focus:ring-green-500 outline-none"
          />
          <p className="text-[10px] text-zinc-500 font-medium">Goal: 10k</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-orange-500/10 rounded-xl text-orange-500">
              <Flame className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Calories</span>
          </div>
          <input 
            type="number" 
            value={calories} 
            onChange={(e) => setCalories(Number(e.target.value))}
            className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-2 text-xl font-bold focus:ring-1 focus:ring-orange-500 outline-none"
          />
          <p className="text-[10px] text-zinc-500 font-medium">Daily Intake</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-purple-500/10 rounded-xl text-purple-500">
              <Scale className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Weight (kg)</span>
          </div>
          <input 
            type="number" 
            step="0.1"
            value={weight} 
            onChange={(e) => setWeight(Number(e.target.value))}
            className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-2 text-xl font-bold focus:ring-1 focus:ring-purple-500 outline-none"
          />
          <p className="text-[10px] text-zinc-500 font-medium">Current Weight</p>
        </div>
      </div>

      {/* Macronutrients Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Protein (g)</span>
          <input 
            type="number" 
            value={protein} 
            onChange={(e) => setProtein(Number(e.target.value))}
            className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-2 text-lg font-bold text-blue-400 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Carbs (g)</span>
          <input 
            type="number" 
            value={carbs} 
            onChange={(e) => setCarbs(Number(e.target.value))}
            className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-2 text-lg font-bold text-green-400 focus:ring-1 focus:ring-green-500 outline-none"
          />
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Fats (g)</span>
          <input 
            type="number" 
            value={fats} 
            onChange={(e) => setFats(Number(e.target.value))}
            className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-2 text-lg font-bold text-yellow-400 focus:ring-1 focus:ring-yellow-500 outline-none"
          />
        </div>
      </div>

      <button 
        onClick={handleSave}
        disabled={isSaving}
        className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-xl shadow-white/5"
      >
        {isSaving ? <Clock className="w-5 h-5 animate-spin" /> : <Save className="w-4 h-4" />}
        {isSaving ? 'Saving Progress...' : 'Save Today\'s Metrics'}
      </button>

      {/* Workout Consistency Chart */}
      <div className="bg-zinc-900 p-8 rounded-[32px] border border-zinc-800 space-y-6">
        <h3 className="text-xl font-bold flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-orange-500" />
          Workout Consistency (Last 30 Days)
        </h3>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={consistencyData}>
              <XAxis 
                dataKey="displayDate" 
                hide 
              />
              <YAxis hide domain={[0, 1]} />
              <Tooltip 
                cursor={{ fill: 'transparent' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-zinc-950 border border-zinc-800 p-2 rounded-lg text-[10px] font-bold">
                        <p className="text-zinc-500 mb-1">{data.displayDate}</p>
                        <p className={cn(
                          "uppercase tracking-widest",
                          data.status === 'completed' ? "text-green-500" :
                          data.status === 'missed' ? "text-red-500" :
                          data.status === 'scheduled' ? "text-orange-500" : "text-zinc-700"
                        )}>
                          {data.status}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="value" radius={[4, 4, 4, 4]}>
                {consistencyData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={
                      entry.status === 'completed' ? '#22c55e' : 
                      entry.status === 'missed' ? '#ef4444' : 
                      entry.status === 'scheduled' ? '#f97316' : '#27272a'
                    } 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-6 justify-center pt-4 border-t border-zinc-800/50">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Missed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Scheduled</span>
          </div>
        </div>
      </div>

      {/* Meal History List */}
      <div className="space-y-6 pt-8 border-t border-zinc-800/50">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Utensils className="w-5 h-5 text-orange-500" />
            Daily Meal Logs
          </h3>
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800">
            {meals.length} Logs
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {meals.length > 0 ? (
            meals.map((meal) => (
              <div 
                key={meal.id} 
                className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 hover:border-zinc-700 transition-all group"
              >
                <div className="flex items-start gap-4">
                  {meal.imageURL && (
                    <div className="w-20 h-20 rounded-2xl overflow-hidden border border-zinc-800 flex-shrink-0">
                      <img src={meal.imageURL} alt={meal.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border",
                        meal.type === 'Breakfast' ? "bg-orange-500/10 text-orange-500 border-orange-500/20" :
                        meal.type === 'Lunch' ? "bg-green-500/10 text-green-500 border-green-500/20" :
                        meal.type === 'Dinner' ? "bg-purple-500/10 text-purple-500 border-purple-500/20" :
                        "bg-blue-500/10 text-blue-500 border-blue-500/20"
                      )}>
                        {meal.type}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-bold">
                        {format(parseISO(meal.date), 'MMM d')}
                      </span>
                    </div>
                    <h4 className="font-bold text-white truncate">{meal.name}</h4>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <div className="bg-zinc-950 px-2 py-0.5 rounded-lg border border-zinc-800 text-[10px] font-bold">
                        <span className="text-orange-500 text-xs">{meal.totalCalories}</span> CAL
                      </div>
                      <div className="bg-zinc-950 px-2 py-0.5 rounded-lg border border-zinc-800 text-[10px] font-bold">
                        <span className="text-blue-500 text-xs">{meal.totalProtein}g</span> P
                      </div>
                      <div className="bg-zinc-950 px-2 py-0.5 rounded-lg border border-zinc-800 text-[10px] font-bold">
                        <span className="text-green-500 text-xs">{meal.totalCarbs}g</span> C
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {meal.items?.map((item: any, i: number) => (
                        <span key={i} className="text-[10px] text-zinc-500 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800/50">
                          {item.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-12 text-center bg-zinc-900/50 rounded-3xl border border-zinc-800 p-8 space-y-4">
              <div className="inline-flex p-4 bg-zinc-950 rounded-full text-zinc-800">
                <Utensils className="w-8 h-8" />
              </div>
              <p className="text-zinc-500 text-sm">No meals logged yet. Start tracking to see your history!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkoutCard({ 
  workout, 
  onComplete, 
  showFeedbackForm, 
  setShowFeedbackForm, 
  clientNote, 
  setClientNote, 
  submitting, 
  handleComplete 
}: { 
  workout: Workout, 
  onComplete: () => void,
  showFeedbackForm: boolean,
  setShowFeedbackForm: (s: boolean) => void,
  clientNote: string,
  setClientNote: (s: string) => void,
  submitting: boolean,
  handleComplete: (feedback?: Record<number, { completedWeight: string, clientNote: string }>) => void
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [exerciseFeedback, setExerciseFeedback] = useState<Record<number, { completedWeight: string, clientNote: string }>>({});

  const updateExerciseFeedback = (idx: number, field: 'completedWeight' | 'clientNote', value: string) => {
    setExerciseFeedback(prev => ({
      ...prev,
      [idx]: {
        ...prev[idx],
        [field]: value
      }
    }));
  };

  const handleCompleteClick = () => {
    setShowConfirm(true);
  };

  const confirmComplete = () => {
    setShowConfirm(false);
    onComplete();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between px-2">
        <div>
          <div className="flex items-center gap-2 text-orange-500 font-bold text-sm uppercase tracking-widest mb-1">
            <CalendarIcon className="w-4 h-4" />
            Week {workout.weekNumber} • Day {workout.dayNumber}
          </div>
          <h2 className="text-3xl font-bold tracking-tight">Workout Routine</h2>
        </div>
        <div className="text-right">
          <span className="text-zinc-500 text-sm font-medium">{workout.exercises.length} Exercises</span>
        </div>
      </div>

      <div className="space-y-4">
        {workout.exercises.map((ex, idx) => (
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
                <div className="flex flex-col gap-2">
                  <a 
                    href={ex.youtubeLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-orange-500 hover:text-orange-400 transition-colors text-sm font-bold"
                  >
                    <Play className="w-4 h-4" />
                    Watch Exercise Video
                  </a>
                </div>
              )}
            </div>

            {ex.coachNote && (
              <div className="flex gap-2 items-start bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50 text-sm text-zinc-400 mb-4">
                <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0 text-orange-500/50" />
                <p>{ex.coachNote}</p>
              </div>
            )}

            {ex.youtubeLink && getYouTubeId(ex.youtubeLink) && (
              <a 
                href={ex.youtubeLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block relative aspect-video rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 group/vid mb-4"
              >
                <img 
                  src={`https://img.youtube.com/vi/${getYouTubeId(ex.youtubeLink)}/mqdefault.jpg`}
                  alt="Exercise Video"
                  className="w-full h-full object-cover opacity-60 group-hover/vid:opacity-80 transition-opacity"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-xl shadow-orange-500/20 group-hover/vid:scale-110 transition-transform">
                    <Play className="w-6 h-6 fill-current" />
                  </div>
                </div>
                <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/50 backdrop-blur-md rounded text-[10px] font-bold text-white border border-white/10">
                  WATCH DEMO
                </div>
              </a>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-zinc-800/50">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Weight Used</label>
                <input 
                  type="text"
                  placeholder="e.g. 65kg"
                  value={exerciseFeedback[idx]?.completedWeight || ''}
                  onChange={(e) => updateExerciseFeedback(idx, 'completedWeight', e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm focus:ring-1 focus:ring-orange-500 outline-none transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Exercise Note</label>
                <input 
                  type="text"
                  placeholder="How did it feel?"
                  value={exerciseFeedback[idx]?.clientNote || ''}
                  onChange={(e) => updateExerciseFeedback(idx, 'clientNote', e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm focus:ring-1 focus:ring-orange-500 outline-none transition-all"
                />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {!showFeedbackForm ? (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={handleCompleteClick}
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
                onClick={() => handleComplete(exerciseFeedback)}
                disabled={submitting}
                className="flex-[2] bg-orange-500 text-white font-bold py-4 px-6 rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-all shadow-lg shadow-orange-500/20"
              >
                {submitting ? 'Submitting...' : 'Submit & Finish'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {showConfirm && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 max-w-md w-full shadow-2xl space-y-6"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500">
                  <CheckCircle className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold">Finish Workout?</h3>
                  <p className="text-zinc-400">Great job! Are you ready to mark this session as complete and leave your feedback?</p>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-4 px-6 border border-zinc-800 rounded-2xl font-bold text-zinc-400 hover:bg-zinc-800 transition-all"
                >
                  Not Yet
                </button>
                <button
                  onClick={confirmComplete}
                  className="flex-1 bg-orange-500 text-white font-bold py-4 px-6 rounded-2xl hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20"
                >
                  Yes, Finish
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MealAI({ 
  user, 
  todayMetrics, 
  metrics,
  meals,
  sendAutomatedCoachMessage 
}: { 
  user: User, 
  todayMetrics: BodyMetrics | null, 
  metrics: BodyMetrics[],
  meals: any[],
  sendAutomatedCoachMessage: (text: string, type?: 'motivation' | 'reminder') => Promise<void>
}) {
  const [image, setImage] = useState<string | null>(null);
  const [mealDescription, setMealDescription] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [logging, setLogging] = useState(false);
  const [manualItems, setManualItems] = useState<{ name: string, calories: number, protein: number, carbs: number, fats: number }[]>([]);
  const [newItem, setNewItem] = useState({ name: '', calories: 0, protein: 0, carbs: 0, fats: 0 });

  const [mealType, setMealType] = useState<'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'>('Lunch');

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!image && !mealDescription.trim()) return;
    setAnalyzing(true);
    try {
      let analysis;
      if (image) {
        const base64 = image.split(',')[1];
        const mimeType = image.split(';')[0].split(':')[1];
        analysis = await analyzeMealImage(base64, mimeType);
      } else {
        analysis = await analyzeMealText(mealDescription);
      }

      if (analysis) {
        setResult(analysis);
        // Add analyzed meal as a single item for now, or we could split it if AI returned items
        setManualItems([{
          name: analysis.mealName,
          calories: analysis.calories,
          protein: analysis.protein,
          carbs: analysis.carbs,
          fats: analysis.fats
        }]);
        setMealDescription('');
      }
    } catch (error) {
      console.error('Error analyzing meal:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  const addManualItem = () => {
    if (!newItem.name) return;
    setManualItems([...manualItems, newItem]);
    setNewItem({ name: '', calories: 0, protein: 0, carbs: 0, fats: 0 });
  };

  const removeManualItem = (index: number) => {
    setManualItems(manualItems.filter((_, i) => i !== index));
  };

  const totalMealMacros = manualItems.reduce((acc, item) => ({
    calories: acc.calories + Number(item.calories),
    protein: acc.protein + Number(item.protein),
    carbs: acc.carbs + Number(item.carbs),
    fats: acc.fats + Number(item.fats)
  }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

  const handleLogMeal = async () => {
    if (manualItems.length === 0) return;
    setLogging(true);
    try {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      
      const mealCounts = meals.filter(m => m.date === todayStr).length;
      
      // Save full meal details
      const mealData = {
        clientId: user.uid,
        date: todayStr,
        type: mealType,
        name: result?.mealName || (manualItems.length === 1 ? manualItems[0].name : `${mealType} Log`),
        items: manualItems,
        totalCalories: totalMealMacros.calories,
        totalProtein: totalMealMacros.protein,
        totalCarbs: totalMealMacros.carbs,
        totalFats: totalMealMacros.fats,
        imageURL: image || null,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'meals'), mealData)
        .catch(err => handleFirestoreError(err, OperationType.CREATE, 'meals'));

      const metricsData = {
        clientId: user.uid,
        date: todayStr,
        calories: (todayMetrics?.calories || 0) + totalMealMacros.calories,
        protein: (todayMetrics?.protein || 0) + totalMealMacros.protein,
        carbs: (todayMetrics?.carbs || 0) + totalMealMacros.carbs,
        fats: (todayMetrics?.fats || 0) + totalMealMacros.fats,
        waterIntake: todayMetrics?.waterIntake || 0,
        stepCount: todayMetrics?.stepCount || 0,
        weight: todayMetrics?.weight || 0,
        createdAt: serverTimestamp()
      };

      if (todayMetrics?.id) {
        await updateDoc(doc(db, 'metrics', todayMetrics.id), metricsData)
          .catch(err => handleFirestoreError(err, OperationType.UPDATE, `metrics/${todayMetrics.id}`));
      } else {
        await addDoc(collection(db, 'metrics'), metricsData)
          .catch(err => handleFirestoreError(err, OperationType.CREATE, 'metrics'));
      }

      // Automated Milestone: First meal tracked today
      if (mealCounts === 0) {
        await sendAutomatedCoachMessage("Great start to the day! Tracking your first meal is 80% of the battle. Keep it up! 🥗");
      } else if (mealCounts === 2) {
        await sendAutomatedCoachMessage("Consistency is key! You've tracked 3 meals today. Your body will thank you! 🌟");
      }

      setImage(null);
      setResult(null);
      setManualItems([]);
      alert('Meal logged successfully!');
    } catch (error) {
      console.error('Error logging meal:', error);
    } finally {
      setLogging(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <div className="inline-flex p-4 bg-orange-500/10 rounded-full text-orange-500 mb-4">
          <Sparkles className="w-8 h-8" />
        </div>
        <h2 className="text-3xl font-bold">Daily Nutrition Tracker</h2>
        <p className="text-zinc-500">Track your meals for the day using AI or manual entry.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 space-y-6">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-orange-500" />
              AI Meal Analysis
            </h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setMealType(t)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all border",
                      mealType === t 
                        ? "bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20" 
                        : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {!image ? (
                <div className="space-y-4">
                  <textarea
                    value={mealDescription}
                    onChange={(e) => setMealDescription(e.target.value)}
                    placeholder="Describe your meal (e.g. 2 eggs, 1 slice of whole wheat toast, and half an avocado)..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-sm outline-none focus:ring-1 focus:ring-orange-500 min-h-[100px] resize-none"
                  />
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-px bg-zinc-800" />
                    <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">OR</span>
                    <div className="flex-1 h-px bg-zinc-800" />
                  </div>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-3xl p-8 cursor-pointer hover:border-orange-500/50 transition-all group">
                    <div className="p-3 bg-zinc-950 rounded-2xl text-zinc-500 group-hover:text-orange-500 transition-colors mb-2">
                      <Upload className="w-6 h-6" />
                    </div>
                    <span className="text-zinc-400 text-xs font-bold">Upload Photo</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                  </label>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative aspect-video rounded-2xl overflow-hidden border border-zinc-800">
                    <img src={image} alt="Meal" className="w-full h-full object-cover" />
                    <button 
                      onClick={() => { setImage(null); setResult(null); }}
                      className="absolute top-4 right-4 p-2 bg-black/50 backdrop-blur-md rounded-full text-white hover:bg-black transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}

              <button 
                onClick={handleAnalyze}
                disabled={analyzing || (!image && !mealDescription.trim())}
                className="w-full py-4 bg-orange-500 text-white font-bold rounded-2xl hover:bg-orange-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
              >
                {analyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {analyzing ? 'Analyzing...' : 'Analyze with AI'}
              </button>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 space-y-6">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Plus className="w-5 h-5 text-orange-500" />
              Manual Entry
            </h3>
            <div className="space-y-4">
              <input 
                type="text" 
                placeholder="Food Item Name"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-orange-500"
              />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Calories</label>
                  <input 
                    type="number" 
                    placeholder="Cal"
                    value={newItem.calories || ''}
                    onChange={(e) => setNewItem({ ...newItem, calories: Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Protein (g)</label>
                  <input 
                    type="number" 
                    placeholder="P"
                    value={newItem.protein || ''}
                    onChange={(e) => setNewItem({ ...newItem, protein: Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Carbs (g)</label>
                  <input 
                    type="number" 
                    placeholder="C"
                    value={newItem.carbs || ''}
                    onChange={(e) => setNewItem({ ...newItem, carbs: Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Fats (g)</label>
                  <input 
                    type="number" 
                    placeholder="F"
                    value={newItem.fats || ''}
                    onChange={(e) => setNewItem({ ...newItem, fats: Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>
              <button 
                onClick={addManualItem}
                className="w-full py-3 bg-zinc-800 text-white font-bold rounded-xl hover:bg-zinc-700 transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Item
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 space-y-6 h-full flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold">Current Meal</h3>
              <div className="px-3 py-1 bg-orange-500/10 rounded-full text-[10px] font-bold text-orange-500 uppercase tracking-widest">
                {manualItems.length} Items
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto max-h-[400px] custom-scrollbar pr-2">
              {manualItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-12 text-zinc-600 space-y-2">
                  <Utensils className="w-12 h-12 opacity-20" />
                  <p className="text-sm font-medium">No items added yet.</p>
                </div>
              ) : (
                manualItems.map((item, i) => (
                  <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between group">
                    <div>
                      <h4 className="font-bold text-sm">{item.name}</h4>
                      <p className="text-[10px] text-zinc-500 font-medium">
                        {item.calories} kcal • P: {item.protein}g • C: {item.carbs}g • F: {item.fats}g
                      </p>
                    </div>
                    <button 
                      onClick={() => removeManualItem(i)}
                      className="p-2 text-zinc-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {manualItems.length > 0 && (
              <div className="pt-6 border-t border-zinc-800 space-y-6">
                <div className="grid grid-cols-4 gap-2">
                  <div className="text-center">
                    <div className="text-lg font-bold">{totalMealMacros.calories}</div>
                    <div className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">Cal</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-500">{totalMealMacros.protein}g</div>
                    <div className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">Prot</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-500">{totalMealMacros.carbs}g</div>
                    <div className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">Carb</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-yellow-500">{totalMealMacros.fats}g</div>
                    <div className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">Fat</div>
                  </div>
                </div>

                <button 
                  onClick={handleLogMeal}
                  disabled={logging}
                  className="w-full py-4 bg-orange-500 text-white font-bold rounded-2xl hover:bg-orange-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
                >
                  {logging ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {logging ? 'Logging...' : 'Log to Daily Total'}
                </button>
              </div>
            )}
          </div>

          {/* Daily Progress Summary */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 space-y-6">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-500" />
              Today's Total
            </h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-black">{todayMetrics?.calories || 0}</div>
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Calories</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-blue-500">{todayMetrics?.protein || 0}g</div>
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Protein</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-green-500">{todayMetrics?.carbs || 0}g</div>
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Carbs</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-yellow-500">{todayMetrics?.fats || 0}g</div>
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Fats</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileSection({ user, profile, setShowChat }: { user: User, profile: UserProfile, setShowChat: (s: boolean) => void }) {
  const [formData, setFormData] = useState({
    displayName: profile.displayName || '',
    photoURL: profile.photoURL || '',
    height: profile.height || '',
    weight: profile.weight || '',
    programGoals: profile.programGoals || '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      await updateDoc(doc(db, 'users', user.uid), formData)
        .catch(err => handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`));
      setMessage({ text: 'Profile updated successfully!', type: 'success' });
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage({ text: 'Failed to update profile.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">My Profile</h2>
          <p className="text-zinc-500">Manage your personal information and preferences.</p>
        </div>
        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-orange-500/20">
          <img 
            src={formData.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`} 
            alt="Profile" 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Display Name</label>
            <input 
              type="text" 
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-orange-500 outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Profile Picture URL</label>
            <input 
              type="text" 
              value={formData.photoURL}
              onChange={(e) => setFormData({ ...formData, photoURL: e.target.value })}
              placeholder="https://example.com/photo.jpg"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-orange-500 outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Height (cm)</label>
            <input 
              type="number" 
              value={formData.height}
              onChange={(e) => setFormData({ ...formData, height: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-orange-500 outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Weight (kg)</label>
            <input 
              type="number" 
              value={formData.weight}
              onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-orange-500 outline-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">My Fitness Goals</label>
          <textarea 
            value={formData.programGoals}
            onChange={(e) => setFormData({ ...formData, programGoals: e.target.value })}
            placeholder="What are you working towards?"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-orange-500 outline-none min-h-[100px]"
          />
        </div>

        {message && (
          <div className={cn(
            "p-4 rounded-xl text-sm font-medium",
            message.type === 'success' ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"
          )}>
            {message.text}
          </div>
        )}

        <div className="flex gap-3">
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex-[2] py-4 bg-white text-black font-bold rounded-2xl hover:bg-zinc-200 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {isSaving ? <Clock className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {isSaving ? 'Saving Changes...' : 'Update Profile'}
          </button>
          <button 
            onClick={() => setShowChat(true)}
            className="flex-1 py-4 bg-orange-500 text-white font-bold rounded-2xl hover:bg-orange-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
          >
            <MessageCircle className="w-5 h-5" />
            Message Nik
          </button>
        </div>
      </div>
    </div>
  );
}

function ClientCalendar({ workouts, onSelectWorkout }: { workouts: Workout[], onSelectWorkout: (w: Workout) => void }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end = endOfWeek(endOfMonth(currentMonth));
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const getWorkoutsForDay = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    return workouts.filter(w => w.scheduledDate === dateStr);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl">
      <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-orange-500 rounded-2xl text-white shadow-lg shadow-orange-500/20">
            <CalendarIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold">{format(currentMonth, 'MMMM yyyy')}</h3>
            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Your Schedule</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setCurrentMonth(new Date())}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-xs font-bold transition-colors"
          >
            Today
          </button>
          <button 
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-2 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-zinc-800">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="py-3 text-center text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-r border-zinc-800 last:border-0">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day, idx) => {
          const dayWorkouts = getWorkoutsForDay(day);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          
          return (
            <div 
              key={idx} 
              className={cn(
                "min-h-[100px] sm:min-h-[140px] p-2 border-r border-b border-zinc-800 last:border-r-0 relative group transition-colors",
                !isCurrentMonth ? "bg-zinc-950/30" : "bg-zinc-900/20",
                isToday(day) && "bg-orange-500/5"
              )}
            >
              <span className={cn(
                "text-xs font-bold",
                isToday(day) ? "text-orange-500" : isCurrentMonth ? "text-zinc-400" : "text-zinc-700"
              )}>
                {format(day, 'd')}
              </span>
              
              <div className="mt-2 space-y-1">
                {dayWorkouts.map(w => (
                  <button
                    key={w.id}
                    onClick={() => onSelectWorkout(w)}
                    className="w-full text-left px-2 py-1 bg-orange-500/10 border border-orange-500/20 rounded-lg text-[10px] font-bold text-orange-500 hover:bg-orange-500 hover:text-white transition-all truncate"
                  >
                    W{w.weekNumber} D{w.dayNumber}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
