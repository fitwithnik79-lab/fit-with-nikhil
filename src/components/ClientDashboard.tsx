import { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { User } from 'firebase/auth';
import { DynamicKineticLogo } from './DynamicKineticLogo';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, limit, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { BodyMetrics, Workout, Exercise, Feedback, UserProfile, NutritionPlan, Message, Habit, HabitLog, Goal, WeeklyCheckIn } from '../types';
import { WeeklyCheckInForm } from './WeeklyCheckInForm';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { 
  Maximize2,
  Minimize2,
  CheckCircle, 
  Check,
  ExternalLink, 
  Play, 
  MessageSquare, 
  Trophy, 
  Calendar as CalendarIcon, 
  Dumbbell, 
  ChevronRight, 
  Clock,
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
  ArrowRight,
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
  Edit3,
  Sliders,
  User as UserIcon2,
  LogOut,
  Info,
  Shield,
  Sun,
  Zap,
  Crown,
  RefreshCcw,
  Menu,
  Heart,
  Brain,
  Timer,
  PieChart as PieChartIcon,
  Search,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Flag,
  Circle,
  Bell,
  AlertTriangle,
  RefreshCw,
  Eye
} from 'lucide-react';
import { requestNotificationPermission, onForegroundMessage } from '../lib/notifications';
import { motion, AnimatePresence } from 'motion/react';
import { cn, playNotificationSound, getAvatarUrl } from '../lib/utils';
import Chat from './Chat';
import { HeroMomentumBanner } from './HeroMomentumBanner';
import { generateMotivationalMessage, analyzeMealImage, analyzeMealText, analyzeDailyNutrition, getMacrosForItemsWithQuantities } from '../lib/gemini';
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
  differenceInDays,
  parse,
  isAfter,
  set
} from 'date-fns';
import { Reminder } from '../types';

