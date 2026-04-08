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
  Scale
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import Chat from './Chat';
import { generateMotivationalMessage, analyzeMealImage } from '../lib/gemini';
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
  isToday,
  parseISO,
  startOfDay
} from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Camera, Upload, Settings, User as UserIcon2, LogOut, Info } from 'lucide-react';

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

  useEffect(() => {
    // Fetch admin profile for chat
    const q = query(collection(db, 'users'), where('role', '==', 'admin'), limit(1));
    getDocs(q).then(snap => {
      if (!snap.empty) {
        setAdminProfile({ uid: snap.docs[0].id, ...snap.docs[0].data() } as UserProfile);
      }
    });
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
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'feedback');
    });

    return () => unsubscribe();
  }, [user.uid]);

  const handleComplete = async (workout: Workout) => {
    setSubmitting(true);
    try {
      const motivationalMessage = await generateMotivationalMessage(profile.displayName || 'Champ', workout.weekNumber);
      
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
    { id: 'meal-ai', label: 'AI Meal Analysis', icon: Sparkles },
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
                    handleComplete={() => handleComplete(currentWorkout)}
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
                <ProfileSection user={user} profile={profile} />
              </motion.div>
            )}

            {activeTab === 'meal-ai' && (
              <motion.div
                key="meal-ai"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <MealAI user={user} todayMetrics={todayMetrics} />
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
                  handleComplete={() => handleComplete(selectedWorkout)}
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
        {showChat && adminProfile && (
          <motion.div
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            className="fixed bottom-24 right-6 z-[110] w-[calc(100vw-3rem)] sm:w-96 h-[600px] max-h-[calc(100vh-10rem)] shadow-2xl"
          >
            <Chat 
              currentUser={{ uid: user.uid, role: profile.role }} 
              otherUser={adminProfile} 
              onClose={() => setShowChat(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MetricsTracker({ user, todayMetrics, history }: { user: User, todayMetrics: BodyMetrics | null, history: BodyMetrics[] }) {
  const [water, setWater] = useState(todayMetrics?.waterIntake || 0);
  const [steps, setSteps] = useState(todayMetrics?.stepCount || 0);
  const [calories, setCalories] = useState(todayMetrics?.calories || 0);
  const [protein, setProtein] = useState(todayMetrics?.protein || 0);
  const [carbs, setCarbs] = useState(todayMetrics?.carbs || 0);
  const [fats, setFats] = useState(todayMetrics?.fats || 0);
  const [weight, setWeight] = useState(todayMetrics?.weight || 0);
  const [isSaving, setIsSaving] = useState(false);

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
        {isSaving ? <Clock className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
        {isSaving ? 'Saving Progress...' : 'Save Today\'s Metrics'}
      </button>
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
  handleComplete: () => void
}) {
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
                className="block relative aspect-video rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 group/vid"
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
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {!showFeedbackForm ? (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={onComplete}
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
  );
}

function MealAI({ user, todayMetrics }: { user: User, todayMetrics: BodyMetrics | null }) {
  const [image, setImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [logging, setLogging] = useState(false);

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
    if (!image) return;
    setAnalyzing(true);
    try {
      const base64 = image.split(',')[1];
      const mimeType = image.split(';')[0].split(':')[1];
      const analysis = await analyzeMealImage(base64, mimeType);
      setResult(analysis);
    } catch (error) {
      console.error('Error analyzing meal:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleLogMeal = async () => {
    if (!result) return;
    setLogging(true);
    try {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const metricsData = {
        clientId: user.uid,
        date: todayStr,
        calories: (todayMetrics?.calories || 0) + Number(result.calories),
        protein: (todayMetrics?.protein || 0) + Number(result.protein),
        carbs: (todayMetrics?.carbs || 0) + Number(result.carbs),
        fats: (todayMetrics?.fats || 0) + Number(result.fats),
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
      setImage(null);
      setResult(null);
      alert('Meal logged successfully!');
    } catch (error) {
      console.error('Error logging meal:', error);
    } finally {
      setLogging(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <div className="inline-flex p-4 bg-orange-500/10 rounded-full text-orange-500 mb-4">
          <Sparkles className="w-8 h-8" />
        </div>
        <h2 className="text-3xl font-bold">AI Meal Analysis</h2>
        <p className="text-zinc-500">Upload a photo of your meal and let Nik's AI analyze the nutrition.</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 space-y-6">
        {!image ? (
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-3xl p-12 cursor-pointer hover:border-orange-500/50 transition-all group">
            <div className="p-4 bg-zinc-950 rounded-2xl text-zinc-500 group-hover:text-orange-500 transition-colors mb-4">
              <Camera className="w-8 h-8" />
            </div>
            <span className="text-zinc-400 font-bold">Click to upload or take a photo</span>
            <span className="text-zinc-600 text-xs mt-2">Supports JPG, PNG</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          </label>
        ) : (
          <div className="space-y-6">
            <div className="relative aspect-video rounded-2xl overflow-hidden border border-zinc-800">
              <img src={image} alt="Meal" className="w-full h-full object-cover" />
              <button 
                onClick={() => { setImage(null); setResult(null); }}
                className="absolute top-4 right-4 p-2 bg-black/50 backdrop-blur-md rounded-full text-white hover:bg-black transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {!result && (
              <button 
                onClick={handleAnalyze}
                disabled={analyzing}
                className="w-full py-4 bg-orange-500 text-white font-bold rounded-2xl hover:bg-orange-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {analyzing ? <Clock className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {analyzing ? 'Analyzing Meal...' : 'Analyze Nutrition'}
              </button>
            )}
          </div>
        )}

        {result && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 pt-6 border-t border-zinc-800"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold text-orange-500">{result.mealName}</h3>
              <div className="px-3 py-1 bg-orange-500/10 rounded-full text-[10px] font-bold text-orange-500 uppercase tracking-widest">
                AI ESTIMATE
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 text-center">
                <div className="text-xl font-bold">{result.calories}</div>
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Calories</div>
              </div>
              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 text-center">
                <div className="text-xl font-bold text-blue-500">{result.protein}g</div>
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Protein</div>
              </div>
              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 text-center">
                <div className="text-xl font-bold text-green-500">{result.carbs}g</div>
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Carbs</div>
              </div>
              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 text-center">
                <div className="text-xl font-bold text-yellow-500">{result.fats}g</div>
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Fats</div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <Info className="w-4 h-4" /> Ingredients Identified
              </h4>
              <div className="flex flex-wrap gap-2">
                {result.ingredients.map((ing: string, i: number) => (
                  <span key={i} className="px-3 py-1 bg-zinc-800 rounded-lg text-xs font-medium text-zinc-300">
                    {ing}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-orange-500/5 border border-orange-500/10 p-4 rounded-2xl">
              <p className="text-sm text-zinc-300 italic">" {result.advice} "</p>
            </div>

            <button 
              onClick={handleLogMeal}
              disabled={logging}
              className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-zinc-200 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {logging ? <Clock className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              {logging ? 'Logging Meal...' : 'Log this meal to Daily Total'}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function ProfileSection({ user, profile }: { user: User, profile: UserProfile }) {
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

        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-zinc-200 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
        >
          {isSaving ? <Clock className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {isSaving ? 'Saving Changes...' : 'Update Profile'}
        </button>
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