const GoalsAndHabits = ({ habits, habitLogs, goals, user, profile, adminProfile, sendAutomatedCoachMessage }: { 
  habits: Habit[], 
  habitLogs: HabitLog[], 
  goals: Goal[], 
  user: User, 
  profile: UserProfile,
  adminProfile: UserProfile | null,
  sendAutomatedCoachMessage: (text: string, type?: 'motivation' | 'reminder') => Promise<void>
}) => {
  const clientId = profile.uid;
  const isPreview = user.uid !== profile.uid;
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newHabit, setNewHabit] = useState({ title: '', frequency: 'daily' as const, category: 'health', icon: 'zap' });
  const [newGoal, setNewGoal] = useState({ title: '', targetValue: 0, unit: '', deadline: '', category: 'fitness' });
  const [isSaving, setIsSaving] = useState(false);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const toggleHabit = async (habitId: string) => {
    const existingLog = habitLogs.find(l => l.habitId === habitId && l.date === todayStr);
    try {
      if (existingLog) {
        const nextCompletedState = !existingLog.completed;
        await updateDoc(doc(db, 'habitLogs', existingLog.id!), {
          completed: nextCompletedState,
          updatedAt: serverTimestamp()
        });
        if (nextCompletedState) {
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.75 }
          });
        }
      } else {
        await addDoc(collection(db, 'habitLogs'), {
          habitId,
          clientId: clientId,
          date: todayStr,
          completed: true,
          updatedAt: serverTimestamp()
        });
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.75 }
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `habitLogs/${existingLog?.id || 'new'}`);
    }
  };

  const handleAddHabit = async () => {
    if (!newHabit.title) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'habits'), {
        clientId: clientId,
        ...newHabit,
        active: true,
        createdAt: serverTimestamp()
      });
      setNewHabit({ title: '', frequency: 'daily', category: 'health', icon: 'zap' });
      setShowAddHabit(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'habits');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddGoal = async () => {
    if (!newGoal.title) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'goals'), {
        clientId: clientId,
        ...newGoal,
        currentValue: 0,
        status: 'in-progress',
        createdAt: serverTimestamp()
      });

      // Notify the coach about the new goal
      if (adminProfile) {
        await addDoc(collection(db, 'messages'), {
          senderId: user.uid,
          receiverId: adminProfile.uid,
          participants: [user.uid, adminProfile.uid],
          text: `NEW GOAL SET! ${profile.displayName} has committed to a new target: "${newGoal.title}" (${newGoal.targetValue} ${newGoal.unit}). Let's help them get there! 🎯`,
          isRead: false,
          type: 'motivation',
          createdAt: serverTimestamp()
        });
      }

      setNewGoal({ title: '', targetValue: 0, unit: '', deadline: '', category: 'fitness' });
      setShowAddGoal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'goals');
    } finally {
      setIsSaving(false);
    }
  };

  const updateGoalProgress = async (goalId: string, current: number, target: number) => {
    try {
      const isAchieved = current >= target;
      const status = isAchieved ? 'completed' : 'in-progress';
      
      const goalDoc = goals.find(g => g.id === goalId);
      const wasAlreadyCompleted = goalDoc?.status === 'completed';

      await updateDoc(doc(db, 'goals', goalId), {
        currentValue: current,
        status
      });

      if (isAchieved && !wasAlreadyCompleted) {
        await sendAutomatedCoachMessage(`Incredible work! You just smashed your goal: "${goalDoc?.title}". Your dedication is truly paying off. Let's set the bar even higher! 🏆`, 'motivation');
        
        // Also notify the coach
        if (adminProfile) {
          await addDoc(collection(db, 'messages'), {
            senderId: user.uid,
            receiverId: adminProfile.uid,
            participants: [user.uid, adminProfile.uid],
            text: `GOAL ACHIEVED! ${profile.displayName} has completed their goal: "${goalDoc?.title}". Time to celebrate and set new targets!`,
            isRead: false,
            type: 'motivation',
            createdAt: serverTimestamp()
          });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `goals/${goalId}`);
    }
  };

  return (
    <div className="space-y-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <h2 className="text-4xl font-black tracking-tighter uppercase italic">Consistency <span className="text-orange-500">Center</span></h2>
          <p className="text-zinc-500 font-medium">Small daily actions lead to monumental transformations.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowAddHabit(true)}
            className="px-6 py-3 bg-zinc-900 border border-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-orange-500/30 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4 text-orange-500" />
            Define Habit
          </button>
          <button 
            onClick={() => setShowAddGoal(true)}
            className="px-6 py-3 bg-orange-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2 shadow-xl shadow-orange-500/20"
          >
            <Target className="w-4 h-4" />
            Set New Goal
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Habits Section */}
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <Zap className="w-5 h-5 text-orange-500" />
            </div>
            <h3 className="text-xl font-bold">Daily Rituals</h3>
          </div>

          <div className="grid gap-4">
            {habits.map((habit) => {
              const isCompletedToday = habitLogs.some(l => l.habitId === habit.id && l.date === todayStr && l.completed);
              return (
                <motion.div 
                  key={habit.id}
                  whileHover={{ x: 5 }}
                  className={cn(
                    "p-6 rounded-[32px] border flex items-center justify-between transition-all group",
                    isCompletedToday 
                      ? "bg-orange-500/5 border-orange-500/20" 
                      : "bg-zinc-900/50 border-white/5 hover:border-white/10"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => toggleHabit(habit.id!)}
                      className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
                        isCompletedToday 
                          ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" 
                          : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"
                      )}
                    >
                      {isCompletedToday ? <Check className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                    </button>
                    <div>
                      <h4 className={cn("font-bold text-lg", isCompletedToday && "text-zinc-400 line-through")}>{habit.title}</h4>
                      <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{habit.frequency}</p>
                    </div>
                  </div>
                  <div className="hidden sm:flex -space-x-2">
                    {[...Array(7)].map((_, i) => {
                      const date = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd');
                      const completed = habitLogs.some(l => l.habitId === habit.id && l.date === date && l.completed);
                      return (
                        <div 
                          key={i} 
                          title={date}
                          className={cn(
                            "w-6 h-6 rounded-full border-2 border-zinc-950 flex items-center justify-center",
                            completed ? "bg-orange-500" : "bg-zinc-800"
                          )}
                        >
                           {completed && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
            {habits.length === 0 && (
              <div className="p-12 border-2 border-dashed border-zinc-800 rounded-[40px] text-center space-y-4">
                <Brain className="w-12 h-12 text-zinc-800 mx-auto" />
                <p className="text-zinc-500 font-medium italic">No rituals defined yet. Start small, win big.</p>
              </div>
            )}
          </div>
        </div>

        {/* Goals Section */}
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Flag className="w-5 h-5 text-blue-500" />
            </div>
            <h3 className="text-xl font-bold">North Star Objectives</h3>
          </div>

          <div className="grid gap-6">
            {goals.map((goal) => {
              const progress = goal.targetValue ? Math.min(((goal.currentValue || 0) / goal.targetValue) * 100, 100) : 0;
              return (
                <div key={goal.id} className="bg-zinc-900 border border-white/5 rounded-[40px] p-8 space-y-6 group hover:border-blue-500/30 transition-all">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-2xl font-black tracking-tight">{goal.title}</h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 px-2 py-1 bg-zinc-800 rounded-lg">{goal.category}</span>
                        {goal.deadline && (
                          <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(parseISO(goal.deadline), 'MMM d, yyyy')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-white italic">{goal.currentValue || 0}<span className="text-xs text-zinc-500 not-italic uppercase tracking-widest ml-1">{goal.unit || 'units'}</span></p>
                      <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Target: {goal.targetValue} {goal.unit}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <span className="text-xs font-black uppercase tracking-widest text-zinc-500">Progress</span>
                      <span className="text-xs font-black text-blue-500 italic">{Math.round(progress)}%</span>
                    </div>
                    <div className="h-4 bg-zinc-950 rounded-full border border-white/5 overflow-hidden p-1">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className={cn(
                          "h-full rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(59,130,246,0.3)]",
                          progress === 100 ? "bg-green-500" : "bg-blue-500"
                        )}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <input 
                      type="number"
                      placeholder="Update Value..."
                      onBlur={(e) => updateGoalProgress(goal.id!, Number(e.target.value), goal.targetValue || 0)}
                      className="bg-black border border-white/5 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500/50 w-32"
                    />
                    <button className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-all">
                      <Check className="w-4 h-4 text-zinc-400" />
                    </button>
                  </div>
                </div>
              );
            })}
            {goals.length === 0 && (
              <div className="p-12 border-2 border-dashed border-zinc-800 rounded-[40px] text-center space-y-4">
                <Target className="w-12 h-12 text-zinc-800 mx-auto" />
                <p className="text-zinc-500 font-medium italic">No goals set. What are we aiming for?</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Habit Modal */}
      <AnimatePresence>
        {showAddHabit && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddHabit(false)} className="absolute inset-0 bg-black/90 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-[40px] p-8 space-y-6">
              <h3 className="text-2xl font-black uppercase tracking-tight">Define Ritual</h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Habit Title</label>
                  <input value={newHabit.title} onChange={e => setNewHabit({...newHabit, title: e.target.value})} placeholder="e.g. Morning Meditation" className="w-full bg-black border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:border-orange-500/50" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Frequency</label>
                    <select value={newHabit.frequency} onChange={e => setNewHabit({ ...newHabit, frequency: e.target.value as any })} className="w-full bg-black border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:border-orange-500/50 appearance-none">
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Category</label>
                    <select value={newHabit.category} onChange={e => setNewHabit({ ...newHabit, category: e.target.value })} className="w-full bg-black border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:border-orange-500/50 appearance-none">
                      <option value="health">Health</option>
                      <option value="fitness">Fitness</option>
                      <option value="mindset">Mindset</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowAddHabit(false)} className="flex-1 py-4 bg-zinc-800 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-zinc-700 transition-all">Cancel</button>
                <button onClick={handleAddHabit} disabled={isSaving} className="flex-1 py-4 bg-orange-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50">Save Habit</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Goal Modal */}
      <AnimatePresence>
        {showAddGoal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddGoal(false)} className="absolute inset-0 bg-black/90 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-[40px] p-8 space-y-6">
              <h3 className="text-2xl font-black uppercase tracking-tight">Set Objective</h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Goal Title</label>
                  <input value={newGoal.title} onChange={e => setNewGoal({...newGoal, title: e.target.value})} placeholder="e.g. Bench Press 100kg" className="w-full bg-black border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:border-blue-500/50" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Target Value</label>
                    <input type="number" value={newGoal.targetValue} onChange={e => setNewGoal({...newGoal, targetValue: Number(e.target.value)})} className="w-full bg-black border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:border-blue-500/50" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Unit</label>
                    <input value={newGoal.unit} onChange={e => setNewGoal({...newGoal, unit: e.target.value})} placeholder="kg, km, etc." className="w-full bg-black border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:border-blue-500/50" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Deadline Date</label>
                  <input type="date" value={newGoal.deadline} onChange={e => setNewGoal({...newGoal, deadline: e.target.value})} className="w-full bg-black border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:border-blue-500/50" />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowAddGoal(false)} className="flex-1 py-4 bg-zinc-800 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-zinc-700 transition-all">Cancel</button>
                <button onClick={handleAddGoal} disabled={isSaving} className="flex-1 py-4 bg-blue-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 transition-all shadow-xl shadow-blue-500/20 disabled:opacity-50">Save Goal</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
const TasksAndReminders = ({ reminders, user, profile, habits, goals }: { reminders: Reminder[], user: User, profile: UserProfile, habits: Habit[], goals: Goal[] }) => {
  const clientId = profile.uid;
  const [showAdd, setShowAdd] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newReminder, setNewReminder] = useState<Partial<Reminder>>({
    title: '',
    description: '',
    time: '08:00',
    days: [1, 2, 3, 4, 5],
    type: 'task',
    active: true
  });

  const handleAdd = async () => {
    if (!newReminder.title || !newReminder.time) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'reminders'), {
        clientId: clientId,
        ...newReminder,
        active: true,
        createdAt: serverTimestamp()
      });
      setShowAdd(false);
      setNewReminder({ title: '', description: '', time: '08:00', days: [1, 2, 3, 4, 5], type: 'task', active: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'reminders');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteReminder = async (id: string) => {
    try {
      await updateDoc(doc(db, 'reminders', id), { active: false });
    } catch (e) {
       handleFirestoreError(e, OperationType.UPDATE, `reminders/${id}`);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 mb-2"
          >
            <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Scheduled Awareness</span>
          </motion.div>
          <h2 className="text-5xl font-black tracking-tighter uppercase italic leading-[0.9]">Tasks & <br /><span className="text-orange-500">Reminders</span></h2>
          <p className="text-zinc-500 font-medium text-lg max-w-sm">Strategic triggers for your daily performance rituals.</p>
        </div>
        <button 
          onClick={() => setShowAdd(true)}
          className="px-8 py-4 bg-orange-500 text-white rounded-[28px] text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center gap-2 shadow-2xl shadow-orange-500/30"
        >
          <Plus className="w-4 h-4" />
          Define Task
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reminders.filter(r => r.active).map((reminder) => (
          <motion.div 
            key={reminder.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -5 }}
            className="bg-zinc-900 border border-zinc-800 rounded-[40px] p-8 space-y-6 group hover:border-orange-500/50 transition-all relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-700">
               <Bell className="w-24 h-24 text-white" />
            </div>

            <div className="flex justify-between items-start relative z-10">
              <div className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500",
                reminder.type === 'habit' ? "bg-orange-500 text-white" : 
                reminder.type === 'goal' ? "bg-blue-500 text-white" : 
                "bg-zinc-800 text-zinc-500 group-hover:bg-orange-500 group-hover:text-white"
              )}>
                {reminder.type === 'habit' ? <Zap className="w-6 h-6" /> : 
                 reminder.type === 'goal' ? <Target className="w-6 h-6" /> : 
                 <Bell className="w-6 h-6" />}
              </div>
              <div className="flex gap-1">
                 <button 
                   onClick={() => deleteReminder(reminder.id!)}
                   className="p-3 bg-zinc-950/50 border border-zinc-800 rounded-xl text-zinc-600 hover:text-red-500 hover:border-red-500/30 transition-all"
                   title="Delete Reminder"
                 >
                    <Trash2 className="w-4 h-4" />
                 </button>
              </div>
            </div>

            <div className="relative z-10">
              <h4 className="text-2xl font-black tracking-tight leading-tight mb-2">{reminder.title}</h4>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-3 py-1 bg-zinc-950 border border-zinc-800 rounded-full text-[10px] font-black uppercase text-orange-500 italic">
                  <Clock className="w-3 h-3" />
                  {reminder.time}
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                  {reminder.days?.length === 7 ? 'ELITE DAILY' : 
                   reminder.days?.length === 0 ? 'ONE-TIME' : 
                   `${reminder.days?.length}x WEEKLY`}
                </span>
              </div>
              {reminder.description && (
                <p className="mt-4 text-sm text-zinc-500 font-medium leading-relaxed italic border-l-2 border-zinc-800 pl-4">
                  "{reminder.description}"
                </p>
              )}
            </div>

            <div className="pt-4 flex justify-between items-center relative z-10 border-t border-zinc-800/50">
              <div className="flex gap-1">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                  <div 
                    key={i} 
                    className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black transition-all",
                      reminder.days?.includes(i) 
                        ? "bg-orange-500 text-white shadow-lg shadow-orange-500/10 scale-110" 
                        : "bg-zinc-950 text-zinc-700"
                    )}
                  >
                    {day}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        ))}

        {reminders.filter(r => r.active).length === 0 && (
          <div className="md:col-span-2 lg:col-span-3 p-32 bg-zinc-950/50 border-2 border-dashed border-zinc-900 rounded-[64px] flex flex-col items-center justify-center text-center space-y-6">
             <div className="w-24 h-24 bg-zinc-900 rounded-[32px] flex items-center justify-center border border-zinc-800 transform -rotate-6">
                <Bell className="w-12 h-12 text-zinc-800" />
             </div>
             <div className="max-w-md mx-auto space-y-4">
                <h3 className="text-3xl font-black uppercase text-zinc-600 tracking-tighter">Zero Scheduled Alerts</h3>
                <p className="text-zinc-500 font-medium max-w-xs mx-auto">Mastery is built through consistent triggers. Define your reminders to ensure your execution is flawless.</p>
                <button 
                  onClick={() => setShowAdd(true)}
                  className="mt-4 px-8 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Schedule Your First Trigger
                </button>
             </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showAdd && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAdd(false)} className="absolute inset-0 bg-black/98 backdrop-blur-2xl" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 30 }} className="relative w-full max-w-xl bg-zinc-900 border border-white/10 rounded-[56px] p-12 space-y-10 shadow-2xl">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-500/10 border border-orange-500/20 rounded-full">
                  <Bell className="w-3 h-3 text-orange-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-orange-500">Alert Configuration</span>
                </div>
                <h3 className="text-5xl font-black uppercase tracking-tighter italic leading-[0.8]">Master <br /><span className="text-orange-500">The Schedule</span></h3>
                <p className="text-zinc-500 font-medium text-lg">Define exactly when and how you want to be reminded.</p>
              </div>

              <div className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">Task Definition</label>
                  <input value={newReminder.title} onChange={e => setNewReminder({...newReminder, title: e.target.value})} placeholder="e.g. 5 AM Run, Protein Intake, Reflect" className="w-full bg-black border border-white/5 rounded-3xl px-8 py-5 focus:outline-none focus:border-orange-500/50 font-black text-xl placeholder:text-zinc-800" />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">Precision Time</label>
                    <input type="time" value={newReminder.time} onChange={e => setNewReminder({...newReminder, time: e.target.value})} className="w-full bg-black border border-white/5 rounded-3xl px-8 py-5 focus:outline-none focus:border-orange-500/50 font-black text-xl" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">Category</label>
                    <select value={newReminder.type} onChange={e => setNewReminder({...newReminder, type: e.target.value as any})} className="w-full bg-black border border-white/5 rounded-3xl px-8 py-5 focus:outline-none focus:border-orange-500/50 font-black appearance-none text-zinc-400">
                      <option value="task">General Elite Task</option>
                      <option value="habit">Habit Execution</option>
                      <option value="goal">Goal Alignment</option>
                    </select>
                  </div>
                </div>

                {newReminder.type === 'habit' && habits.length > 0 && (
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">Associate With Ritual</label>
                    <select value={newReminder.habitId} onChange={e => setNewReminder({...newReminder, habitId: e.target.value})} className="w-full bg-black border border-white/5 rounded-3xl px-8 py-5 focus:outline-none focus:border-orange-500/50 font-black appearance-none text-zinc-400">
                      <option value="">Select Ritual...</option>
                      {habits.map(h => <option key={h.id} value={h.id}>{h.title}</option>)}
                    </select>
                  </div>
                )}

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">Recurrence Days</label>
                  <div className="flex justify-between gap-2">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => {
                      const isActive = newReminder.days?.includes(i);
                      return (
                        <button 
                          key={i}
                          onClick={() => {
                            const current = newReminder.days || [];
                            const next = isActive ? current.filter(d => d !== i) : [...current, i];
                            setNewReminder({...newReminder, days: next});
                          }}
                          className={cn(
                            "w-12 h-12 rounded-2xl flex items-center justify-center text-xs font-black transition-all",
                            isActive 
                              ? "bg-orange-500 text-white shadow-xl shadow-orange-500/20 scale-110" 
                              : "bg-black border border-white/5 text-zinc-700 hover:border-zinc-700"
                          )}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">Internal Dialogue / Notes</label>
                  <textarea value={newReminder.description} onChange={e => setNewReminder({...newReminder, description: e.target.value})} placeholder="e.g. Remember why you started. No shortcuts today." className="w-full bg-black border border-white/5 rounded-3xl px-8 py-5 focus:outline-none focus:border-orange-500/50 resize-none h-28 italic font-medium text-zinc-400" />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button onClick={() => setShowAdd(false)} className="flex-1 py-5 bg-zinc-800 rounded-[32px] font-black uppercase tracking-widest text-[10px] hover:bg-zinc-700 transition-all opacity-50 hover:opacity-100 italic">Dismiss</button>
                <button onClick={handleAdd} disabled={isSaving || !newReminder.title} className="flex-1 py-5 bg-orange-500 text-white rounded-[32px] font-black uppercase tracking-widest text-[10px] hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-orange-500/40 disabled:opacity-50">Initialize Alert</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const WorkoutHistoryList = ({ 
  workouts, 
  feedback, 
  onViewWorkout 
}: { 
  workouts: Workout[], 
  feedback: Feedback[], 
  onViewWorkout: (w: Workout) => void 
}) => {
  const sortedWorkouts = useMemo(() => {
    return [...workouts]
      .filter(w => w.scheduledDate)
      .sort((a, b) => parseISO(b.scheduledDate!).getTime() - parseISO(a.scheduledDate!).getTime());
  }, [workouts]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-[40px] p-8 space-y-6">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-xl font-bold flex items-center gap-2">
          <Clock className="w-5 h-5 text-orange-500" />
          Elite History
        </h3>
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-950 px-3 py-1 rounded-full border border-zinc-800">
          {feedback.filter(f => f.completionStatus).length} Completed
        </span>
      </div>

      <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
        {sortedWorkouts.map((w) => {
          const workoutFeedback = feedback.find(f => f.workoutId === w.id);
          const isCompleted = workoutFeedback?.completionStatus;
          const workoutDate = w.scheduledDate ? parseISO(w.scheduledDate) : null;

          return (
            <motion.button
              key={w.id}
              whileHover={{ x: 5 }}
              onClick={() => onViewWorkout(w)}
              className={cn(
                "w-full p-5 rounded-3xl border flex items-center justify-between transition-all group text-left",
                isCompleted 
                  ? "bg-green-500/5 border-green-500/10 hover:border-green-500/30" 
                  : "bg-zinc-950/50 border-zinc-800 hover:border-orange-500/30"
              )}
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
                  isCompleted 
                    ? "bg-green-500 text-white shadow-lg shadow-green-500/20" 
                    : "bg-zinc-800 text-zinc-500"
                )}>
                  {isCompleted ? <Trophy className="w-6 h-6" /> : <Dumbbell className="w-6 h-6" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-base">Week {w.weekNumber} • Day {w.dayNumber}</h4>
                    {isCompleted && (
                      <span className="flex items-center gap-1 text-[8px] font-black uppercase text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
                        <Check className="w-2.5 h-2.5" />
                        Crushed
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-0.5">
                    {workoutDate ? format(workoutDate, 'EEEE, MMM do') : 'Unscheduled'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {!isCompleted && (
                   <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600 group-hover:text-orange-500 transition-colors">Details</span>
                )}
                <ChevronRight className="w-5 h-5 text-zinc-700 group-hover:text-orange-500 transition-all transform group-hover:translate-x-1" />
              </div>
            </motion.button>
          );
        })}
        {sortedWorkouts.length === 0 && (
          <div className="py-20 text-center space-y-4">
            <div className="w-16 h-16 bg-zinc-950 border border-zinc-800 rounded-full flex items-center justify-center mx-auto opacity-20">
               <CalendarIcon className="w-8 h-8 text-white" />
            </div>
            <p className="text-zinc-500 text-sm font-serif italic max-w-xs mx-auto">Your journey is just beginning. Your full battle history will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
};

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

const QuickLog = ({ todayMetrics, onLog }: { 
  todayMetrics: BodyMetrics | null, 
  onLog: (data: Partial<BodyMetrics>) => void
}) => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-gradient-to-br from-orange-600 to-orange-400 rounded-[48px] p-10 text-white shadow-2xl shadow-orange-500/30 overflow-hidden relative group"
    >
      <motion.div 
        animate={{ 
          scale: [1, 1.2, 1],
          rotate: [0, 10, 0]
        }}
        transition={{ duration: 10, repeat: Infinity }}
        className="absolute -top-20 -right-20 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none" 
      />
      
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 relative z-10">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
               <Zap className="w-5 h-5 text-white" />
             </div>
             <h3 className="text-3xl font-black uppercase tracking-tighter leading-none italic">Quick Actions</h3>
          </div>
          <p className="text-white/80 font-medium text-lg max-w-sm">Every small log is a step towards your bigger goal. Stay consistent.</p>
        </div>
        
        <div className="flex flex-wrap gap-4">
          <button 
            onClick={() => onLog({ waterIntake: (todayMetrics?.waterIntake || 0) + 250 })}
            className="bg-white text-black px-8 py-4 rounded-[24px] font-black uppercase tracking-widest text-xs hover:bg-orange-50 transition-all flex items-center gap-3 shadow-xl hover:scale-105 active:scale-95"
          >
            <Droplets className="w-4 h-4 text-orange-500" />
            +250ml Water
          </button>
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

function resolveVideoUrl(url: string) {
  if (!url) return null;
  
  // YouTube
  const ytId = getYouTubeId(url);
  if (ytId) return `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&rel=0`;
  
  // Vimeo
  const vimeoReg = /vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|video\/|)(\d+)(?:$|\/|\?)/;
  const vimeoMatch = url.match(vimeoReg);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[3]}?autoplay=1&muted=1`;
  
  // Google Drive
  const driveReg = /\/file\/d\/([^\/]+)\//;
  const driveMatch = url.match(driveReg);
  if (driveMatch) return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
  
  return url;
}

function resolveThumbnail(url: string) {
  const ytId = getYouTubeId(url);
  if (ytId) return `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
  
  // Return null or a generic placeholder for others
  return null;
}

function CinemaVideoPlayer({ url, title, onClose }: { url: string, title?: string, onClose: () => void }) {
  const [isPip, setIsPip] = useState(false);
  const embedUrl = resolveVideoUrl(url);

  return (
    <div className={cn(
      "fixed z-[100] transition-all duration-500 ease-in-out",
      isPip 
        ? "bottom-8 right-8 w-80 md:w-96 aspect-video" 
        : "inset-0 flex items-center justify-center p-4"
    )}>
      <AnimatePresence>
        {!isPip && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/95 backdrop-blur-xl"
          />
        )}
      </AnimatePresence>

      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className={cn(
          "relative w-full h-full bg-black shadow-2xl overflow-hidden border border-white/10 group",
          isPip ? "rounded-3xl shadow-orange-500/10" : "max-w-5xl rounded-[40px]"
        )}
      >
        {embedUrl ? (
          <iframe
            src={embedUrl}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 space-y-4">
            <Play className="w-16 h-16 opacity-20" />
            <p className="font-medium italic">Video source unavailable</p>
          </div>
        )}
        
        {/* Cinema Controls Overlays */}
        <div className={cn(
          "absolute top-0 inset-x-0 p-4 md:p-8 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300",
          isPip ? "opacity-0 group-hover:opacity-100" : "opacity-0 group-hover:opacity-100"
        )}>
          {!isPip && (
            <div>
              <h3 className="text-xl font-black uppercase tracking-tighter text-white">{title || 'Exercise Tutorial'}</h3>
              <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Cinema Mode Active</p>
            </div>
          )}
          <div className="flex gap-2 ml-auto">
            {!isPip && (
              <a 
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-xl backdrop-blur-md border border-white/10 transition-all flex items-center gap-2 font-bold text-xs"
                title="Open in original player (fix playback errors)"
              >
                <ExternalLink className="w-4 h-4" />
                <span className="hidden sm:inline uppercase">Open Link</span>
              </a>
            )}
            <button 
              onClick={() => setIsPip(!isPip)}
              className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-xl backdrop-blur-md border border-white/10 transition-all flex items-center gap-2 font-bold text-xs"
              title={isPip ? "Maximize" : "Picture-in-Picture"}
            >
              {isPip ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
            </button>
            <button 
              onClick={onClose}
              className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-xl backdrop-blur-md border border-white/10 transition-all flex items-center gap-2 font-bold text-xs"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isPip && (
          <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
            <p className="text-[10px] font-black uppercase tracking-widest text-white truncate">{title}</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

interface ClientDashboardProps {
  user: User;
  profile: UserProfile;
}

function ExerciseHistoryView({ clientUid, exerciseName }: { clientUid: string, exerciseName: string }) {
  const [history, setHistory] = useState<{ last: string, pb: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const q = query(
          collection(db, 'workouts'),
          where('clientId', '==', clientUid),
          orderBy('scheduledDate', 'desc')
        );
        
        const snapshot = await getDocs(q);
        const workouts = snapshot.docs.map(d => d.data() as Workout);
        
        let lastPerformance = '';
        let maxWeight = 0;
        let pbString = '';

        const parseWeight = (w: string) => {
          const num = parseFloat(w.replace(/[^\d.]/g, ''));
          return isNaN(num) ? 0 : num;
        };

        for (const w of workouts) {
          const ex = w.exercises.find(e => e.name.toLowerCase() === exerciseName.toLowerCase() && e.isCompleted);
          if (ex) {
            if (!lastPerformance && ex.completedWeight) {
              lastPerformance = `${ex.completedWeight} x ${ex.completedReps}`;
            }
            if (ex.completedWeight) {
              const wVal = parseWeight(ex.completedWeight);
              if (wVal > maxWeight) {
                maxWeight = wVal;
                pbString = `${ex.completedWeight} x ${ex.completedReps}`;
              }
            }
          }
        }

        setHistory({ last: lastPerformance, pb: pbString });
      } catch (error) {
        console.error("Error fetching exercise history:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [clientUid, exerciseName]);

  if (loading) return <div className="animate-pulse h-4 w-24 bg-zinc-800 rounded mt-1" />;
  if (!history?.last && !history?.pb) return null;

  return (
    <div className="flex gap-4 mt-2">
      {history.last && (
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500">
          <Clock className="w-3 h-3 text-zinc-600" />
          LAST: <span className="text-zinc-300 uppercase tracking-tight">{history.last}</span>
        </div>
      )}
      {history.pb && (
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500">
          <Trophy className="w-3 h-3 text-orange-500" />
          PB: <span className="text-orange-500 uppercase tracking-tight italic">{history.pb}</span>
        </div>
      )}
    </div>
  );
}

function PersonalBestsWall({ workouts }: { workouts: Workout[] }) {
  const pbs = useMemo(() => {
    const map: Record<string, { weight: number, display: string, date: string }> = {};
    
    const parseWeight = (w: string) => {
      const num = parseFloat(w.replace(/[^\d.]/g, ''));
      return isNaN(num) ? 0 : num;
    };

    workouts.forEach(w => {
      w.exercises.forEach(ex => {
        if (ex.isCompleted && ex.completedWeight) {
          const wVal = parseWeight(ex.completedWeight);
          if (!map[ex.name] || wVal > map[ex.name].weight) {
            map[ex.name] = {
              weight: wVal,
              display: `${ex.completedWeight} x ${ex.completedReps}`,
              date: w.scheduledDate || 'Unknown'
            };
          }
        }
      });
    });

    return Object.entries(map).sort((a, b) => b[1].weight - a[1].weight);
  }, [workouts]);

  if (pbs.length === 0) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 space-y-6">
      <div>
        <h3 className="text-xl font-bold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-orange-500" />
          Personal Performance Records
        </h3>
        <p className="text-zinc-500 text-xs">Your all-time heaviest tactical achievements.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {pbs.slice(0, 6).map(([name, data]) => (
          <div key={name} className="flex items-center justify-between p-4 bg-zinc-950 border border-zinc-800 rounded-2xl group hover:border-orange-500/30 transition-all">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-0.5">{name}</p>
              <p className="text-lg font-black text-white italic tracking-tighter">{data.display}</p>
            </div>
            <div className="text-right">
              <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500 mb-1 ml-auto">
                <Trophy className="w-4 h-4" />
              </div>
              <p className="text-[9px] font-bold text-zinc-700 tracking-wider">SET ON {data.date === 'Unknown' ? 'LOG' : format(parseISO(data.date), 'MMM d, yyyy')}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConsistencyTracker({ workouts, feedback }: { workouts: Workout[], feedback: Feedback[] }) {
  const thirtyDays = useMemo(() => {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      days.push(subDays(new Date(), i));
    }
    return days;
  }, []);

  const stats = useMemo(() => {
    const scheduledCount = workouts.filter(w => {
      if (!w.scheduledDate) return false;
      const d = parseISO(w.scheduledDate);
      return d <= new Date();
    }).length;

    const completedCount = feedback.length;
    const rate = scheduledCount > 0 ? Math.round((completedCount / scheduledCount) * 100) : 0;
    
    return { scheduledCount, completedCount, rate };
  }, [workouts, feedback]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold flex items-center gap-2 tracking-tighter uppercase italic">
            <Activity className="w-6 h-6 text-orange-500" />
            Execution <span className="text-orange-500">Consistency</span>
          </h3>
          <p className="text-zinc-500 text-sm font-medium">Your tactical consistency over the last 30 days.</p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-black text-orange-500 italic tracking-tighter leading-none">{stats.rate}%</div>
          <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mt-1">Completion Rate</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-zinc-950/50 border border-zinc-800 p-4 rounded-2xl">
          <div className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">Assigned</div>
          <div className="text-2xl font-bold text-white">{stats.scheduledCount}</div>
        </div>
        <div className="bg-zinc-950/50 border border-zinc-800 p-4 rounded-2xl">
          <div className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">Crushed</div>
          <div className="text-2xl font-bold text-green-500">{stats.completedCount}</div>
        </div>
        <div className="bg-zinc-950/50 border border-zinc-800 p-4 rounded-2xl sm:col-span-1 col-span-2">
          <div className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">Consistency Tier</div>
          <div className="text-2xl font-bold text-orange-500">
            {stats.rate >= 90 ? 'Elite' : stats.rate >= 75 ? 'Advanced' : stats.rate >= 50 ? 'Intermediate' : 'Beginner'}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Momentum Grid</span>
          <div className="flex items-center gap-4 text-[9px] font-bold text-zinc-600 uppercase tracking-widest">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-orange-500" /> DONE</div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-zinc-800" /> MISSED</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {thirtyDays.map((date, idx) => {
            const dateStr = format(date, 'yyyy-MM-dd');
            const wasScheduled = workouts.some(w => w.scheduledDate === dateStr);
            const wasCompleted = feedback.some(f => {
              if (!f.createdAt) return false;
              const fDate = (f.createdAt as any).toDate ? (f.createdAt as any).toDate() : new Date(f.createdAt as any);
              return isSameDay(fDate, date);
            });

            return (
              <div 
                key={idx}
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all",
                  wasCompleted ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" : 
                  wasScheduled && date < startOfDay(new Date()) ? "bg-zinc-800 text-zinc-600 border border-red-500/10" : 
                  wasScheduled ? "bg-zinc-900 border border-orange-500/20 text-orange-500/50 animate-pulse" :
                  "bg-zinc-950 border border-zinc-900 text-zinc-800"
                )}
                title={`${format(date, 'MMM d')}: ${wasCompleted ? 'Crushed' : wasScheduled ? 'Missed' : 'Rest Day'}`}
              >
                {format(date, 'd')}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const bentoContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04
    }
  }
};

const bentoItemVariants = {
  hidden: { opacity: 0, y: 25 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 90,
      damping: 14
    }
  }
};

export default function ClientDashboard({ user, profile }: ClientDashboardProps) {
  const isPreview = user.uid !== profile.uid;
  const clientId = profile.uid;
  
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const isSunday = new Date().getDay() === 0;
  const thisSundayStr = format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd');
  
  const calculateStreakFromMetrics = (history: BodyMetrics[]) => {
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

  const [currentWorkout, setCurrentWorkout] = useState<Workout | null>(null);
  const [allWorkouts, setAllWorkouts] = useState<Workout[]>([]);
  const [allFeedback, setAllFeedback] = useState<Feedback[]>([]);
  const [activeVideo, setActiveVideo] = useState<{ url: string, title?: string } | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<Feedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [clientNote, setClientNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [adminProfile, setAdminProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'dash' | 'calendar' | 'goals' | 'tasks' | 'program' | 'meal' | 'progress' | 'badges' | 'classes' | 'profile' | 'meal-ai' | 'nutrition'>('dash');
  const [showWeeklyCheckIn, setShowWeeklyCheckIn] = useState(false);
  const [hasCheckedInThisWeek, setHasCheckedInThisWeek] = useState(false);
  const [weeklyCheckIn, setWeeklyCheckIn] = useState<WeeklyCheckIn | null>(null);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('app-tab-changed', { 
      detail: { tab: activeTab, role: 'client' } 
    }));
  }, [activeTab]);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [isWorkoutFullScreen, setIsWorkoutFullScreen] = useState(true);
  const [isEditingWorkout, setIsEditingWorkout] = useState(false);
  const [editableExercises, setEditableExercises] = useState<Exercise[]>([]);
  const [editableNotes, setEditableNotes] = useState('');
  const [savingWorkout, setSavingWorkout] = useState(false);

  useEffect(() => {
    if (selectedWorkout) {
      setEditableExercises(JSON.parse(JSON.stringify(selectedWorkout.exercises)));
      setEditableNotes(selectedWorkout.notes || '');
      setIsEditingWorkout(false);
    }
  }, [selectedWorkout]);

  // ========== GOOGLE FIT STEP WORKFLOW ==========
  const [isFitConnected, setIsFitConnected] = useState(!!profile?.googleFitTokens?.access_token);
  const [isSyncingSteps, setIsSyncingSteps] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    setIsFitConnected(!!profile?.googleFitTokens?.access_token);
  }, [profile?.googleFitTokens]);

  const handleConnectGoogleFit = async () => {
    try {
      const res = await fetch(`/api/google-fit-auth-url?uid=${clientId}`);
      const data = await res.json();
      if (data.url) {
        const popupWidth = 600;
        const popupHeight = 600;
        const left = window.screenX + (window.innerWidth - popupWidth) / 2;
        const top = window.screenY + (window.innerHeight - popupHeight) / 2;
        
        window.open(
          data.url, 
          'Connect Google Fit', 
          `width=${popupWidth},height=${popupHeight},top=${top},left=${left},resizable=yes,scrollbars=yes,status=yes`
        );
      } else {
        alert(data.error || 'Failed to initialize connection');
      }
    } catch (err) {
      console.error('Error starting Google Fit auth:', err);
      alert('Failed to connect to authentication server');
    }
  };

  const syncSteps = async () => {
    if (isSyncingSteps) return;
    setIsSyncingSteps(true);
    setSyncError(null);
    try {
      const res = await fetch(`/api/google-fit-steps?uid=${clientId}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to sync steps');
      }
      const data = await res.json();
      console.log('[Steps Sync] Daily step count successfully fetched:', data.steps);
    } catch (err: any) {
      console.error('Error syncing steps:', err);
      setSyncError(err.message || 'Could not sync steps with Google Fit');
    } finally {
      setIsSyncingSteps(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'progress' && isFitConnected) {
      syncSteps();
      const interval = setInterval(() => {
        syncSteps();
      }, 10 * 60 * 1000); // 10 minutes
      return () => clearInterval(interval);
    }
  }, [activeTab, isFitConnected]);

  // ========== GOOGLE CALENDAR WORKFLOW ==========
  const [isCalConnected, setIsCalConnected] = useState(!!profile?.googleCalTokens?.access_token);

  useEffect(() => {
    setIsCalConnected(!!profile?.googleCalTokens?.access_token);
  }, [profile?.googleCalTokens]);

  const handleConnectGoogleCalendar = async () => {
    try {
      const res = await fetch(`/api/google-cal-auth-url?uid=${clientId}`);
      const data = await res.json();
      if (data.url) {
        const popupWidth = 600;
        const popupHeight = 600;
        const left = window.screenX + (window.innerWidth - popupWidth) / 2;
        const top = window.screenY + (window.innerHeight - popupHeight) / 2;
        
        window.open(
          data.url, 
          'Connect Google Calendar', 
          `width=${popupWidth},height=${popupHeight},top=${top},left=${left},resizable=yes,scrollbars=yes,status=yes`
        );
      } else {
        alert(data.error || 'Failed to initialize connection');
      }
    } catch (err) {
      console.error('Error starting Google Cal auth:', err);
      alert('Failed to connect to authentication server');
    }
  };

  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_FIT_CONNECTED') {
        setIsFitConnected(true);
        syncSteps();
      } else if (event.data?.type === 'GOOGLE_CAL_CONNECTED') {
        setIsCalConnected(true);
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [metrics, setMetrics] = useState<BodyMetrics[]>([]);
  const [todayMetrics, setTodayMetrics] = useState<BodyMetrics | null>(null);
  const [meals, setMeals] = useState<any[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeNutritionPlan, setActiveNutritionPlan] = useState<NutritionPlan | null>(null);

  useEffect(() => {
    if (!clientId) return;
    const thisSundayStr = format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd');
    const qCheckIn = query(
      collection(db, 'weeklyCheckIns'),
      where('uid', '==', clientId),
      where('weekOf', '==', thisSundayStr)
    );

    const unsubscribeCheckIn = onSnapshot(qCheckIn, (snapshot) => {
      if (!snapshot.empty) {
        setHasCheckedInThisWeek(true);
        setWeeklyCheckIn(snapshot.docs[0].data() as WeeklyCheckIn);
      } else {
        setHasCheckedInThisWeek(false);
        setWeeklyCheckIn(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'weeklyCheckIns');
    });

    return () => {
      unsubscribeCheckIn();
    };
  }, [clientId]);
  const [selectedNutritionDay, setSelectedNutritionDay] = useState<number>(() => {
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
  });
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [habitLoading, setHabitLoading] = useState(true);
  const [calendarViewDate, setCalendarViewDate] = useState(new Date());

  useEffect(() => {
    if (!clientId) return;
    const q = query(
      collection(db, 'notifications'),
      where('clientId', '==', clientId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNotifications(notes);
      
      // Notify user on new arrivals
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added' && !snapshot.metadata.fromCache) {
          playNotificationSound();
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    });

    return () => unsubscribe();
  }, [clientId]);

  const markNotificationAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { isRead: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `notifications/${id}`);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { clientId: 'deleted' }); // Logical delete or use real delete if rules allow
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `notifications/${id}`);
    }
  };

  const unreadNotificationsCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);

  useEffect(() => {
    if (clientId) {
      requestNotificationPermission(clientId);
      onForegroundMessage();
    }
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    const q = query(
      collection(db, 'messages'),
      where('receiverId', '==', clientId),
      limit(100)
    );
    
    let isInitialLoad = true;

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }) as Message)
        .sort((a, b) => {
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt instanceof Date ? a.createdAt.getTime() : 0);
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt instanceof Date ? b.createdAt.getTime() : 0);
          return timeB - timeA; // Descending
        })
        .slice(0, 20); // Keep top 20 recent messages
      setMessages(msgs);

      if (!isInitialLoad) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const msg = change.doc.data() as Message;
            if (msg.senderId !== clientId) {
              // Always play sound and vibrate for incoming messages
              playNotificationSound();

              if ("Notification" in window && Notification.permission === "granted") {
                new Notification("New Message from Coach Nik", {
                  body: msg.text,
                  icon: '/favicon.ico'
                });
              }
            }
          }
        });
      }
      isInitialLoad = false;
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'messages');
    });
    return () => unsubscribe();
  }, [clientId]);

  const unreadCount = useMemo(() => messages.filter(m => !m.isRead).length, [messages]);

  const isWorkoutCompletedToday = useMemo(() => {
    return allFeedback.some(f => {
      if (!f.createdAt || f.workoutId !== currentWorkout?.id) return false;
      const fDate = (f.createdAt as any).toDate ? (f.createdAt as any).toDate() : new Date(f.createdAt as any);
      return isSameDay(fDate, new Date());
    });
  }, [allFeedback, currentWorkout?.id]);

  useEffect(() => {
    if (!clientId) return;
    const q = query(collection(db, 'nutritionPlans'), where('clientId', '==', clientId), where('isActive', '==', true), limit(1));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setActiveNutritionPlan({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as NutritionPlan);
      } else {
        setActiveNutritionPlan(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'nutritionPlans');
    });
    return () => unsubscribe();
  }, [clientId]);

  // Achievement Badge Logic
  useEffect(() => {
    if (!clientId || !profile) return;
    
    const checkBadges = async () => {
      const currentBadges = profile.badges || [];
      const newBadges = [...currentBadges];
      let updated = false;

      // 1. Consistency King (Streak)
      if (profile.streak && profile.streak >= 7 && !currentBadges.find(b => b.id === 'consistency_1')) {
        newBadges.push({ id: 'consistency_1', name: '7-Day Streak', icon: 'Flame', description: 'Maintain a 7-day activity streak', unlockedAt: new Date().toISOString(), category: 'consistency' });
        updated = true;
      }

      // 2. Decathlon (Workout Count)
      const completedWorkouts = allFeedback.filter(f => f.completionStatus).length;
      if (completedWorkouts >= 10 && !currentBadges.find(b => b.id === 'workout_10')) {
        newBadges.push({ id: 'workout_10', name: 'Decathlon', icon: 'Shield', description: 'Complete 10 full workouts', unlockedAt: new Date().toISOString(), category: 'workout' });
        updated = true;
      }

      // 3. Meal Master (Meal Count)
      if (meals.length >= 50 && !currentBadges.find(b => b.id === 'nutrition_log')) {
        newBadges.push({ id: 'nutrition_log', name: 'Meal Master', icon: 'Utensils', description: 'Log 50 meals with AI', unlockedAt: new Date().toISOString(), category: 'nutrition' });
        updated = true;
      }

      if (updated && !isPreview) {
        try {
          await updateDoc(doc(db, 'users', clientId), { badges: newBadges });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `users/${clientId}`);
        }
      }
    };

    if (!loading) {
      checkBadges();
    }
  }, [profile?.streak, allFeedback.length, meals.length, clientId, loading, isPreview]);

  const handleTogglePlannedMeal = async (mealId: string) => {
    if (!activeNutritionPlan?.id || !activeNutritionPlan.plannedMeals) return;

    const updatedMeals = activeNutritionPlan.plannedMeals.map(m => {
      if (m.id === mealId) {
        return {
          ...m,
          isCompleted: !m.isCompleted,
          completedAt: !m.isCompleted ? new Date().toISOString() : null
        };
      }
      return m;
    });

    try {
      await updateDoc(doc(db, 'nutritionPlans', activeNutritionPlan.id), {
        plannedMeals: updatedMeals
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `nutritionPlans/${activeNutritionPlan.id}`);
    }
  };

  // Helper to send automated coach messages
  const sendAutomatedCoachMessage = async (text: string, type: 'motivation' | 'reminder' = 'motivation') => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'admin'), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const adminUid = snap.docs[0].id;
        await addDoc(collection(db, 'messages'), {
          senderId: adminUid,
          receiverId: clientId,
          participants: [adminUid, clientId],
          text,
          isRead: false,
          type,
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'messages');
    }
  };

  useEffect(() => {
    // Fetch admin profile for chat
    const q = query(collection(db, 'users'), where('role', '==', 'admin'));
    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        // Find the specific admin if possible, otherwise take the first one
        const adminDoc = snap.docs.find(d => d.data().email?.toLowerCase() === 'fitwithnik79@gmail.com') || snap.docs[0];
        setAdminProfile({ uid: adminDoc.id, ...adminDoc.data() } as UserProfile);
      } else {
        // Fallback: search for the specific admin email if role check fails (checking common case variations)
        const q2 = query(collection(db, 'users'), where('email', 'in', ['fitwithnik79@gmail.com', 'FitWithNik79@gmail.com', 'FITWITHNIK79@gmail.com']));
        getDocs(q2).then(snap2 => {
          if (!snap2.empty) {
            setAdminProfile({ uid: snap2.docs[0].id, ...snap2.docs[0].data() } as UserProfile);
          }
        }).catch(err => {
          console.error("Error fetching admin profile fallback:", err);
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'admin_profile');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Fetch metrics
    const q = query(
      collection(db, 'metrics'),
      where('clientId', '==', clientId),
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
  }, [clientId]);

  useEffect(() => {
    // Fetch meals
    const q = query(
      collection(db, 'meals'),
      where('clientId', '==', clientId),
      orderBy('date', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const mealsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMeals(mealsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'meals');
    });

    return () => unsubscribe();
  }, [clientId]);
  
  useEffect(() => {
    if (!clientId) return;
    
    // Fetch Habits
    const qHabits = query(collection(db, 'habits'), where('clientId', '==', clientId), where('active', '==', true));
    const unsubscribeHabits = onSnapshot(qHabits, (snapshot) => {
      setHabits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Habit));
      setHabitLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'habits');
    });

    // Fetch Habit Logs for last 7 days
    const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');
    const qLogs = query(collection(db, 'habitLogs'), where('clientId', '==', clientId), where('date', '>=', sevenDaysAgo));
    const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
      setHabitLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as HabitLog));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'habitLogs');
    });

    // Fetch Goals
    const qGoals = query(collection(db, 'goals'), where('clientId', '==', clientId));
    const unsubscribeGoals = onSnapshot(qGoals, (snapshot) => {
      setGoals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Goal));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'goals');
    });

    // Fetch Reminders
    const qReminders = query(collection(db, 'reminders'), where('clientId', '==', clientId));
    const unsubscribeReminders = onSnapshot(qReminders, (snapshot) => {
      setReminders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Reminder)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'reminders');
    });

    return () => {
      unsubscribeHabits();
      unsubscribeLogs();
      unsubscribeGoals();
      unsubscribeReminders();
    };
  }, [clientId]);

  const [toastNotification, setToastNotification] = useState<{title: string, message: string, type: string} | null>(null);

  // Reminder Notification Logic
  useEffect(() => {
    if (!reminders.length) return;

    const checkReminders = () => {
      const now = new Date();
      const currentDay = now.getDay();
      const currentTime = format(now, 'HH:mm');
      const todayKey = format(now, 'yyyy-MM-dd-HH-mm');

      reminders.forEach(async (reminder) => {
        if (!reminder.active) return;
        
        // Check days if specified (0-6)
        if (reminder.days && reminder.days.length > 0 && !reminder.days.includes(currentDay)) return;

        // Compare time
        if (reminder.time === currentTime && reminder.lastNotified !== todayKey) {
          // Only trigger actual notifications if NOT in preview mode
          if (!isPreview) {
            try {
              playNotificationSound();
            } catch (e) {
              console.warn('Audio play failed:', e);
            }
            
            setToastNotification({
              title: reminder.title,
              message: reminder.description || 'Time for your scheduled task!',
              type: reminder.type
            });

            // Native Browser Notification
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification(`Coach Nik Reminder: ${reminder.title}`, {
                body: reminder.description || 'Execution required. Keep the momentum high.',
                icon: '/favicon.ico'
              });
            }
          }

          // Mark as notified for this minute to prevent multiple triggers
          try {
            await updateDoc(doc(db, 'reminders', reminder.id!), {
              lastNotified: todayKey
            });
          } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, `reminders/${reminder.id}`);
          }
        }
      });
    };

    const interval = setInterval(checkReminders, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [reminders, clientId, isPreview]);

  useEffect(() => {
    if (toastNotification) {
      const timer = setTimeout(() => setToastNotification(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [toastNotification]);

  useEffect(() => {
    // Fetch all workouts for calendar and program
    const qAll = query(
      collection(db, 'workouts'),
      where('clientId', '==', clientId),
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
      } else {
        // No workout for today - explicitly set to null
        setCurrentWorkout(null);
      }
      
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'workouts');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [clientId]);

  useEffect(() => {
    // Get feedback for the last 30 days
    const thirtyDaysAgo = subDays(new Date(), 90);
    const q = query(
      collection(db, 'feedback'),
      where('clientId', '==', clientId),
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
  }, [clientId]);

  // Automated reminders for missed workouts/meals
  useEffect(() => {
    const checkMissedCheckins = async () => {
      if (isPreview) return; // Don't send automated reminders in preview mode
      
      const lastCheckKey = `last_checkin_reminder_${clientId}_${format(new Date(), 'yyyy-MM-dd')}`;
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
  }, [loading, allWorkouts, allFeedback, meals, clientId, isPreview]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const [submittingError, setSubmittingError] = useState<string | null>(null);

  const handleComplete = async (workout: Workout, exerciseFeedback?: Record<number, { 
    completedWeight: string, 
    completedReps: string, 
    completedSets: number, 
    clientNote: string, 
    isCompleted: boolean 
  }>) => {
    setSubmitting(true);
    setSubmittingError(null);
    try {
      const motivationalMessage = await generateMotivationalMessage(profile.displayName || 'Champ', workout.weekNumber);
      
      // Update the workout document with the client's actual performance
      if (workout.id && exerciseFeedback) {
        const updatedExercises = workout.exercises.map((ex, idx) => ({
          ...ex,
          completedWeight: exerciseFeedback[idx]?.completedWeight || ex.weight || '',
          completedReps: exerciseFeedback[idx]?.completedReps || ex.reps || '',
          completedSets: exerciseFeedback[idx]?.completedSets || ex.sets || 0,
          clientNote: exerciseFeedback[idx]?.clientNote || '',
          isCompleted: exerciseFeedback[idx]?.isCompleted || false
        }));
        
        await updateDoc(doc(db, 'workouts', workout.id), {
          exercises: updatedExercises
        }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `workouts/${workout.id}`));
      }

      await addDoc(collection(db, 'feedback'), {
        clientId: clientId,
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
          participants: [user.uid, adminProfile.uid],
          text: `Workout Completed! ${profile.displayName || 'Client'} finished Week ${workout.weekNumber} Day ${workout.dayNumber}. Notes: ${clientNote || 'No notes provided.'}`,
          isRead: false,
          type: 'motivation',
          createdAt: serverTimestamp()
        }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'messages'));
      }
      
      setShowFeedbackForm(false);
      setClientNote('');
      setShowSuccess(true);

      // Grand celebration fireworks cascade with canvas-confetti
      const duration = 2.5 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

      const randomInRange = (min: number, max: number) => {
        return Math.random() * (max - min) + min;
      };

      const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);

      if (selectedWorkout?.id === workout.id) {
        // We delay closing the modal slightly so the user sees the success state if it's there
        setTimeout(() => setSelectedWorkout(null), 1000);
      }
      setTimeout(() => setShowSuccess(false), 4000);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      setSubmittingError("There was an issue submitting your workout. Please try again. If it persists, please message your coach.");
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
    { id: 'tasks', label: 'Tasks & Reminders', icon: Bell },
    { id: 'goals', label: 'Habits & Goals', icon: Target },
    { id: 'program', label: 'Training Program', icon: Folder },
    { id: 'nutrition', label: 'Nutrition Plan', icon: Sparkles },
    { id: 'progress', label: 'Progress', icon: TrendingUp },
    { id: 'profile', label: 'My Profile', icon: UserIcon },
  ];

  const handleHistoryWorkoutClick = (workout: Workout) => {
    if (workout.scheduledDate) {
      setCalendarViewDate(parseISO(workout.scheduledDate));
      setActiveTab('calendar');
      setSelectedWorkout(workout);
    } else {
      setSelectedWorkout(workout);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white selection:bg-orange-500/30 font-sans -m-4 sm:-m-8">
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-orange-500/[0.03] rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[20%] right-[10%] w-[30%] h-[30%] bg-blue-500/[0.02] rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="flex h-screen overflow-hidden relative z-10">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-72 flex-col bg-zinc-950/80 backdrop-blur-3xl border-r border-white/5 shadow-2xl shrink-0">
          <div className="p-8 flex flex-col h-full">
            <div className="mb-10 flex">
              <DynamicKineticLogo size="md" fixedRole="client" fixedTab={activeTab} />
            </div>

            <nav className="flex-1 space-y-1">
              {sidebarItems.map((item) => (
                <motion.button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  whileHover={{ scale: 1.02, x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className={cn(
                    "w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all relative group text-left",
                    activeTab === item.id 
                      ? "text-orange-500 bg-orange-500/5" 
                      : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/50"
                  )}
                >
                  {activeTab === item.id && (
                    <motion.div 
                      layoutId="activeTab"
                      className="absolute inset-0 bg-white/5 rounded-2xl border border-white/5"
                    />
                  )}
                  <item.icon className={cn("w-5 h-5 transition-transform group-hover:scale-110", activeTab === item.id ? "text-orange-500" : "text-zinc-600")} />
                  <span className="relative">{item.label}</span>
                  {item.id === 'dash' && unreadCount > 0 && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 bg-orange-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-lg shadow-orange-500/40">
                      {unreadCount}
                    </span>
                  )}
                </motion.button>
              ))}
            </nav>

            <div className="mt-8 pt-8 border-t border-white/5">
              <button 
                onClick={() => setShowChat(true)}
                className="w-full relative group"
              >
                <div className="absolute inset-0 bg-orange-500 rounded-3xl blur-xl opacity-20 group-hover:opacity-40 transition-opacity" />
                <div className="relative bg-zinc-900 border border-white/10 p-5 rounded-3xl flex items-center gap-4 hover:border-orange-500/50 transition-all">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center">
                      <MessageCircle className="w-6 h-6 text-orange-500" />
                    </div>
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-zinc-900 animate-pulse" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Coach Chat</p>
                    <p className="text-sm font-bold text-white">Online Now</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-black relative">
          {/* Top Bar */}
          <header className="h-20 flex items-center justify-between px-8 bg-black/50 backdrop-blur-md border-b border-white/5 shrink-0 z-20">
            <div className="flex items-center gap-4 md:hidden">
               <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 bg-zinc-900 rounded-xl text-zinc-400 hover:text-orange-500 transition-colors">
                 <Menu className="w-6 h-6" />
               </button>
               <h1 className="text-lg font-black tracking-tight italic">FIT WITH <span className="text-orange-500">NIK</span></h1>
            </div>

            <div className="hidden md:block">
              <h2 className="text-xl font-bold tracking-tight text-white/90">
                {sidebarItems.find(i => i.id === activeTab)?.label}
              </h2>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative">
                <button 
                  onClick={() => setShowNotifications(!showNotifications)}
                  className={cn(
                    "p-3 rounded-2xl border transition-all relative group",
                    showNotifications 
                      ? "bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20" 
                      : "bg-zinc-900 border-white/5 text-zinc-500 hover:text-white hover:border-zinc-700 hover:bg-zinc-800"
                  )}
                >
                  <Bell className="w-5 h-5" />
                  {unreadNotificationsCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-600 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-black animate-bounce">
                      {unreadNotificationsCount}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {showNotifications && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute top-full right-0 mt-4 w-[350px] bg-zinc-950 border border-zinc-800 rounded-[32px] shadow-2xl z-[100] overflow-hidden flex flex-col max-h-[500px]"
                    >
                      <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Bell className="w-4 h-4 text-orange-500" />
                          <h3 className="text-sm font-black uppercase tracking-widest">Athlete Alerts</h3>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 bg-zinc-950 px-2 py-0.5 rounded-lg border border-white/5">
                          {notifications.length} Total
                        </span>
                      </div>

                      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                        {notifications.length === 0 ? (
                          <div className="py-20 text-center space-y-4">
                            <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto border border-white/5">
                              <Bell className="w-8 h-8 text-zinc-800" />
                            </div>
                            <p className="text-zinc-500 text-xs italic">All clear. No alerts at the moment.</p>
                          </div>
                        ) : (
                          notifications.map((note) => (
                            <div 
                              key={note.id}
                              className={cn(
                                "group p-4 rounded-2xl border transition-all flex items-start gap-4 hover:bg-zinc-900 relative",
                                !note.isRead ? "bg-orange-500/5 border-orange-500/20" : "bg-transparent border-transparent"
                              )}
                            >
                              <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-500",
                                !note.isRead 
                                  ? "bg-orange-500 text-white border-orange-500" 
                                  : "bg-zinc-900 text-zinc-600 border-white/5 group-hover:bg-zinc-800 group-hover:text-zinc-400"
                              )}>
                                {note.type === 'message' ? <MessageCircle className="w-5 h-5" /> : 
                                 note.type === 'workout' ? <Dumbbell className="w-5 h-5" /> : 
                                 <Bell className="w-5 h-5" />}
                              </div>
                              <div className="flex-1 min-w-0 pr-6">
                                <h4 className={cn("text-xs font-black uppercase truncate", !note.isRead ? "text-white" : "text-zinc-500 italic")}>
                                  {note.title}
                                </h4>
                                <p className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5 leading-relaxed tracking-tight group-hover:text-white transition-colors">
                                  {note.message}
                                </p>
                                <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mt-1">
                                  {note.createdAt ? format(note.createdAt.toDate ? note.createdAt.toDate() : new Date(note.createdAt), 'MMM d, HH:mm') : 'Just now'}
                                </p>
                              </div>
                              <div className="absolute top-4 right-4 flex flex-col gap-2">
                                {!note.isRead && (
                                  <button 
                                    onClick={() => markNotificationAsRead(note.id)}
                                    className="p-1.5 bg-green-500/10 text-green-500 rounded-lg border border-green-500/20 hover:bg-green-500/20"
                                    title="Mark as Read"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                )}
                                <button 
                                  onClick={() => deleteNotification(note.id)}
                                  className="p-1.5 bg-zinc-800 text-zinc-600 rounded-lg hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                  title="Clear"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      
                      <button className="w-full py-4 bg-zinc-900 border-t border-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all">
                        Archive All History
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex items-center gap-3 bg-zinc-900/50 border border-white/5 py-1.5 pl-1.5 pr-4 rounded-full">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-orange-500/20 border border-white/10">
                  <img 
                    src={getAvatarUrl(user.email || undefined, profile.gender, profile.photoURL)} 
                    alt={user.displayName || 'Me'} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs font-black uppercase tracking-widest leading-none truncate max-w-[100px]">{profile.displayName?.split(' ')[0]}</p>
                </div>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-6 md:p-10 hide-scrollbar scroll-smooth relative z-10 transition-all">
            <div className="max-w-7xl mx-auto">
              <AnimatePresence mode="wait">
                {activeTab === 'dash' && (
                  <motion.div
                    key="dash"
                    variants={bentoContainerVariants}
                    initial="hidden"
                    animate="visible"
                    exit={{ opacity: 0, y: -20 }}
                    className="space-y-10"
                  >
                    {/* Welcome Section */}
                    <HeroMomentumBanner
                      profile={profile}
                      streak={profile.streak || calculateStreakFromMetrics(metrics)}
                      completedToday={isWorkoutCompletedToday}
                      todayWorkout={currentWorkout}
                      completedSessions={allFeedback.filter(f => f.completionStatus).length}
                      habitsCompletedToday={habits.filter(h => habitLogs.some(l => l.habitId === h.id && l.date === todayStr && l.completed)).length}
                      totalHabits={habits.length}
                      unreadMessages={messages.filter(m => !m.isRead && m.receiverId === profile.uid).length}
                      onGoToCalendar={() => setActiveTab('calendar')}
                      onGoToChat={() => setShowChat(true)}
                    />

                    {isSunday && !hasCheckedInThisWeek && !showWeeklyCheckIn && (
                      <motion.div
                        variants={bentoItemVariants}
                        className="bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 p-8 rounded-[40px] border border-orange-400/20 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden group"
                      >
                        <div className="absolute inset-0 bg-white/[0.05] pointer-events-none group-hover:scale-105 transition-transform duration-700" />
                        <div>
                          <p className="text-[10px] bg-white/20 text-white font-black uppercase tracking-widest px-3 py-1 rounded-full w-fit mb-3">ACTION REQUIRED</p>
                          <h3 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                            It's check-in day! Help Nik understand your week 👇
                          </h3>
                        </div>
                        <button
                          onClick={() => setShowWeeklyCheckIn(true)}
                          className="bg-zinc-950 text-white hover:bg-orange-600 hover:text-white font-black uppercase text-xs tracking-widest px-6 py-4 rounded-2xl transition-all self-start md:self-auto shrink-0 shadow-lg"
                        >
                          Fill Check-In
                        </button>
                      </motion.div>
                    )}

                    {showWeeklyCheckIn && !hasCheckedInThisWeek && (
                      <motion.div variants={bentoItemVariants}>
                        <WeeklyCheckInForm
                          profile={profile}
                          weekOf={thisSundayStr}
                          onSuccess={() => {
                            setShowWeeklyCheckIn(false);
                            setHasCheckedInThisWeek(true);
                          }}
                          onCancel={() => setShowWeeklyCheckIn(false)}
                        />
                      </motion.div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="lg:col-span-3 space-y-8">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                           <motion.div 
                             variants={bentoItemVariants}
                             whileHover={{ y: -6, scale: 1.015 }}
                             transition={{ type: "spring", stiffness: 300, damping: 20 }}
                             className="bg-zinc-900 border border-white/5 rounded-[40px] p-8 flex flex-col justify-between group overflow-hidden relative shadow-2xl"
                           >
                             <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:rotate-12 transition-transform">
                               <Flame className="w-32 h-32 text-red-500" />
                             </div>
                             <div className="p-3 bg-red-500/10 rounded-2xl w-fit mb-12">
                               <Flame className="w-6 h-6 text-red-500" />
                             </div>
                             <div>
                               <p className="text-5xl font-black italic tracking-tighter mb-1">{todayMetrics?.calories || 0}</p>
                               <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Active Calories</p>
                             </div>
                           </motion.div>

                           <motion.div 
                             variants={bentoItemVariants}
                             whileHover={{ y: -6, scale: 1.015 }}
                             transition={{ type: "spring", stiffness: 300, damping: 20 }}
                             className="bg-zinc-900 border border-white/5 rounded-[40px] p-8 flex flex-col justify-between group overflow-hidden relative shadow-2xl"
                           >
                             <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:rotate-12 transition-transform">
                               <Droplets className="w-32 h-32 text-blue-500" />
                             </div>
                             <div className="p-3 bg-blue-500/10 rounded-2xl w-fit mb-12">
                               <Droplets className="w-6 h-6 text-blue-500" />
                             </div>
                             <div>
                               <p className="text-5xl font-black italic tracking-tighter mb-1">{todayMetrics?.waterIntake || 0}<span className="text-xl ml-1">ml</span></p>
                               <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Daily Hydration</p>
                             </div>
                           </motion.div>
                        </div>

                        <motion.div variants={bentoItemVariants}>
                          <QuickLog 
                            todayMetrics={todayMetrics} 
                            onLog={async (data) => {
                              if (isPreview) return;
                              const dateStr = format(new Date(), 'yyyy-MM-dd');
                              const q = query(collection(db, 'metrics'), where('clientId', '==', clientId), where('date', '==', dateStr));
                              const snap = await getDocs(q);
                              
                              if (!snap.empty) {
                                await updateDoc(doc(db, 'metrics', snap.docs[0].id), {
                                  ...data,
                                  updatedAt: serverTimestamp()
                                });
                              } else {
                                await addDoc(collection(db, 'metrics'), {
                                  clientId: clientId,
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
                        </motion.div>

                        {lastFeedback?.motivationalMessage && (
                          <motion.div 
                            variants={bentoItemVariants}
                            className="bg-orange-500/5 ring-1 ring-orange-500/10 p-8 rounded-[40px] relative overflow-hidden group shadow-2xl shadow-orange-500/5"
                            whileHover={{ scale: 1.01 }}
                          >
                            <Sparkles className="absolute -right-4 -top-4 w-40 h-40 text-orange-500/5 rotate-12 transition-transform group-hover:rotate-45" />
                            <div className="flex items-start gap-6 relative">
                              <div className="p-4 bg-orange-500 rounded-3xl text-white shadow-2xl shadow-orange-500/20">
                                <Award className="w-8 h-8" />
                              </div>
                              <div className="space-y-1">
                                <h4 className="font-black text-orange-500 text-xs uppercase tracking-[0.2em] mb-2">Coach Reflection</h4>
                                <p className="text-white text-2xl font-bold leading-tight italic">
                                  "{lastFeedback.motivationalMessage}"
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        )}

                        {currentWorkout ? (
                          <motion.div variants={bentoItemVariants}>
                            <WorkoutCard 
                              workout={currentWorkout} 
                              onComplete={() => setShowFeedbackForm(true)}
                              showFeedbackForm={showFeedbackForm}
                              setShowFeedbackForm={setShowFeedbackForm}
                              clientNote={clientNote}
                              setClientNote={setClientNote}
                              submitting={submitting}
                              submittingError={submittingError}
                              handleComplete={(feedback) => handleComplete(currentWorkout, feedback)}
                              isCompletedToday={isWorkoutCompletedToday}
                              setActiveVideo={setActiveVideo}
                              clientUid={clientId}
                            />
                          </motion.div>
                        ) : (
                          <motion.div 
                            variants={bentoItemVariants}
                            className="p-12 md:p-20 bg-zinc-950 border border-white/5 border-dashed rounded-[48px] flex flex-col items-center justify-center text-center space-y-6"
                          >
                            <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center group">
                               <Activity className="w-10 h-10 text-zinc-700 animate-pulse group-hover:text-orange-500 transition-colors" />
                            </div>
                            <div>
                               <h3 className="text-3xl font-black uppercase text-white/50">Rest & Recover</h3>
                               <p className="text-zinc-500 max-w-sm mx-auto mt-2 font-medium">Coach Nik is finalizing your next training block. Use this time to optimize your nutrition and rest.</p>
                            </div>
                          </motion.div>
                        )}

                        <motion.div variants={bentoItemVariants}>
                          <WorkoutHistoryList 
                            workouts={allWorkouts}
                            feedback={allFeedback}
                            onViewWorkout={handleHistoryWorkoutClick}
                          />
                        </motion.div>
                      </div>

                      <div className="lg:col-span-1 space-y-4">
                        <motion.div 
                          variants={bentoItemVariants}
                          className="bg-zinc-900 p-8 rounded-[40px] border border-white/5 relative overflow-hidden group"
                        >
                           <div className="absolute top-0 right-0 p-4 opacity-5 bg-gradient-to-br from-orange-500 to-transparent w-full h-full group-hover:opacity-10 transition-opacity" />
                           <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-6">Health Pulse</p>
                           <div className="space-y-8">
                             {[
                               { label: 'Energy', value: 'Prime', color: 'text-orange-500', icon: Zap },
                               { label: 'Focus', value: 'High', color: 'text-blue-500', icon: Target },
                               { label: 'Mindset', value: 'Elite', color: 'text-green-500', icon: Crown },
                             ].map((stat, i) => (
                               <div key={i} className="flex flex-col gap-1 relative group">
                                 <div className="flex justify-between items-end">
                                   <div className="flex items-center gap-2">
                                     <stat.icon className={cn("w-3 h-3 opacity-50", stat.color)} />
                                     <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{stat.label}</span>
                                   </div>
                                   <span className={cn("text-lg font-black italic uppercase", stat.color)}>{stat.value}</span>
                                 </div>
                                 <div className="w-full h-1 bg-zinc-950 rounded-full mt-2 overflow-hidden">
                                   <div className={cn("h-full w-full opacity-20 bg-current", stat.color)} />
                                 </div>
                               </div>
                             ))}
                           </div>
                        </motion.div>

                        <motion.div 
                          variants={bentoItemVariants}
                          className="bg-zinc-900 p-8 rounded-[40px] border border-white/5 flex flex-col justify-between aspect-square group hover:border-orange-500/50 transition-all duration-700 shadow-2xl relative overflow-hidden"
                        >
                          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-150 transition-transform duration-1000">
                             <Droplets className="w-40 h-40 text-blue-500" />
                          </div>
                          <div className="flex justify-between items-start relative z-10">
                            <div className="p-4 bg-zinc-950 rounded-[28px] group-hover:bg-blue-500 transition-all duration-500 shadow-lg shadow-black/40">
                               <Droplets className="w-7 h-7 text-zinc-500 group-hover:text-white" />
                            </div>
                            <button 
                              onClick={() => {
                                if (isPreview) return;
                                const newAmount = (todayMetrics?.waterIntake || 0) + 250;
                                const dateStr = format(new Date(), 'yyyy-MM-dd');
                                const q = query(collection(db, 'metrics'), where('clientId', '==', clientId), where('date', '==', dateStr));
                                getDocs(q).then(snap => {
                                  if (!snap.empty) {
                                    updateDoc(doc(db, 'metrics', snap.docs[0].id), { waterIntake: newAmount, updatedAt: serverTimestamp() });
                                  } else {
                                    addDoc(collection(db, 'metrics'), { clientId: clientId, date: dateStr, waterIntake: newAmount, stepCount: 0, calories: 0, createdAt: serverTimestamp() });
                                  }
                                });
                              }}
                              className="p-3 bg-zinc-800 rounded-2xl hover:bg-zinc-700 transition-colors"
                            >
                              <Plus className="w-5 h-5" />
                            </button>
                          </div>
                          <div className="relative z-10">
                            <p className="text-6xl font-black tracking-tighter mb-1 mt-4">{todayMetrics?.waterIntake || 0}<span className="text-lg ml-1 font-normal opacity-50 not-italic">ml</span></p>
                            <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Level: <span className="text-blue-500 lowercase font-serif italic text-sm">Optimal</span></p>
                          </div>
                        </motion.div>

                        {/* Google Fit Connection Card Removed */}
                      </div>
                    </div>
                  </motion.div>
                )}

            {activeTab === 'profile' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <ProfileSection 
                  user={user} 
                  profile={profile} 
                  setShowChat={setShowChat} 
                />
              </motion.div>
            )}

            {activeTab === 'nutrition' && (
              <motion.div
                key="nutrition"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="max-w-4xl mx-auto space-y-8"
              >
                <div className="text-center space-y-2">
                  <div className="inline-flex p-4 bg-orange-500/10 rounded-full text-orange-500 mb-4">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <h2 className="text-3xl font-bold">Your Nutrition Framework</h2>
                  <p className="text-zinc-500">Structured eating for massive results, designed by Coach Nik.</p>
                </div>

                {activeNutritionPlan ? (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-8">
                      <div className="bg-zinc-900 border border-zinc-800 rounded-[40px] p-8 md:p-12 space-y-10 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5">
                          <Utensils className="w-32 h-32 text-orange-500" />
                        </div>

                        <div className="space-y-4 relative">
                          <div className="inline-block px-3 py-1 bg-orange-500/10 border border-orange-500/20 rounded-full text-[10px] font-bold text-orange-500 uppercase tracking-widest">
                            Active Strategy
                          </div>
                          <h3 className="text-4xl font-black">{activeNutritionPlan.name}</h3>
                          <p className="text-lg text-zinc-400 leading-relaxed max-w-xl">
                            {activeNutritionPlan.description}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 text-center group hover:border-orange-500/50 transition-all">
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Calories</p>
                            <p className="text-3xl font-black text-white">{activeNutritionPlan.targetMacros.calories}</p>
                          </div>
                          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 text-center group hover:border-blue-500/50 transition-all">
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Protein</p>
                            <p className="text-3xl font-black text-blue-500">{activeNutritionPlan.targetMacros.protein}g</p>
                          </div>
                          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 text-center group hover:border-green-500/50 transition-all">
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Carbs</p>
                            <p className="text-3xl font-black text-green-500">{activeNutritionPlan.targetMacros.carbs}g</p>
                          </div>
                          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 text-center group hover:border-orange-500/50 transition-all">
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Fats</p>
                            <p className="text-3xl font-black text-orange-500">{activeNutritionPlan.targetMacros.fats}g</p>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/50 pb-4">
                            <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-3">
                              Planned Meal Schedule
                            </h4>
                            <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800 max-w-full overflow-x-auto">
                              {[1, 2, 3, 4, 5, 6, 7].map(day => {
                                const hasMealsForDay = activeNutritionPlan.plannedMeals?.some(m => m.dayNumber === day);
                                const isCurrentDayOfWeek = (new Date().getDay() === 0 ? 7 : new Date().getDay()) === day;
                                return (
                                  <button
                                    key={day}
                                    onClick={() => setSelectedNutritionDay(day)}
                                    className={cn(
                                      "w-8 h-8 rounded-lg text-[10px] font-black transition-all relative flex items-center justify-center min-w-[32px]",
                                      selectedNutritionDay === day 
                                        ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" 
                                        : "text-zinc-600 hover:text-zinc-400"
                                    )}
                                  >
                                    D{day}
                                    {hasMealsForDay && (
                                      <div className={cn(
                                        "absolute bottom-1 w-1 h-1 rounded-full",
                                        selectedNutritionDay === day ? "bg-white" : "bg-orange-500"
                                      )} />
                                    )}
                                    {isCurrentDayOfWeek && (
                                      <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-blue-500 rounded-full border border-zinc-950" title="Today (Current Day of Week)" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="space-y-3">
                            {activeNutritionPlan.plannedMeals?.filter(m => !m.dayNumber || m.dayNumber === selectedNutritionDay).length > 0 ? (
                              activeNutritionPlan.plannedMeals
                                .filter(m => !m.dayNumber || m.dayNumber === selectedNutritionDay)
                                .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
                                .map((m) => (
                                  <div 
                                    key={m.id} 
                                    className={cn(
                                      "flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300",
                                      m.isCompleted 
                                        ? "bg-orange-500/10 border-orange-500/30 opacity-75" 
                                        : "bg-zinc-950/50 border-zinc-800/50 hover:border-zinc-700"
                                    )}
                                  >
                                    <button 
                                      onClick={() => handleTogglePlannedMeal(m.id)}
                                      className={cn(
                                        "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                                        m.isCompleted 
                                          ? "bg-orange-500 border-orange-500 text-white" 
                                          : "border-zinc-700 hover:border-orange-500"
                                      )}
                                    >
                                      {m.isCompleted && <Check className="w-4 h-4" />}
                                    </button>
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded font-mono uppercase">{m.time}</span>
                                        <h5 className={cn("font-bold text-sm", m.isCompleted ? "text-zinc-500 line-through" : "text-white")}>
                                          {m.name}
                                        </h5>
                                      </div>
                                      <p className="text-xs text-zinc-500 mt-0.5">{m.notes}</p>
                                    </div>
                                    {m.isCompleted && (
                                      <span className="text-[10px] font-bold text-orange-500 uppercase">Tracked</span>
                                    )}
                                  </div>
                                ))
                            ) : (
                              <div className="py-12 text-center border border-dashed border-zinc-800 rounded-[32px]">
                                <Utensils className="w-8 h-8 text-zinc-800 mx-auto mb-2 opacity-30" />
                                <p className="text-[10px] font-black text-zinc-700 uppercase tracking-widest italic">Rest phase or unconfigured Day {selectedNutritionDay}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-6">
                          <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-3">
                            <div className="h-px flex-1 bg-zinc-800" />
                            Core Guidelines
                            <div className="h-px flex-1 bg-zinc-800" />
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {activeNutritionPlan.guidelines.map((g, i) => (
                              <div key={i} className="flex items-center gap-4 bg-zinc-950/50 p-4 rounded-2xl border border-zinc-800/50 group hover:border-orange-500/30 transition-all">
                                <div className="w-2 h-2 rounded-full bg-orange-500 group-hover:scale-125 transition-transform" />
                                <span className="text-sm text-zinc-300 font-medium">{g}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Visual Progress Integration Hook */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 flex flex-col md:flex-row items-center gap-8">
                        <div className="flex-1 space-y-4">
                          <div className="flex items-center gap-2">
                            <span className="relative flex h-3 w-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
                            </span>
                            <h4 className="font-bold text-sm uppercase tracking-widest text-orange-500">Smart Connect</h4>
                          </div>
                          <h3 className="text-2xl font-bold">Sync with AI Tracker</h3>
                          <p className="text-zinc-500 text-sm leading-relaxed">
                            Your customized nutritional guidelines, macronutrient targets, and recommended foods.
                          </p>
                          <button 
                            onClick={() => setActiveTab('nutrition')}
                            className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2 rounded-xl text-xs font-bold transition-all"
                          >
                            Go to Nutrition
                          </button>
                        </div>
                        <div className="w-full md:w-48 aspect-square bg-zinc-950 rounded-3xl border border-zinc-800 flex items-center justify-center relative overflow-hidden group">
                           <Utensils className="w-12 h-12 text-zinc-800 group-hover:scale-110 group-hover:text-orange-500/20 transition-all duration-500" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 space-y-6">
                        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Recommended Foods</h4>
                        <div className="space-y-3">
                          {activeNutritionPlan.recommendedFoods?.length > 0 ? (
                            activeNutritionPlan.recommendedFoods.map((f, i) => (
                              <div key={i} className="flex items-center gap-3 text-sm text-zinc-300">
                                <div className="w-1 h-1 rounded-full bg-green-500" />
                                {f}
                              </div>
                            ))
                          ) : (
                            <p className="text-zinc-600 text-xs italic">No specific recommendations yet. Focus on whole foods.</p>
                          )}
                        </div>
                      </div>

                      <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 space-y-6">
                        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Acknowledge Plan</h4>
                        <p className="text-xs text-zinc-500 leading-relaxed">
                          By following this plan, you agree to track your intake as accurately as possible for the best results.
                        </p>
                        <div className="p-4 bg-orange-500/10 rounded-2xl border border-orange-500/20 flex items-center gap-3">
                          <Award className="w-5 h-5 text-orange-500" />
                          <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Elite Strategy</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-[40px] p-24 text-center space-y-8">
                    <div className="w-20 h-20 bg-zinc-900 rounded-full border border-zinc-800 flex items-center justify-center mx-auto">
                      <Utensils className="w-8 h-8 text-zinc-800" />
                    </div>
                    <div className="max-w-md mx-auto space-y-4">
                      <h3 className="text-2xl font-bold">Strategy Pending</h3>
                      <p className="text-zinc-500 text-sm leading-relaxed">
                        Coach Nik is currently analyzing your performance and goals to craft the perfect nutrition framework for you. Check back soon for your personalized elite strategy.
                      </p>
                      <button 
                         onClick={() => setShowChat(true)}
                         className="px-8 py-3 bg-zinc-800 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-zinc-700 transition-all"
                      >
                        Ask Nik about your plan
                      </button>
                    </div>
                  </div>
                )}
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
                  profile={profile}
                  todayMetrics={todayMetrics} 
                  metrics={metrics}
                  meals={meals}
                  sendAutomatedCoachMessage={sendAutomatedCoachMessage} 
                  activeNutritionPlan={activeNutritionPlan}
                  setToastNotification={setToastNotification}
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
                  viewDate={calendarViewDate}
                  setViewDate={setCalendarViewDate}
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
                className="max-w-4xl mx-auto space-y-8 pb-20"
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

                {/* Achievements & Badges */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 space-y-8">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                       <Award className="w-5 h-5 text-orange-500" />
                       Achievements & Badges
                    </h3>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-950 px-3 py-1 rounded-full border border-zinc-800">
                      {profile.badges?.filter(b => b.unlockedAt).length || 0} / 8 UNLOCKED
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { id: 'consistency_1', name: '7-Day Streak', icon: 'Flame', desc: 'Maintain a 7-day activity streak', cat: 'consistency' },
                      { id: 'workout_10', name: 'Decathlon', icon: 'Shield', desc: 'Complete 10 full workouts', cat: 'workout' },
                      { id: 'nutrition_log', name: 'Meal Master', icon: 'Utensils', desc: 'Log 50 meals with AI', cat: 'nutrition' },
                      { id: 'early_bird', name: 'Early Bird', icon: 'Sun', desc: 'Finish 5 workouts before 9 AM', cat: 'milestone' },
                      { id: 'heavy_hitter', name: 'Heavy Hitter', icon: 'Zap', desc: 'Log a PR weight on any lift', cat: 'workout' },
                      { id: 'water_pro', name: 'Hydration Pro', icon: 'Droplets', desc: 'Hit water goals 5 days in a row', cat: 'milestone' },
                      { id: 'elite_tier', name: 'Elite Status', icon: 'Crown', desc: 'Coach Nik marked you as Elite', cat: 'milestone' },
                      { id: 'macro_perfect', name: 'Macro Perfect', icon: 'Target', desc: 'Hit targets within 5% error', cat: 'nutrition' },
                    ].map((b) => {
                      const isUnlocked = profile.badges?.find(pb => pb.id === b.id)?.unlockedAt;
                      const IconComp = {
                         Flame, Shield, Utensils, Sun, Zap, Droplets, Crown, Target
                      }[b.icon] || Award;

                      return (
                        <div key={b.id} className={cn(
                          "relative group aspect-square rounded-[32px] border flex flex-col items-center justify-center p-4 text-center transition-all duration-500",
                          isUnlocked 
                            ? "bg-zinc-950 border-orange-500/50 shadow-lg shadow-orange-500/10" 
                            : "bg-zinc-950/50 border-zinc-800 opacity-40 grayscale"
                        )}>
                          <div className={cn(
                            "mb-3 p-3 rounded-2xl transition-all duration-500",
                            isUnlocked ? "bg-orange-500 text-white" : "bg-zinc-900 text-zinc-700"
                          )}>
                            <IconComp className="w-6 h-6" />
                          </div>
                          <p className="text-[10px] font-black uppercase tracking-tighter text-white mb-1">{b.name}</p>
                          <p className="text-[8px] text-zinc-600 leading-tight group-hover:text-zinc-400 transition-colors">{b.desc}</p>
                          
                          {isUnlocked && (
                            <motion.div 
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="absolute top-2 right-2"
                            >
                              <div className="w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center border-2 border-zinc-950">
                                <Check className="w-2.5 h-2.5 text-white" />
                              </div>
                            </motion.div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Google Fit Integration Widget */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl text-white shadow-lg shadow-orange-500/10">
                        <Footprints className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">Google Fit Integration</h3>
                        <p className="text-xs text-zinc-500">Sync and track your active daily step metric automatically.</p>
                      </div>
                    </div>
                    <div>
                      {isFitConnected ? (
                        <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-orange-500/30 bg-orange-500/5 text-orange-500 text-xs font-bold leading-none uppercase tracking-wider">
                          <Check className="w-4 h-4" />
                          Google Fit Connected ✓
                        </span>
                      ) : (
                        <button
                          onClick={handleConnectGoogleFit}
                          className="px-6 py-2.5 bg-orange-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20 flex items-center gap-2"
                        >
                          Connect Google Fit
                        </button>
                      )}
                    </div>
                  </div>

                  {isFitConnected ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                      {/* Step Count Card */}
                      <div className="bg-zinc-950 border border-zinc-800/80 rounded-3xl p-6 flex items-center justify-between shadow-xl shadow-black/10">
                        <div className="space-y-4">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Today's Step Count</p>
                            <h4 className="text-4xl font-extrabold italic text-white leading-none">
                              {todayMetrics?.stepCount?.toLocaleString() || '0'}
                            </h4>
                          </div>
                          
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[11px] text-zinc-400">
                              Goal: <span className="font-bold text-zinc-300">{(profile?.stepGoal || 8000).toLocaleString()}</span> steps
                            </span>
                            <span className="text-[10px] font-semibold text-orange-500">
                              {Math.round(((todayMetrics?.stepCount || 0) / (profile?.stepGoal || 8000)) * 100)}% Completed
                            </span>
                          </div>

                          <button
                            onClick={syncSteps}
                            disabled={isSyncingSteps}
                            className="inline-flex items-center gap-2 text-[10px] uppercase tracking-widest font-black text-orange-500 hover:text-orange-400 disabled:opacity-50 transition-colors"
                          >
                            {isSyncingSteps ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5" />
                            )}
                            {isSyncingSteps ? 'Syncing...' : 'Sync Now'}
                          </button>
                        </div>

                        {/* Progress Ring */}
                        <div className="relative flex items-center justify-center">
                          {/* Inner icon */}
                          <div className="absolute text-orange-500">
                            <Footprints className="w-6 h-6" />
                          </div>
                          
                          {/* SVG Ring */}
                          {(() => {
                            const stepsVal = todayMetrics?.stepCount || 0;
                            const goalVal = profile?.stepGoal || 8000;
                            const percent = Math.min(Math.round((stepsVal / goalVal) * 100), 100);
                            
                            const radius = 54;
                            const strokeWidth = 8;
                            const normRadius = radius - strokeWidth;
                            const circ = normRadius * 2 * Math.PI;
                            const offset = circ - (percent / 100) * circ;
                            
                            return (
                              <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
                                <circle
                                  stroke="#18181b"
                                  fill="transparent"
                                  strokeWidth={strokeWidth}
                                  r={normRadius}
                                  cx={radius}
                                  cy={radius}
                                />
                                <circle
                                  stroke="url(#orangeGradient)"
                                  fill="transparent"
                                  strokeWidth={strokeWidth}
                                  strokeDasharray={`${circ} ${circ}`}
                                  style={{ strokeDashoffset: offset }}
                                  strokeLinecap="round"
                                  r={normRadius}
                                  cx={radius}
                                  cy={radius}
                                />
                                <defs>
                                  <linearGradient id="orangeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#fb923c" />
                                    <stop offset="100%" stopColor="#ea580c" />
                                  </linearGradient>
                                </defs>
                              </svg>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="space-y-3 p-4 border border-zinc-800/40 rounded-2xl bg-zinc-950/20 text-zinc-400 text-xs leading-relaxed">
                        <p>
                          Your steps are synced automatically every 10 minutes to maintain consistency. If your latest physical sessions are missing, click <span className="font-bold text-white">Sync Now</span> to fetch them.
                        </p>
                        {syncError && (
                          <div className="text-red-500 text-[11px] font-medium mt-2 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl flex items-center gap-2">
                            <span>⚠</span> {syncError}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="border border-dashed border-zinc-800 rounded-3xl p-8 text-center bg-zinc-950/20">
                      <p className="text-zinc-500 text-sm mb-4">
                        Connect Google Fit to import and track your everyday steps and physical metrics automatically in your coaching portal.
                      </p>
                      <button
                        onClick={handleConnectGoogleFit}
                        className="px-6 py-2.5 bg-orange-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20 inline-flex items-center gap-2"
                      >
                        Authorize & Sync Now
                      </button>
                    </div>
                  )}
                </div>

                {/* Google Calendar Integration Widget */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl text-white shadow-lg shadow-blue-500/10">
                        <CalendarIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">Google Calendar Integration</h3>
                        <p className="text-xs text-zinc-500">Automatically sync scheduled training sessions and coaching protocols into your personal calendar.</p>
                      </div>
                    </div>
                    <div>
                      {isCalConnected ? (
                        <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-blue-500/30 bg-blue-500/5 text-blue-400 text-xs font-bold leading-none uppercase tracking-wider">
                          <Check className="w-4 h-4" />
                          Calendar Connected ✓
                        </span>
                      ) : (
                        <button
                          onClick={handleConnectGoogleCalendar}
                          className="px-6 py-2.5 bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-600 transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2"
                        >
                          Connect Google Calendar
                        </button>
                      )}
                    </div>
                  </div>

                  {isCalConnected ? (
                    <div className="space-y-3 p-6 border border-zinc-800/40 rounded-2xl bg-zinc-950/20 text-zinc-400 text-xs leading-relaxed flex items-start gap-3">
                      <div className="p-2 bg-blue-500/10 rounded-xl text-blue-400 shrink-0">
                        <CalendarIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-bold text-zinc-300 mb-1">Synchronized & Active</p>
                        <p>
                          Your coaching workouts and custom target sessions will automatically sync to your connected Google Calendar. Look out for the 💪 <span className="text-white font-medium">[Workout Name] — Fit with Nik</span> events on your calendar pages!
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="border border-dashed border-zinc-800 rounded-3xl p-8 text-center bg-zinc-950/20">
                      <p className="text-zinc-500 text-sm mb-4">
                        Connect your personal Google Calendar. This allows Coach Nik's automated training suite to place scheduled workout sessions cleanly into your private dashboard.
                      </p>
                      <button
                        onClick={handleConnectGoogleCalendar}
                        className="px-6 py-2.5 bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-600 transition-all shadow-lg shadow-blue-500/20 inline-flex items-center gap-2"
                      >
                        Authorize Calendar Sync
                      </button>
                    </div>
                  )}
                </div>

                <ConsistencyTracker 
                  workouts={allWorkouts} 
                  feedback={allFeedback} 
                />

                <PersonalBestsWall workouts={allWorkouts} />

                <MetricsTracker 
                  user={user} 
                  profile={profile}
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
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-lg flex items-center gap-2">
                        <Scale className="w-5 h-5 text-purple-500" />
                        Weight Progress
                      </h3>
                      <div className="text-right">
                        <p className="text-2xl font-black text-white italic">{todayMetrics?.weight || profile.weight || '--'} <span className="text-xs text-zinc-500 not-italic uppercase tracking-widest ml-1">kg</span></p>
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Current Status</p>
                      </div>
                    </div>
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

                  {/* Step count chart removed */}
                </div>
              </motion.div>
            )}

            {activeTab === 'goals' && (
              <motion.div
                key="goals"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-8"
              >
                <GoalsAndHabits 
                  habits={habits} 
                  habitLogs={habitLogs} 
                  goals={goals} 
                  user={user} 
                  profile={profile} 
                  adminProfile={adminProfile}
                  sendAutomatedCoachMessage={sendAutomatedCoachMessage}
                />
              </motion.div>
            )}

            {activeTab === 'tasks' && (
              <motion.div
                key="tasks"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-8"
              >
                <TasksAndReminders 
                  reminders={reminders}
                  user={user}
                  profile={profile}
                  habits={habits}
                  goals={goals}
                />
              </motion.div>
            )}

            {['meal', 'badges', 'classes'].includes(activeTab) && (
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
        </div>
      </div>

      {/* Workout Detail Modal */}
      <AnimatePresence>
        {selectedWorkout && (
          <div className={cn(
            "fixed inset-0 z-[100] flex items-center justify-center transition-all duration-300",
            isWorkoutFullScreen ? "p-0" : "p-4"
          )}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setSelectedWorkout(null);
                setIsWorkoutFullScreen(false);
              }}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={cn(
                "relative bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden flex flex-col transition-all duration-300",
                isWorkoutFullScreen 
                  ? "w-screen h-screen max-w-none max-h-none rounded-none border-none bg-zinc-950" 
                  : "w-full max-w-3xl rounded-3xl max-h-[90vh]"
              )}
            >
              <div className="p-8 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50 backdrop-blur-xl relative">
                <div className="absolute bottom-0 left-0 h-1 bg-orange-500 transition-all duration-500 ease-out" 
                     style={{ width: `${(allFeedback.some(f => f.workoutId === selectedWorkout.id) ? 100 : 0)}%` }} />
                <div>
                  <div className="flex items-center gap-3 text-orange-500 font-black text-[10px] uppercase tracking-[0.2em] mb-2">
                    <div className="p-1 px-2 bg-orange-500/10 rounded-md border border-orange-500/20">
                      Week {selectedWorkout.weekNumber} • Day {selectedWorkout.dayNumber}
                    </div>
                  </div>
                  <h3 className="font-black text-3xl italic tracking-tighter uppercase leading-none">Assemble <span className="text-orange-500">Power</span></h3>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsEditingWorkout(!isEditingWorkout)}
                    className="p-3 px-4 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 rounded-2xl border border-orange-500/20 transition-all text-xs font-black uppercase tracking-wider flex items-center gap-2"
                    title={isEditingWorkout ? "Cancel Editing" : "Modify Session Protocol"}
                  >
                    {isEditingWorkout ? (
                      <>
                        <X className="w-4 h-4" />
                        <span>Cancel</span>
                      </>
                    ) : (
                      <>
                        <Edit3 className="w-4 h-4" />
                        <span>Modify Workout</span>
                      </>
                    )}
                  </button>
                  <button 
                    onClick={() => setIsWorkoutFullScreen(!isWorkoutFullScreen)}
                    className="p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-2xl transition-all"
                    title={isWorkoutFullScreen ? "Exit Fullscreen" : "Fullscreen Mode"}
                  >
                    {isWorkoutFullScreen ? (
                      <Minimize2 className="w-5 h-5 text-orange-500 animate-pulse" />
                    ) : (
                      <Maximize2 className="w-5 h-5" />
                    )}
                  </button>
                  <button 
                    onClick={() => {
                      setSelectedWorkout(null);
                      setIsWorkoutFullScreen(false);
                      setIsEditingWorkout(false);
                    }}
                    className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition-all text-zinc-400 hover:text-white"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className={cn(
                "flex-1 overflow-y-auto custom-scrollbar transition-all duration-300",
                isWorkoutFullScreen ? "p-8 md:p-12 max-w-5xl mx-auto w-full" : "p-6"
              )}>
                {isEditingWorkout ? (
                  <div className="space-y-8 animate-fadeIn text-left">
                    <div>
                      <h4 className="text-sm font-black text-orange-500 uppercase tracking-[0.2em] mb-1">Edit Session Plan</h4>
                      <p className="text-xs text-zinc-400">Rearrange and modify drills, targets, or overall notes for this training day.</p>
                    </div>

                    {/* Global Day Instructions */}
                    <div className="bg-zinc-900/50 p-6 rounded-[28px] border border-zinc-800 space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500 flex items-center gap-2">
                        <MessageSquare className="w-3.5 h-3.5 text-orange-500" />
                        Day Instructions / Coach Notes
                      </label>
                      <textarea
                        value={editableNotes}
                        onChange={(e) => setEditableNotes(e.target.value)}
                        placeholder="Define general workout notes, specific goals, RPE rules, or details for the protocol today..."
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-5 text-sm text-zinc-300 outline-none focus:border-orange-500/30 min-h-[100px] resize-none transition-all italic"
                      />
                    </div>

                    {/* Exercises Section */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500 flex items-center gap-2 font-mono">
                          <Dumbbell className="w-3.5 h-3.5" />
                          Exercises Sequence
                        </h4>
                        <button
                          onClick={() => {
                            setEditableExercises([
                              ...editableExercises,
                              { name: 'New Exercise', sets: 3, reps: '10', weight: '', rest: '60s', block: 'Conditioning', coachNote: '', youtubeLink: '' }
                            ]);
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 font-black text-[10px] uppercase tracking-widest rounded-xl border border-orange-500/20 transition-all"
                        >
                          <Plus className="w-4 h-4" />
                          Add Lift
                        </button>
                      </div>

                      <div className="space-y-4">
                        {editableExercises.map((ex, idx) => (
                          <div key={idx} className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 relative group overflow-hidden">
                            <div className="absolute top-4 right-4 flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setEditableExercises(editableExercises.filter((_, i) => i !== idx));
                                }}
                                className="p-2 bg-zinc-950 hover:bg-red-500/10 text-zinc-500 hover:text-red-500 rounded-xl border border-zinc-800 transition-all"
                                title="Delete Exercise"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Exercise Name</label>
                                <input
                                  type="text"
                                  value={ex.name}
                                  onChange={(e) => {
                                    const updated = [...editableExercises];
                                    updated[idx].name = e.target.value;
                                    setEditableExercises(updated);
                                  }}
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-white focus:border-orange-500/40 outline-none transition-all"
                                  placeholder="e.g. Barbell Bench Press"
                                />
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Block Type</label>
                                <select
                                  value={ex.block || 'Conditioning'}
                                  onChange={(e) => {
                                    const updated = [...editableExercises];
                                    updated[idx].block = e.target.value;
                                    setEditableExercises(updated);
                                  }}
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-white focus:border-orange-500/40 outline-none transition-all cursor-pointer"
                                >
                                  <option value="Warm-Up">Warm-Up</option>
                                  <option value="Conditioning">Conditioning</option>
                                  <option value="Cool Down">Cool Down</option>
                                </select>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Sets</label>
                                <input
                                  type="number"
                                  value={ex.sets}
                                  onChange={(e) => {
                                    const updated = [...editableExercises];
                                    updated[idx].sets = Number(e.target.value);
                                    setEditableExercises(updated);
                                  }}
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-white text-center focus:border-orange-500/40 outline-none transition-all"
                                  placeholder="e.g. 3"
                                />
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Reps</label>
                                <input
                                  type="text"
                                  value={ex.reps}
                                  onChange={(e) => {
                                    const updated = [...editableExercises];
                                    updated[idx].reps = e.target.value;
                                    setEditableExercises(updated);
                                  }}
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-white text-center focus:border-orange-500/40 outline-none transition-all"
                                  placeholder="e.g. 10 or 8-12"
                                />
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Target Weight</label>
                                <input
                                  type="text"
                                  value={ex.weight || ''}
                                  onChange={(e) => {
                                    const updated = [...editableExercises];
                                    updated[idx].weight = e.target.value;
                                    setEditableExercises(updated);
                                  }}
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-white text-center focus:border-orange-500/40 outline-none transition-all"
                                  placeholder="e.g. 60kg or Bodyweight"
                                />
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Rest Interval</label>
                                <input
                                  type="text"
                                  value={ex.rest}
                                  onChange={(e) => {
                                    const updated = [...editableExercises];
                                    updated[idx].rest = e.target.value;
                                    setEditableExercises(updated);
                                  }}
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-white text-center focus:border-orange-500/40 outline-none transition-all font-mono text-xs"
                                  placeholder="e.g. 90s"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Coach Notes / Tips</label>
                                <textarea
                                  value={ex.coachNote || ''}
                                  onChange={(e) => {
                                    const updated = [...editableExercises];
                                    updated[idx].coachNote = e.target.value;
                                    setEditableExercises(updated);
                                  }}
                                  placeholder="Add specific movement guidelines, tempo, or safety advices..."
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-sm text-zinc-300 outline-none focus:border-orange-500/40 min-h-[70px] resize-none transition-all"
                                />
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">YouTube Video URL</label>
                                <input
                                  type="text"
                                  value={ex.youtubeLink || ''}
                                  onChange={(e) => {
                                    const updated = [...editableExercises];
                                    updated[idx].youtubeLink = e.target.value;
                                    setEditableExercises(updated);
                                  }}
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-zinc-400 focus:border-orange-500/40 outline-none transition-all placeholder:text-zinc-800 font-mono text-xs"
                                  placeholder="https://www.youtube.com/watch?v=..."
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {editableExercises.length === 0 && (
                        <div className="p-16 border border-dashed border-zinc-800 rounded-[32px] text-zinc-500 text-center">
                          Drills catalog is empty. Click "Add Lift" to input a training task.
                        </div>
                      )}
                    </div>

                    {/* Action Block Submit */}
                    <div className="flex gap-4 pt-10 border-t border-zinc-800">
                      <button
                        onClick={async () => {
                          setSavingWorkout(true);
                          try {
                            await updateDoc(doc(db, 'workouts', selectedWorkout.id), {
                              exercises: editableExercises,
                              notes: editableNotes
                            });
                            const updatedWorkout = {
                              ...selectedWorkout,
                              exercises: editableExercises,
                              notes: editableNotes
                            };
                            setSelectedWorkout(updatedWorkout);
                            setIsEditingWorkout(false);
                            setToastNotification({
                              title: 'Session Plan Saved',
                              message: 'Workout modifications successfully synchronized to Firestore database.',
                              type: 'success'
                            });
                          } catch (err) {
                            console.error("Failed to save workout modifications:", err);
                          } finally {
                            setSavingWorkout(false);
                          }
                        }}
                        disabled={savingWorkout}
                        className="flex-1 py-4 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black uppercase text-xs tracking-widest rounded-2xl transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2"
                      >
                        {savingWorkout ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Commit Changes
                      </button>
                      <button
                        onClick={() => setIsEditingWorkout(false)}
                        className="px-8 py-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 font-black uppercase text-xs tracking-widest rounded-2xl transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <WorkoutCard 
                    workout={selectedWorkout} 
                    onComplete={() => setShowFeedbackForm(true)}
                    showFeedbackForm={showFeedbackForm}
                    setShowFeedbackForm={setShowFeedbackForm}
                    clientNote={clientNote}
                    setClientNote={setClientNote}
                    submitting={submitting}
                    submittingError={submittingError}
                    handleComplete={(feedback) => handleComplete(selectedWorkout, feedback)}
                    isCompletedToday={allFeedback.some(f => {
                      if (!f.createdAt || f.workoutId !== selectedWorkout.id) return false;
                      const fDate = (f.createdAt as any).toDate ? (f.createdAt as any).toDate() : new Date(f.createdAt as any);
                      return isSameDay(fDate, new Date());
                    })}
                    setActiveVideo={setActiveVideo}
                    clientUid={user.uid}
                  />
                )}
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
            "w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95 relative",
            showChat ? "bg-zinc-800 text-white" : "bg-orange-500 text-white shadow-orange-500/20"
          )}
        >
          {showChat ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
          {!showChat && unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-4 border-zinc-950 animate-bounce">
              {unreadCount}
            </span>
          )}
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

      {/* Success Celebration Overlay */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.5, y: 50, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.8, y: -20, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-[40px] p-12 text-center shadow-2xl max-w-sm relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-orange-500/10 to-transparent pointer-events-none" />
              
              <motion.div 
                animate={{ rotate: [0, 10, -10, 10, 0], scale: [1, 1.1, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="inline-flex p-6 bg-orange-500 rounded-full text-white mb-8 shadow-xl shadow-orange-500/40 relative z-10"
              >
                <Trophy className="w-12 h-12" />
              </motion.div>

              <div className="space-y-4 relative z-10">
                <motion.h2 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-3xl font-black text-white"
                >
                  WORKOUT CRUSHED!
                </motion.h2>
                <motion.p 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-zinc-400 font-medium"
                >
                  Every session brings you closer to your elite version. Coach Nik is proud of your effort!
                </motion.p>
              </div>

              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: 'spring' }}
                className="mt-8 flex justify-center gap-2"
              >
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{ 
                      y: [0, -10, 0],
                      opacity: [0.5, 1, 0.5]
                    }}
                    transition={{ 
                      duration: 1.5, 
                      repeat: Infinity, 
                      delay: i * 0.1 
                    }}
                  >
                    <Sparkles className="w-5 h-5 text-orange-400" />
                  </motion.div>
                ))}
              </motion.div>

              <button 
                onClick={() => setShowSuccess(false)}
                className="mt-10 w-full py-4 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-2xl transition-all uppercase tracking-widest text-xs"
              >
                Let's Keep Going
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Menu Board */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] md:hidden"
          >
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-2xl" 
              onClick={() => setIsMobileMenuOpen(false)}
            />
            
            {/* Menu Board */}
            <motion.div
              initial={{ x: '-100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '-100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute inset-y-0 left-0 w-[85%] max-w-sm bg-zinc-950 border-r border-white/5 p-8 flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between mb-12">
                <div className="flex">
                  <DynamicKineticLogo size="sm" fixedRole="client" fixedTab={activeTab} />
                </div>
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 bg-zinc-900 rounded-xl text-zinc-500"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <nav className="flex-1 space-y-2 overflow-y-auto hide-scrollbar">
                {sidebarItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id as any);
                      setIsMobileMenuOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-5 px-5 py-4 rounded-3xl text-base font-black transition-all uppercase italic tracking-tighter text-left group",
                      activeTab === item.id 
                        ? "text-orange-500 bg-orange-500/10 border border-orange-500/20" 
                        : "text-zinc-500 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <item.icon className={cn("w-5 h-5 transition-transform group-hover:scale-110", activeTab === item.id ? "text-orange-500" : "text-zinc-700")} />
                    <span>{item.label}</span>
                    {item.id === 'dash' && unreadCount > 0 && (
                      <span className="ml-auto w-5 h-5 bg-orange-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-lg shadow-orange-500/40">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                ))}
              </nav>

              <div className="mt-8 pt-8 border-t border-white/5 space-y-4">
                 <button 
                   onClick={() => {
                     setShowChat(true);
                     setIsMobileMenuOpen(false);
                   }}
                   className="w-full relative group"
                 >
                   <div className="absolute inset-0 bg-orange-500 rounded-3xl blur-xl opacity-20" />
                   <div className="relative bg-zinc-900 border border-white/10 p-4 rounded-3xl flex items-center gap-4">
                     <div className="w-10 h-10 rounded-2xl bg-orange-500/10 flex items-center justify-center">
                       <MessageCircle className="w-5 h-5 text-orange-500" />
                     </div>
                     <div className="text-left">
                       <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Coach Chat</p>
                       <p className="text-sm font-bold text-white">Message Nik</p>
                     </div>
                   </div>
                 </button>
                 
                 <div className="flex items-center gap-4 p-4 bg-zinc-900/50 rounded-3xl border border-white/5">
                    <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10">
                      <img 
                        src={getAvatarUrl(user.email || undefined, profile.gender, profile.photoURL)} 
                        alt="Profile" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black uppercase truncate">{profile.displayName}</p>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase">{profile.role}</p>
                    </div>
                 </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification for Reminders */}
      <AnimatePresence>
        {toastNotification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] w-full max-w-sm"
          >
            <div className="mx-4 bg-zinc-900/90 backdrop-blur-2xl border border-orange-500/50 rounded-[32px] p-6 shadow-2xl shadow-orange-500/20 flex gap-4 items-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-orange-500">
                 <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent animate-[shimmer_2s_infinite]" />
              </div>
              <div className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center text-white flex-shrink-0">
                <Bell className="w-7 h-7" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-orange-500 italic">Elite Notice</span>
                  <button 
                    onClick={() => setToastNotification(null)}
                    className="p-1 hover:bg-white/5 rounded-lg text-zinc-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <h4 className="font-black text-white text-base leading-none mb-1">{toastNotification.title}</h4>
                <p className="text-xs text-zinc-400 font-medium leading-tight">{toastNotification.message}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeVideo && (
          <CinemaVideoPlayer 
            url={activeVideo.url} 
            title={activeVideo.title} 
            onClose={() => setActiveVideo(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function MetricsTracker({ 
  user, 
  profile,
  todayMetrics, 
  history,
  meals,
  allWorkouts,
  allFeedback
}: { 
  user: User, 
  profile: UserProfile,
  todayMetrics: BodyMetrics | null, 
  history: BodyMetrics[],
  meals: any[],
  allWorkouts: Workout[],
  allFeedback: Feedback[]
}) {
  const [water, setWater] = useState(todayMetrics?.waterIntake || 0);
  const [calories, setCalories] = useState(todayMetrics?.calories || 0);
  const [protein, setProtein] = useState(todayMetrics?.protein || 0);
  const [carbs, setCarbs] = useState(todayMetrics?.carbs || 0);
  const [fats, setFats] = useState(todayMetrics?.fats || 0);
  
  // Use profile weight as fallback for persistent weight
  const [weight, setWeight] = useState(todayMetrics?.weight || Number(profile.weight) || 0);
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
      setCalories(todayMetrics.calories);
      setProtein(todayMetrics.protein || 0);
      setCarbs(todayMetrics.carbs || 0);
      setFats(todayMetrics.fats || 0);
      if (todayMetrics.weight) {
        setWeight(todayMetrics.weight);
      }
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
        calories: Number(calories),
        protein: Number(protein),
        carbs: Number(carbs),
        fats: Number(fats),
        weight: Number(weight),
        createdAt: serverTimestamp()
      };

      // Sync weight to user profile as well
      await updateDoc(doc(db, 'users', user.uid), { weight: weight.toString() })
        .catch(err => handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`));

      if (todayMetrics?.id) {
        await updateDoc(doc(db, 'metrics', todayMetrics.id), metricsData)
          .catch(err => handleFirestoreError(err, OperationType.UPDATE, `metrics/${todayMetrics.id}`));
      } else {
        await addDoc(collection(db, 'metrics'), metricsData)
          .catch(err => handleFirestoreError(err, OperationType.CREATE, 'metrics'));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'metrics');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
  submittingError,
  handleComplete,
  isCompletedToday,
  setActiveVideo,
  clientUid
}: { 
  workout: Workout, 
  onComplete: () => void,
  showFeedbackForm: boolean,
  setShowFeedbackForm: (s: boolean) => void,
  clientNote: string,
  setClientNote: (s: string) => void,
  submitting: boolean,
  submittingError: string | null,
  handleComplete: (feedback?: Record<number, { 
    completedWeight: string, 
    completedReps: string, 
    completedSets: number, 
    clientNote: string, 
    isCompleted: boolean 
  }>) => void,
  isCompletedToday: boolean,
  setActiveVideo: (v: { url: string, title?: string } | null) => void,
  clientUid: string
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [exerciseFeedback, setExerciseFeedback] = useState<Record<number, { completedWeight: string, completedReps: string, completedSets: number, clientNote: string, isCompleted: boolean }>>({});

  useEffect(() => {
    if (workout.exercises) {
      const initialFeedback: Record<number, any> = {};
      workout.exercises.forEach((ex, idx) => {
        initialFeedback[idx] = {
          completedWeight: ex.completedWeight || '',
          completedReps: ex.completedReps || '',
          completedSets: ex.completedSets || 0,
          clientNote: ex.clientNote || '',
          isCompleted: ex.isCompleted || false
        };
      });
      setExerciseFeedback(initialFeedback);
    }
  }, [workout.id]);

  const updateExerciseFeedback = (idx: number, field: keyof typeof exerciseFeedback[0], value: any) => {
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
          <div className="flex items-center gap-2 text-zinc-500 font-bold text-[10px] uppercase tracking-[0.2em] mb-2">
            <Activity className="w-4 h-4 text-orange-500" />
            Active Session
          </div>
          <h2 className="text-4xl font-black tracking-tighter uppercase italic leading-none">Training <span className="text-orange-500">Protocol</span></h2>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black italic tracking-tighter text-white">
            {Object.values(exerciseFeedback).filter(f => f.isCompleted).length}
            <span className="text-zinc-600 text-sm not-italic ml-1">/ {workout.exercises.length}</span>
          </div>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Exercises Locked</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${(Object.values(exerciseFeedback).filter(f => f.isCompleted).length / workout.exercises.length) * 100}%` }}
          className="h-full bg-gradient-to-r from-orange-600 to-orange-400"
        />
      </div>

      <div className="space-y-8">
        {(() => {
          const blockOrder = ['Warm-Up', 'Conditioning', 'Cool Down'];
          const grouped = workout.exercises.reduce((acc, ex, idx) => {
            const block = ex.block || 'Main Session';
            if (!acc[block]) acc[block] = [];
            acc[block].push({ ...ex, originalIndex: idx });
            return acc;
          }, {} as Record<string, (Exercise & { originalIndex: number })[]>);

          const sortedBlockNames = Object.keys(grouped).sort((a, b) => {
            const indexA = blockOrder.indexOf(a);
            const indexB = blockOrder.indexOf(b);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.localeCompare(b);
          });

          return sortedBlockNames.map((blockName, blockIdx) => (
            <div key={blockName} className="space-y-4">
              <div className="flex items-center gap-3 px-2">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent to-zinc-800" />
                <span className="text-[10px] font-black uppercase tracking-[.3em] text-zinc-500 bg-zinc-950 px-3 py-1 rounded-full border border-zinc-800">
                  {blockName}
                </span>
                <div className="h-px flex-1 bg-gradient-to-l from-transparent to-zinc-800" />
              </div>
              
              <div className="space-y-4">
                {grouped[blockName].map(({ originalIndex, ...ex }, groupIdx) => (
                  <motion.div
                    key={originalIndex}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: (groupIdx + blockIdx) * 0.1 }}
                    className={cn(
                      "group bg-zinc-900 border rounded-2xl p-5 hover:border-zinc-700 transition-all",
                      exerciseFeedback[originalIndex]?.isCompleted ? "border-orange-500/50 bg-orange-500/[0.02]" : "border-zinc-800"
                    )}
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex-1 flex gap-4">
                        <button 
                          onClick={() => {
                            const isComingComplete = !exerciseFeedback[originalIndex]?.isCompleted;
                            updateExerciseFeedback(originalIndex, 'isCompleted', isComingComplete);
                            if (isComingComplete) {
                              confetti({
                                particleCount: 20,
                                angle: 60,
                                spread: 50,
                                origin: { x: 0, y: 0.85 }
                              });
                              confetti({
                                particleCount: 20,
                                angle: 120,
                                spread: 50,
                                origin: { x: 1, y: 0.85 }
                              });
                            }
                          }}
                          className={cn(
                            "mt-1 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all flex-shrink-0",
                            exerciseFeedback[originalIndex]?.isCompleted 
                              ? "bg-orange-500 border-orange-500 text-white" 
                              : "border-zinc-700 hover:border-orange-500"
                          )}
                        >
                          {exerciseFeedback[originalIndex]?.isCompleted && <Check className="w-4 h-4" />}
                        </button>
                        <div>
                          <h3 className={cn("text-xl font-bold transition-colors", exerciseFeedback[originalIndex]?.isCompleted && "text-zinc-500 line-through")}>
                            {ex.name}
                          </h3>
                          <ExerciseHistoryView clientUid={clientUid} exerciseName={ex.name} />
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
                      </div>
                      {ex.youtubeLink && (
                        <div className="flex flex-col gap-2">
                          <button 
                            onClick={() => setActiveVideo({ url: ex.youtubeLink!, title: ex.name })}
                            className="flex items-center gap-2 text-orange-500 hover:text-orange-400 transition-colors text-sm font-bold"
                          >
                            <Play className="w-4 h-4" />
                            Watch Exercise Video
                          </button>
                        </div>
                      )}
                    </div>

                    {ex.coachNote && (
                      <div className="flex gap-2 items-start bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50 text-sm text-zinc-400 mb-4">
                        <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0 text-orange-500/50" />
                        <p>{ex.coachNote}</p>
                      </div>
                    )}

                    {ex.youtubeLink && (
                      <button 
                        onClick={() => setActiveVideo({ url: ex.youtubeLink!, title: ex.name })}
                        className="block relative aspect-video rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 group/vid mb-4 text-left w-full"
                      >
                        {resolveThumbnail(ex.youtubeLink) ? (
                          <img 
                            src={resolveThumbnail(ex.youtubeLink)!}
                            alt="Exercise Video"
                            className="w-full h-full object-cover opacity-60 group-hover/vid:opacity-80 transition-opacity"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-full h-full bg-zinc-900 flex flex-col items-center justify-center opacity-40 group-hover/vid:opacity-60 transition-opacity">
                            <Play className="w-8 h-8 text-zinc-500 mb-2" />
                            <span className="text-[10px] font-black tracking-widest text-zinc-600 uppercase italic">Media Available</span>
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-xl shadow-orange-500/20 group-hover/vid:scale-110 transition-transform">
                            <Play className="w-6 h-6 fill-current" />
                          </div>
                        </div>
                        <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/50 backdrop-blur-md rounded text-[10px] font-bold text-white border border-white/10 flex items-center gap-2">
                          <div className="w-1 h-1 rounded-full bg-orange-500 animate-pulse" />
                          WATCH DEMO
                        </div>
                      </button>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-zinc-800/50">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">
                          <div className="w-4 h-4 bg-zinc-800 rounded-md flex items-center justify-center">
                            <Activity className="w-2.5 h-2.5" />
                          </div>
                          Actual Sets
                        </div>
                        <input 
                          type="number"
                          placeholder={ex.sets.toString()}
                          disabled={isCompletedToday}
                          value={exerciseFeedback[originalIndex]?.completedSets || ''}
                          onChange={(e) => updateExerciseFeedback(originalIndex, 'completedSets', Number(e.target.value))}
                          className="w-full bg-zinc-950/50 border border-zinc-800 rounded-2xl px-4 py-3 text-sm focus:ring-1 focus:ring-orange-500 outline-none transition-all disabled:opacity-50 hover:bg-zinc-950"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">
                          <div className="w-4 h-4 bg-zinc-800 rounded-md flex items-center justify-center">
                            <Zap className="w-2.5 h-2.5" />
                          </div>
                          Actual Reps
                        </div>
                        <input 
                          type="text"
                          placeholder={ex.reps}
                          disabled={isCompletedToday}
                          value={exerciseFeedback[originalIndex]?.completedReps || ''}
                          onChange={(e) => updateExerciseFeedback(originalIndex, 'completedReps', e.target.value)}
                          className="w-full bg-zinc-950/50 border border-zinc-800 rounded-2xl px-4 py-3 text-sm focus:ring-1 focus:ring-orange-500 outline-none transition-all disabled:opacity-50 hover:bg-zinc-950"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">
                          <div className="w-4 h-4 bg-zinc-800 rounded-md flex items-center justify-center">
                            <Dumbbell className="w-2.5 h-2.5" />
                          </div>
                          Weight Used
                        </div>
                        <input 
                          type="text"
                          placeholder={ex.weight || '0kg'}
                          disabled={isCompletedToday}
                          value={exerciseFeedback[originalIndex]?.completedWeight || ''}
                          onChange={(e) => updateExerciseFeedback(originalIndex, 'completedWeight', e.target.value)}
                          className="w-full bg-zinc-950/50 border border-zinc-800 rounded-2xl px-4 py-3 text-sm focus:ring-1 focus:ring-orange-500 outline-none transition-all disabled:opacity-50 hover:bg-zinc-950"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">
                          <div className="w-4 h-4 bg-zinc-800 rounded-md flex items-center justify-center">
                            <MessageSquare className="w-2.5 h-2.5" />
                          </div>
                          Personal Note
                        </div>
                        <input 
                          type="text"
                          placeholder="How did it feel?"
                          disabled={isCompletedToday}
                          value={exerciseFeedback[originalIndex]?.clientNote || ''}
                          onChange={(e) => updateExerciseFeedback(originalIndex, 'clientNote', e.target.value)}
                          className="w-full bg-zinc-950/50 border border-zinc-800 rounded-2xl px-4 py-3 text-sm focus:ring-1 focus:ring-orange-500 outline-none transition-all disabled:opacity-50 hover:bg-zinc-950"
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ));
        })()}
      </div>

      <AnimatePresence mode="wait">
        {isCompletedToday ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold py-6 rounded-2xl flex flex-col items-center justify-center gap-2 shadow-inner"
          >
            <div className="p-2 bg-orange-500/10 rounded-full text-orange-500">
              <CheckCircle className="w-8 h-8" />
            </div>
            <p className="text-xl">Workout Finished for Today!</p>
            <p className="text-sm font-medium text-zinc-600 uppercase tracking-widest">Great work, keep it up!</p>
          </motion.div>
        ) : !showFeedbackForm ? (
          <motion.button
            key="complete-btn"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCompleteClick}
            className="w-full bg-orange-500 text-white font-bold py-5 rounded-2xl hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-3 text-lg"
          >
            <CheckCircle className="w-6 h-6" />
            Complete Workout
          </motion.button>
        ) : (
          <motion.div
            key="feedback-form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4"
          >
            <h3 className="font-bold text-xl">How was the session?</h3>
            <textarea
              value={clientNote}
              onChange={(e) => setClientNote(e.target.value)}
              placeholder="Any notes for Coach Nik? (e.g. weight felt light, knee felt a bit tight...)"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm focus:ring-1 focus:ring-orange-500 outline-none min-h-[120px]"
            />
            {submittingError && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-500 flex items-center gap-2">
                <Info className="w-4 h-4 flex-shrink-0" />
                {submittingError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowFeedbackForm(false)}
                className="flex-1 py-4 px-6 border border-zinc-800 rounded-[24px] font-black uppercase tracking-widest text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-white transition-all outline-none"
              >
                Back
              </button>
              <button
                onClick={() => handleComplete(exerciseFeedback)}
                disabled={submitting}
                className="flex-[2] relative bg-orange-500 text-white font-black uppercase tracking-widest py-4 px-6 rounded-[24px] hover:bg-orange-600 disabled:opacity-50 transition-all shadow-xl shadow-orange-500/20 group overflow-hidden"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {submitting ? 'Transmitting...' : 'Submit Protocol'}
                  {!submitting && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                </span>
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

function NutritionHistory({ metrics }: { metrics: BodyMetrics[] }) {
  const sortedMetrics = useMemo(() => {
    return [...metrics].sort((a, b) => b.date.localeCompare(a.date));
  }, [metrics]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-orange-500" />
            Nutrition Intelligence History
          </h3>
          <p className="text-zinc-500 text-xs">Day-wise caloric and macro-nutrient breakdown.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-[10px] font-bold text-blue-500">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" /> Protein
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-[10px] font-bold text-green-500">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full" /> Carbs
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-full text-[10px] font-bold text-yellow-500">
            <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full" /> Fats
          </span>
        </div>
      </div>

      <div className="h-[300px] w-full bg-zinc-950/50 rounded-2xl p-4 border border-zinc-800/50">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[...metrics].slice(-14)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis 
              dataKey="date" 
              stroke="#71717a" 
              fontSize={10} 
              tickFormatter={(str) => {
                try {
                  return format(parseISO(str), 'MMM d');
                } catch {
                  return str;
                }
              }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis 
              stroke="#71717a" 
              fontSize={10} 
              axisLine={false}
              tickLine={false}
              tickFormatter={(val) => `${val}g`}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
              cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
            />
            <Bar dataKey="protein" name="Protein" fill="#3b82f6" stackId="a" radius={[0, 0, 0, 0]} barSize={20} />
            <Bar dataKey="carbs" name="Carbs" fill="#22c55e" stackId="a" radius={[0, 0, 0, 0]} barSize={20} />
            <Bar dataKey="fats" name="Fats" fill="#eab308" stackId="a" radius={[4, 4, 0, 0]} barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto hide-scrollbar -mx-8 px-8">
        <table className="w-full text-left border-collapse min-w-[500px]">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-zinc-500">Date</th>
              <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 text-right">Calories</th>
              <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 text-right">Protein</th>
              <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 text-right">Carbs</th>
              <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 text-right">Fats</th>
              <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 text-right">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/30">
            {sortedMetrics.slice(0, 14).map((m, idx) => {
              const prev = sortedMetrics[idx + 1];
              const calDiff = prev ? m.calories - prev.calories : 0;
              
              return (
                <tr key={m.id || m.date} className="group hover:bg-white/5 transition-colors">
                  <td className="py-5 text-sm font-bold text-zinc-400 group-hover:text-white transition-colors">
                    {format(parseISO(m.date), 'EEE, MMM d')}
                  </td>
                  <td className="py-5 text-lg font-black text-right text-orange-500 italic">
                    {m.calories} <span className="text-[10px] not-italic text-zinc-600 tracking-normal ml-0.5">kcal</span>
                  </td>
                  <td className="py-5 text-sm font-bold text-right text-blue-400">
                    {m.protein || 0}<span className="text-[10px] text-zinc-600 ml-0.5 uppercase">g</span>
                  </td>
                  <td className="py-5 text-sm font-bold text-right text-green-400">
                    {m.carbs || 0}<span className="text-[10px] text-zinc-600 ml-0.5 uppercase">g</span>
                  </td>
                  <td className="py-5 text-sm font-bold text-right text-yellow-400">
                    {m.fats || 0}<span className="text-[10px] text-zinc-600 ml-0.5 uppercase">g</span>
                  </td>
                  <td className="py-5 text-right">
                    {calDiff !== 0 && (
                      <span className={cn(
                        "text-[10px] font-black px-2 py-1 rounded-md",
                        calDiff > 0 ? "text-red-400 bg-red-400/10" : "text-green-400 bg-green-400/10"
                      )}>
                        {calDiff > 0 ? '+' : ''}{calDiff}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {sortedMetrics.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-zinc-600 italic text-sm">No synchronized day-wise nutrition data found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MealAI({ 
  user, 
  profile,
  todayMetrics, 
  metrics,
  meals,
  sendAutomatedCoachMessage,
  activeNutritionPlan,
  setToastNotification
}: { 
  user: User, 
  profile: UserProfile,
  todayMetrics: BodyMetrics | null, 
  metrics: BodyMetrics[],
  meals: any[],
  sendAutomatedCoachMessage: (text: string, type?: 'motivation' | 'reminder') => Promise<void>,
  activeNutritionPlan?: NutritionPlan | null,
  setToastNotification: (value: {title: string, message: string, type: string} | null) => void
}) {
  const [image, setImage] = useState<string | null>(null);
  const [mealFileBlob, setMealFileBlob] = useState<Blob | null>(null);
  const [mealFilename, setMealFilename] = useState<string>('');
  const [mealDescription, setMealDescription] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState<number>(0);
  const [showUnclearImageWarning, setShowUnclearImageWarning] = useState<boolean>(false);
  const [dailyAdvice, setDailyAdvice] = useState<any>(null);
  const [analyzingDaily, setAnalyzingDaily] = useState(false);
  const [logging, setLogging] = useState(false);
  const [logMealError, setLogMealError] = useState<string | null>(null);
  const [fetchingSingle, setFetchingSingle] = useState(false);
  const [quickAddText, setQuickAddText] = useState('');
  const [manualItems, setManualItems] = useState<{ name: string, quantity: string, calories: number, protein: number, carbs: number, fats: number }[]>([]);
  const [newItem, setNewItem] = useState({ name: '', quantity: '1 portion', calories: 0, protein: 0, carbs: 0, fats: 0 });
  const [customMealName, setCustomMealName] = useState('');

  const [mealType, setMealType] = useState<'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'>('Lunch');

  const compressImage = (file: File): Promise<{ dataUrl: string, blob: Blob }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          const maxDim = 1024;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            canvas.toBlob((blob) => {
              if (blob) {
                resolve({ dataUrl, blob });
              } else {
                reject(new Error('Canvas to Blob conversion failed'));
              }
            }, 'image/jpeg', 0.8);
          } else {
            reject(new Error('Canvas context not found'));
          }
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAnalyzing(true);
      try {
        const { dataUrl, blob } = await compressImage(file);
        setImage(dataUrl);
        setMealFileBlob(blob);
        setMealFilename(file.name || 'meal.jpg');
      } catch (err) {
        console.error("Error compressing image, reading raw default:", err);
        const reader = new FileReader();
        reader.onloadend = () => {
          setImage(reader.result as string);
          setMealFileBlob(file);
          setMealFilename(file.name || 'meal.jpg');
        };
        reader.readAsDataURL(file);
      } finally {
        setAnalyzing(false);
      }
    }
  };

  const handleAnalyze = async () => {
    if (!image && !mealDescription.trim()) return;
    setAnalyzing(true);
    setAnalysisError(null);
    setShowUnclearImageWarning(false);
    
    const maxRetries = 3;
    let attempt = 0;
    let success = false;
    let lastError: any = null;
    let analysis: any = null;

    while (attempt < maxRetries && !success) {
      attempt++;
      setRetryAttempt(attempt);
      try {
        if (image) {
          const base64 = image.split(',')[1];
          const mimeType = image.split(';')[0].split(':')[1];
          analysis = await analyzeMealImage(base64, mimeType);
        } else {
          analysis = await analyzeMealText(mealDescription);
        }
        success = true;
      } catch (err: any) {
        lastError = err;
        console.warn(`Analysis failed on client attempt ${attempt}/${maxRetries}:`, err);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
    }

    setRetryAttempt(0);

    if (!success) {
      setAnalyzing(false);
      setAnalysisError(lastError?.message || "Failed to analyze meal. Please check your internet connection and try again.");
      return;
    }

    try {
      if (analysis) {
        if (analysis.isUnclear) {
          setShowUnclearImageWarning(true);
          setResult(analysis);
          setAnalyzing(false);
          return;
        }

        setResult(analysis);
        // Add all analyzed items to the manual items list for review/edit
        if (analysis.items && Array.isArray(analysis.items)) {
          const mappedItems = analysis.items.map((item: any) => ({
            name: item.name,
            quantity: item.quantity || '1 portion',
            calories: Math.round(Number(item.calories) || 0),
            protein: Math.round(Number(item.protein) || 0),
            carbs: Math.round(Number(item.carbs) || 0),
            fats: Math.round(Number(item.fats) || 0)
          }));
          setManualItems([...manualItems, ...mappedItems]);
        }
        setMealDescription('');
      }
    } catch (error: any) {
      console.error('Error post-processing meal analysis:', error);
      setAnalysisError(error?.message || "Error processing analysis response.");
    } finally {
      setAnalyzing(false);
    }
  };

  const addManualItem = () => {
    if (!newItem.name) return;
    setManualItems([...manualItems, newItem]);
    setNewItem({ name: '', quantity: '1 portion', calories: 0, protein: 0, carbs: 0, fats: 0 });
  };
  
  const handleFetchMacrosForSingle = async () => {
    if (!newItem.name.trim()) return;
    setFetchingSingle(true);
    try {
      const resp = await getMacrosForItemsWithQuantities([{ name: newItem.name, quantity: newItem.quantity || '1 portion' }]);
      if (resp && resp.items && resp.items.length > 0) {
        const item = resp.items[0];
        setNewItem({
          ...newItem,
          calories: Math.round(item.calories),
          protein: Math.round(item.protein),
          carbs: Math.round(item.carbs),
          fats: Math.round(item.fats)
        });
      }
    } catch (error) {
      console.error("Error fetching macros for single item:", error);
    } finally {
      setFetchingSingle(false);
    }
  };

  const handleRecalculateMacros = async () => {
    if (manualItems.length === 0) return;
    setRecalculating(true);
    try {
      const resp = await getMacrosForItemsWithQuantities(manualItems.map(i => ({ name: i.name, quantity: i.quantity })));
      if (resp && resp.items) {
        setManualItems(resp.items.map((item: any) => ({
          name: item.name,
          quantity: item.quantity,
          calories: Math.round(item.calories),
          protein: Math.round(item.protein),
          carbs: Math.round(item.carbs),
          fats: Math.round(item.fats)
        })));
      }
    } catch (error) {
      console.error("Error recalculating macros:", error);
    } finally {
      setRecalculating(false);
    }
  };

  const handleAnalyzeToday = async () => {
    setAnalyzingDaily(true);
    try {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const todayMeals = meals.filter(m => m.date === todayStr);
      const advice = await analyzeDailyNutrition(todayMeals, profile);
      setDailyAdvice(advice);
    } catch (error) {
      console.error("Error getting daily advice:", error);
    } finally {
      setAnalyzingDaily(false);
    }
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
    if (activeNutritionPlan && !image) {
      setLogMealError("Photo Required: Sharing a photo is compulsory since you have an active nutrition plan. Please upload a clear photo of your plate so Coach Nik can monitor portion sizes and visual food composition!");
      return;
    }
    setLogging(true);
    setLogMealError(null);
    try {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      
      const mealCounts = meals.filter(m => m.date === todayStr).length;
      
      let finalImageURL = null;
      if (mealFileBlob) {
        try {
          const timestamp = Date.now();
          const cleanName = mealFilename ? mealFilename.replace(/[^a-zA-Z0-9.]/g, '') : 'meal.jpg';
          const fileRefPath = `meals/${user.uid}/${timestamp}_${cleanName}`;
          const storageRef = ref(storage, fileRefPath);
          await uploadBytes(storageRef, mealFileBlob);
          finalImageURL = await getDownloadURL(storageRef);
        } catch (storageErr) {
          console.error("Error uploading meal image to Firebase Storage, saving image URL fallback:", storageErr);
          finalImageURL = image && image.length < 524288 ? image : null;
        }
      } else if (image) {
        finalImageURL = image.length < 524288 ? image : null;
      }

      // Save full meal details
      const mealData = {
        clientId: user.uid,
        date: todayStr,
        type: mealType,
        name: customMealName || result?.mealName || (manualItems.length === 1 ? manualItems[0].name : `${mealType} Log`),
        items: manualItems,
        totalCalories: totalMealMacros.calories,
        totalProtein: totalMealMacros.protein,
        totalCarbs: totalMealMacros.carbs,
        totalFats: totalMealMacros.fats,
        imageURL: finalImageURL,
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
      setMealFileBlob(null);
      setMealFilename('');
      setResult(null);
      setManualItems([]);
      setCustomMealName('');
      setLogMealError(null);
      setToastNotification({
        title: 'Success',
        message: 'Meal logged successfully! Keep crushing it.',
        type: 'success'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'meals');
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
            
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-950 p-3 rounded-xl border border-zinc-800">
              Tip: Upload a clear photo of your plate OR type a detailed description. Nik's AI will estimate everything for you!
            </p>

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
                      onClick={() => { 
                        setImage(null); 
                        setMealFileBlob(null); 
                        setMealFilename(''); 
                        setResult(null); 
                        setAnalysisError(null);
                        setRetryAttempt(0);
                        setShowUnclearImageWarning(false);
                      }}
                      className="absolute top-4 right-4 p-2 bg-black/50 backdrop-blur-md rounded-full text-white hover:bg-black transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}

              {analysisError && (
                <div role="alert" className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex flex-col gap-3">
                  <div className="flex gap-3 items-start">
                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-red-500 uppercase tracking-wider">Analysis Failed</h4>
                      <p className="text-xs text-zinc-400">{analysisError}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleAnalyze}
                    disabled={analyzing}
                    className="self-end px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Retry Now
                  </button>
                </div>
              )}

              {showUnclearImageWarning && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 flex gap-3 items-start">
                  <Eye className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-yellow-500 uppercase tracking-wider">Image Unclear or Obscured</h4>
                    <p className="text-xs text-zinc-400">
                      {result?.advice || "I couldn't identify any clear meal items in this photo. Please ensure your food is well-lit and in frame, or try adding a brief description instead."}
                    </p>
                  </div>
                </div>
              )}

              <button 
                onClick={handleAnalyze}
                disabled={analyzing || (!image && !mealDescription.trim())}
                className="w-full py-4 bg-orange-500 text-white font-bold rounded-2xl hover:bg-orange-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{retryAttempt > 1 ? `Retrying (Attempt ${retryAttempt}/3)...` : 'Analyzing...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    <span>Analyze with AI</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 space-y-6">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Plus className="w-5 h-5 text-orange-500" />
              Quick Add & Manual Entry
            </h3>
            <div className="space-y-4">
              <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800 space-y-4">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Quick Add Multiple Items</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="e.g. 2 eggs, toast, coffee"
                    value={quickAddText}
                    onChange={(e) => setQuickAddText(e.target.value)}
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!quickAddText.trim()) return;
                      setAnalyzing(true);
                      try {
                        const analysis = await analyzeMealText(quickAddText);
                        if (analysis && analysis.items) {
                          const mappedItems = analysis.items.map((item: any) => ({
                            name: item.name,
                            quantity: item.quantity || '1 portion',
                            calories: Math.round(Number(item.calories) || 0),
                            protein: Math.round(Number(item.protein) || 0),
                            carbs: Math.round(Number(item.carbs) || 0),
                            fats: Math.round(Number(item.fats) || 0)
                          }));
                          setManualItems([...manualItems, ...mappedItems]);
                          if (analysis.advice && !result?.advice) {
                            setResult({ ...result, advice: analysis.advice });
                          }
                          setQuickAddText('');
                        }
                      } finally {
                        setAnalyzing(false);
                      }
                    }}
                    disabled={analyzing || !quickAddText.trim()}
                    className="px-4 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-all font-bold text-[10px] uppercase tracking-widest disabled:opacity-50"
                  >
                    {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add via AI'}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">OR ADD ONE MANUALLY</span>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Item Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Chicken breast"
                      value={newItem.name}
                      onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Quantity</label>
                      <button 
                        onClick={handleFetchMacrosForSingle}
                        disabled={fetchingSingle || !newItem.name.trim()}
                        className="text-[9px] font-bold text-orange-500 hover:text-orange-400 disabled:opacity-50 flex items-center gap-1 transition-colors"
                      >
                        {fetchingSingle ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Sparkles className="w-2.5 h-2.5" />}
                        FETCH MACROS
                      </button>
                    </div>
                    <input 
                      type="text" 
                      placeholder="e.g. 200g, 1 cup"
                      value={newItem.quantity}
                      onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                    />
                  </div>
                </div>
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
                  Add to Current Meal
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 space-y-6 h-full flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold">Current Meal</h3>
              <div className="flex items-center gap-2">
                {manualItems.length > 0 && (
                  <button 
                    onClick={() => setManualItems([])}
                    className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest hover:text-red-500 transition-colors"
                  >
                    Clear All
                  </button>
                )}
                <div className="px-3 py-1 bg-orange-500/10 rounded-full text-[10px] font-bold text-orange-500 uppercase tracking-widest">
                  {manualItems.length} Items
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Meal Name (Optional)</label>
              <input 
                type="text" 
                placeholder="e.g. Lunch with team, Pre-workout snack..."
                value={customMealName}
                onChange={(e) => setCustomMealName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto max-h-[400px] custom-scrollbar pr-2 mt-4">
              {manualItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-12 text-zinc-600 space-y-2">
                  <Utensils className="w-12 h-12 opacity-20" />
                  <p className="text-sm font-medium">No items added yet.</p>
                </div>
              ) : (
                manualItems.map((item, i) => (
                  <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-4 group">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest ml-1">Item Name</label>
                          <input 
                            type="text"
                            value={item.name}
                            onChange={(e) => {
                              const newItems = [...manualItems];
                              newItems[i].name = e.target.value;
                              setManualItems(newItems);
                            }}
                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-bold text-white w-full outline-none focus:ring-1 focus:ring-orange-500"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest ml-1">Quantity / Serving Size</label>
                          <input 
                            type="text"
                            value={item.quantity}
                            onChange={(e) => {
                              const newItems = [...manualItems];
                              newItems[i].quantity = e.target.value;
                              setManualItems(newItems);
                            }}
                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-[10px] text-orange-500 font-bold w-full outline-none focus:ring-1 focus:ring-orange-500"
                          />
                        </div>
                      </div>
                      <button 
                        onClick={() => removeManualItem(i)}
                        className="p-3 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-2 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800/50">
                      <div className="flex flex-col gap-1">
                        <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest text-center">Calories</span>
                        <input 
                          type="number"
                          value={item.calories}
                          onChange={(e) => {
                            const newItems = [...manualItems];
                            newItems[i].calories = Number(e.target.value);
                            setManualItems(newItems);
                          }}
                          className="bg-zinc-950 border border-zinc-800 rounded-lg py-1 px-1 text-center text-[10px] font-bold text-zinc-300 outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest text-center">Protein</span>
                        <input 
                          type="number"
                          value={item.protein}
                          onChange={(e) => {
                            const newItems = [...manualItems];
                            newItems[i].protein = Number(e.target.value);
                            setManualItems(newItems);
                          }}
                          className="bg-zinc-950 border border-zinc-800 rounded-lg py-1 px-1 text-center text-[10px] font-bold text-zinc-300 outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest text-center">Carbs</span>
                        <input 
                          type="number"
                          value={item.carbs}
                          onChange={(e) => {
                            const newItems = [...manualItems];
                            newItems[i].carbs = Number(e.target.value);
                            setManualItems(newItems);
                          }}
                          className="bg-zinc-950 border border-zinc-800 rounded-lg py-1 px-1 text-center text-[10px] font-bold text-zinc-300 outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest text-center">Fats</span>
                        <input 
                          type="number"
                          value={item.fats}
                          onChange={(e) => {
                            const newItems = [...manualItems];
                            newItems[i].fats = Number(e.target.value);
                            setManualItems(newItems);
                          }}
                          className="bg-zinc-950 border border-zinc-800 rounded-lg py-1 px-1 text-center text-[10px] font-bold text-zinc-300 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {manualItems.length > 0 && (
              <button
                onClick={handleRecalculateMacros}
                disabled={recalculating}
                className="w-full py-2 bg-zinc-800 text-zinc-300 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-700 transition-all flex items-center justify-center gap-2"
              >
                {recalculating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
                {recalculating ? 'Analyzing Quantities...' : 'Update Macros for Quantities'}
              </button>
            )}

            {/* AI Advice */}
            {result?.advice && (
              <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-4 flex gap-3 items-start">
                <Sparkles className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-zinc-400 italic">" {result.advice} "</p>
              </div>
            )}
            
            {manualItems.length > 0 && (
              <div className="pt-6 border-t border-zinc-800 space-y-6">
                {/* Meal Plate Photo Requirement Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-orange-500" />
                      Meal Plate Photo
                    </label>
                    {activeNutritionPlan ? (
                      <span className="px-2 py-0.5 bg-red-500/15 text-red-500 border border-red-500/20 rounded-md text-[8px] font-black uppercase tracking-wider">
                        Compulsory
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-zinc-800/50 text-zinc-500 rounded-md text-[8px] font-bold uppercase tracking-wider">
                        Optional
                      </span>
                    )}
                  </div>

                  {image ? (
                    <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 p-3 rounded-2xl relative">
                      <img src={image} alt="Meal Attachment" className="w-12 h-12 object-cover rounded-xl border border-zinc-850" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" /> Photo Attached
                        </span>
                        <p className="text-xs text-zinc-400 truncate">{mealFilename || 'meal.jpg'}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setImage(null);
                          setMealFileBlob(null);
                          setMealFilename('');
                          setResult(null);
                          setShowUnclearImageWarning(false);
                        }}
                        className="p-2 hover:bg-zinc-900 rounded-xl text-zinc-500 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center border border-dashed border-zinc-800 hover:border-orange-500/50 bg-zinc-950 rounded-2xl p-4 cursor-pointer transition-all group">
                      <div className="p-2 bg-zinc-900 rounded-lg text-zinc-500 group-hover:text-orange-500 transition-colors mb-1.5">
                        <Upload className="w-4 h-4" />
                      </div>
                      <span className="text-zinc-400 text-xs font-bold">Upload Meal Image</span>
                      <p className="text-[9px] mt-0.5 text-center text-zinc-550 text-zinc-500">
                        {activeNutritionPlan ? "Nik's nutrition programs require plate photos to save meals." : "Add a photo to get better feedback from Nik."}
                      </p>
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                    </label>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-2 border-t border-zinc-800 pt-5">
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

                {logMealError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex gap-3 items-start animate-pulse">
                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-red-500 uppercase tracking-wider">Photo Submittal Compulsory</h4>
                      <p className="text-xs text-zinc-300">{logMealError}</p>
                    </div>
                  </div>
                )}

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

      {/* Today's Logged Meals List */}
      <div className="space-y-8 pt-12 border-t border-zinc-800">
        <NutritionHistory metrics={metrics} />

        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-bold flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-orange-500" />
            Nutritional AI Advisor
          </h3>
          <button 
            onClick={handleAnalyzeToday}
            disabled={analyzingDaily || meals.filter(m => m.date === format(new Date(), 'yyyy-MM-dd')).length === 0}
            className="px-6 py-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-xs font-bold hover:border-orange-500 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {analyzingDaily ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Review Today's Nutrition
          </button>
        </div>

        {dailyAdvice ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full -rotate-90">
                  <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-zinc-800" />
                  <circle 
                    cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" 
                    strokeDasharray={364.4} strokeDashoffset={364.4 - (364.4 * (dailyAdvice.score / 10))} 
                    className="text-orange-500" 
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-black">{dailyAdvice.score}</span>
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Day Score</span>
                </div>
              </div>
              <p className="text-sm text-zinc-400">"{dailyAdvice.educationalTip}"</p>
            </div>

            <div className="md:col-span-2 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-green-500/5 border border-green-500/10 rounded-2xl p-6 space-y-3">
                  <h4 className="text-xs font-bold text-green-500 uppercase tracking-widest flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> Key Wins
                  </h4>
                  <ul className="space-y-2">
                    {dailyAdvice.wins.map((win: string, i: number) => (
                      <li key={i} className="text-xs text-zinc-400 flex items-start gap-2">
                        <div className="w-1 h-1 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                        {win}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-orange-500/5 border border-orange-500/10 rounded-2xl p-6 space-y-3">
                  <h4 className="text-xs font-bold text-orange-500 uppercase tracking-widest flex items-center gap-2">
                    <Target className="w-4 h-4" /> Improvements
                  </h4>
                  <ul className="space-y-2">
                    {dailyAdvice.improvements.map((imp: string, i: number) => (
                      <li key={i} className="text-xs text-zinc-400 flex items-start gap-2">
                        <div className="w-1 h-1 rounded-full bg-orange-500 mt-1.5 flex-shrink-0" />
                        {imp}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-orange-500" /> Action Plan for Tomorrow
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {dailyAdvice.suggestions.map((sug: string, i: number) => (
                    <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-300 font-medium">
                      {sug}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-[32px] p-12 text-center space-y-4">
            <div className="inline-flex p-4 bg-zinc-800 rounded-3xl text-zinc-500">
              <Utensils className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h4 className="text-lg font-bold">Ready for a Review?</h4>
              <p className="text-zinc-500 max-w-md mx-auto text-sm">
                Log your meals for the day, then Nik's AI Nutritionist will analyze your balance and give you a performance score with an action plan for tomorrow.
              </p>
            </div>
          </div>
        )}
      </div>

      {meals.filter(m => m.date === format(new Date(), 'yyyy-MM-dd')).length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Utensils className="w-5 h-5 text-orange-500" />
                Logged Today
              </h3>
              <div className="space-y-4">
                {meals
                  .filter(m => m.date === format(new Date(), 'yyyy-MM-dd'))
                  .sort((a, b) => {
                    const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                    const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                    return timeB - timeA;
                  })
                  .map((meal, idx) => (
                    <div key={idx} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex gap-4 items-center">
                      {meal.imageURL && (
                        <div className="w-12 h-12 rounded-xl overflow-hidden border border-zinc-800 flex-shrink-0">
                          <img src={meal.imageURL} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">{meal.type}</p>
                          <p className="text-[10px] text-zinc-500 font-bold">{meal.totalCalories} kcal</p>
                        </div>
                        <h4 className="font-bold text-sm truncate">{meal.name}</h4>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileSection({ user, profile, setShowChat }: { 
  user: User, 
  profile: UserProfile, 
  setShowChat: (s: boolean) => void
}) {
  const [formData, setFormData] = useState({
    displayName: profile.displayName || '',
    photoURL: profile.photoURL || '',
    height: profile.height || '',
    weight: profile.weight || '',
    gender: profile.gender || '',
    programGoals: profile.programGoals || '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (limit to 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ text: 'Image is too large. Max size is 2MB.', type: 'error' });
      return;
    }

    setIsUploading(true);
    setMessage(null);

    try {
      const storageRef = ref(storage, `profiles/${user.uid}/${file.name}_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      
      setFormData(prev => ({ ...prev, photoURL: downloadURL }));
      setMessage({ text: 'Image uploaded! Remember to save your profile changes.', type: 'success' });
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'storage');
      let errorMsg = 'Failed to upload image.';
      if (error.code === 'storage/unauthorized') {
        errorMsg = 'Upload denied. Please ensure your storage permissions are configured.';
      } else if (error.code === 'storage/canceled') {
        errorMsg = 'Upload canceled.';
      }
      setMessage({ text: errorMsg, type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (user.uid !== profile.uid) {
      setMessage({ text: 'Preview mode: profile updates disabled.', type: 'error' });
      return;
    }
    setIsSaving(true);
    setMessage(null);
    try {
      await updateDoc(doc(db, 'users', user.uid), formData)
        .catch(err => handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`));
      setMessage({ text: 'Profile updated successfully!', type: 'success' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
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
        <div className="relative group">
          <div className="w-24 h-24 rounded-3xl overflow-hidden border-2 border-orange-500/20 shadow-2xl transition-transform group-hover:scale-105 relative">
            {isUploading ? (
              <div className="absolute inset-0 bg-zinc-950/80 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
              </div>
            ) : null}
            <img 
              src={getAvatarUrl(user.email || undefined, formData.gender as any, formData.photoURL)} 
              alt="Profile" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <label className={cn(
            "absolute -bottom-2 -right-2 p-3 bg-orange-500 text-white rounded-2xl shadow-xl cursor-pointer hover:bg-orange-600 transition-all hover:scale-110 active:scale-95",
            isUploading && "opacity-50 cursor-not-allowed pointer-events-none"
          )}>
            <Camera className="w-4 h-4" />
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleImageUpload} 
              className="hidden" 
              disabled={isUploading}
            />
          </label>
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
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest"> gender </label>
            <select 
              value={formData.gender}
              onChange={(e) => setFormData({ ...formData, gender: e.target.value as any })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-orange-500 outline-none"
            >
              <option value="">Select Gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
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

function ClientCalendar({ workouts, onSelectWorkout, viewDate, setViewDate }: { 
  workouts: Workout[], 
  onSelectWorkout: (w: Workout) => void,
  viewDate: Date,
  setViewDate: (date: Date) => void
}) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewDate));
    const end = endOfWeek(endOfMonth(viewDate));
    return eachDayOfInterval({ start, end });
  }, [viewDate]);

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
            <h3 className="text-xl font-bold">{format(viewDate, 'MMMM yyyy')}</h3>
            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Your Schedule</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setViewDate(subMonths(viewDate, 1))}
            className="p-2 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setViewDate(new Date())}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-xs font-bold transition-colors"
          >
            Today
          </button>
          <button 
            onClick={() => setViewDate(addMonths(viewDate, 1))}
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
          const isCurrentMonth = isSameMonth(day, viewDate);
          
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
