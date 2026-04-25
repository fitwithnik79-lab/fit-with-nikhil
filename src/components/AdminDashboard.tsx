import { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDocs, orderBy, deleteDoc, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, Workout, Exercise, Feedback, WorkoutTemplate, BodyMetrics } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { searchExerciseVideos, parseWorkoutFile, analyzeNutritionFile } from '../lib/gemini';
import { SAMPLE_PROGRAMS, WEEKLY_PROGRAMS, WORKOUT_TEMPLATES } from '../constants/workoutTemplates';
import { NUTRITION_TEMPLATES } from '../constants/nutritionTemplates';
import { NutritionPlan, NutritionTemplate } from '../types';
import { Plus, Users, Calendar, CheckCircle, ExternalLink, ChevronRight, Search, Activity, Clock, MessageSquare, Trash2, Edit2, ChevronDown, ChevronUp, Save, Download, Layout, Copy, ChevronLeft, Play, Sparkles, Loader2, Droplets, Footprints, Flame, Scale, LayoutDashboard, X, Bell, Send, BookOpen, Layers, Upload, Youtube, Utensils } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import Chat from './Chat';
import { ProgramTemplate } from '../types';
import { addDays, startOfToday } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell } from 'recharts';
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
  differenceInDays,
  subDays,
  startOfDay
} from 'date-fns';

interface AdminDashboardProps {
  user: User;
  profile: UserProfile;
}

export default function AdminDashboard({ user, profile }: AdminDashboardProps) {
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [selectedClient, setSelectedClient] = useState<UserProfile | null>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dash' | 'clients' | 'tracker' | 'calendar' | 'reminders' | 'templates'>('dash');
  const [showChat, setShowChat] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string, message: string, onConfirm: () => void } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const confirmAction = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({ title, message, onConfirm });
  };

  const [clientViewTab, setClientViewTab] = useState<'program' | 'dashboard' | 'chat' | 'nutrition'>('program');

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'client'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const clientData = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }) as UserProfile);
      setClients(clientData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const feedbackData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Feedback);
      setFeedbacks(feedbackData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'feedback');
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Coach Dashboard</h2>
          <p className="text-zinc-400">Manage your clients and track their consistency.</p>
        </div>
        
        <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
          <button
            onClick={() => setActiveTab('dash')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === 'dash' ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" : "text-zinc-400 hover:text-white"
            )}
          >
            <LayoutDashboard className="w-4 h-4" />
            Action Center
          </button>
          <button
            onClick={() => setActiveTab('clients')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === 'clients' ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" : "text-zinc-400 hover:text-white"
            )}
          >
            <Users className="w-4 h-4" />
            Clients
          </button>
          <button
            onClick={() => setActiveTab('tracker')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === 'tracker' ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" : "text-zinc-400 hover:text-white"
            )}
          >
            <Activity className="w-4 h-4" />
            Consistency
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === 'calendar' ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" : "text-zinc-400 hover:text-white"
            )}
          >
            <Calendar className="w-4 h-4" />
            Calendar
          </button>
          <button
            onClick={() => setActiveTab('reminders')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === 'reminders' ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" : "text-zinc-400 hover:text-white"
            )}
          >
            <Bell className="w-4 h-4" />
            Reminders
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === 'templates' ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" : "text-zinc-400 hover:text-white"
            )}
          >
            <BookOpen className="w-4 h-4" />
            Templates
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'dash' && (
          <motion.div
            key="dash"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Priority Feed */}
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-orange-500" />
                    Priority Feed
                  </h3>
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800">
                    {feedbacks.length} New Updates
                  </span>
                </div>

                <div className="space-y-4">
                  {feedbacks.slice(0, 10).map((feedback) => {
                    const client = clients.find(c => c.uid === feedback.clientId);
                    return (
                      <div 
                        key={feedback.id} 
                        className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 hover:border-orange-500/30 transition-all group"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-zinc-800">
                              <img 
                                src={client?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${client?.email}`} 
                                alt={client?.displayName} 
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div>
                              <h4 className="font-bold text-white group-hover:text-orange-500 transition-colors">
                                {client?.displayName || 'Unknown Client'}
                              </h4>
                              <p className="text-zinc-500 text-xs">
                                Completed Week {feedback.weekNumber} • Day {feedback.dayNumber}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest">
                              {feedback.createdAt ? format(feedback.createdAt.toDate(), 'h:mm a') : 'Just now'}
                            </p>
                            <div className={cn(
                              "mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tighter",
                              feedback.completionStatus ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                            )}>
                              {feedback.completionStatus ? <CheckCircle className="w-3 h-3" /> : <X className="w-3 h-3" />}
                              {feedback.completionStatus ? 'Success' : 'Struggled'}
                            </div>
                          </div>
                        </div>
                        
                        {feedback.clientNote && (
                          <div className="mt-4 p-4 bg-zinc-950 rounded-2xl border border-zinc-800 italic text-zinc-400 text-sm">
                            "{feedback.clientNote}"
                          </div>
                        )}

                        <div className="mt-6 flex items-center gap-3">
                          <button 
                            onClick={() => {
                              setSelectedClient(client || null);
                              setActiveTab('clients');
                              setClientViewTab('chat');
                            }}
                            className="flex-1 bg-white text-black py-2 rounded-xl font-bold text-xs hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
                          >
                            <MessageSquare className="w-3 h-3" />
                            Send Motivation
                          </button>
                          <button 
                            onClick={() => {
                              setSelectedClient(client || null);
                              setActiveTab('clients');
                              setClientViewTab('dashboard');
                            }}
                            className="px-4 py-2 bg-zinc-800 text-white rounded-xl font-bold text-xs hover:bg-zinc-700 transition-colors"
                          >
                            View Stats
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sidebar Stats */}
              <div className="space-y-6">
                <div className="bg-orange-500 rounded-[32px] p-8 text-black shadow-2xl shadow-orange-500/20">
                  <h3 className="text-2xl font-black uppercase tracking-tight leading-none mb-2">Daily Goal</h3>
                  <p className="text-black/70 font-medium mb-6">Help 5 clients hit their targets today.</p>
                  <div className="space-y-4">
                    <div className="flex justify-between items-end">
                      <span className="text-xs font-bold uppercase tracking-widest">Progress</span>
                      <span className="text-2xl font-black">3/5</span>
                    </div>
                    <div className="w-full h-3 bg-black/10 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: '60%' }}
                        className="h-full bg-black" 
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
                  <h4 className="font-bold text-sm uppercase tracking-widest text-zinc-500">Inactive Clients</h4>
                  <div className="space-y-3">
                    {clients.filter(c => {
                      if (!c.lastLogin) return true;
                      const lastLoginDate = c.lastLogin.toDate();
                      return differenceInDays(new Date(), lastLoginDate) > 3;
                    }).slice(0, 5).map(c => (
                      <div key={c.uid} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full overflow-hidden border border-zinc-800">
                            <img 
                              src={c.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.email}`} 
                              alt={c.displayName} 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <span className="text-sm font-medium text-zinc-300">{c.displayName}</span>
                        </div>
                        <span className="text-[10px] font-bold text-red-500 uppercase">3+ Days</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'clients' ? (
          <motion.div
            key="clients"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-6"
          >
            <div className="md:col-span-1 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search clients..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                />
              </div>
              
              <div className="space-y-2 max-h-[calc(100vh-20rem)] overflow-y-auto custom-scrollbar pr-2">
                {clients.map((client) => (
                  <button
                    key={client.uid}
                    onClick={() => setSelectedClient(client)}
                    className={cn(
                      "w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left",
                      selectedClient?.uid === client.uid 
                        ? "bg-orange-500/10 border-orange-500/50 text-white" 
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-orange-500">
                        {client.displayName?.[0] || 'C'}
                      </div>
                      <div>
                        <div className="font-semibold">{client.displayName}</div>
                        <div className="text-xs opacity-60 truncate max-w-[120px]">{client.email}</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 opacity-40" />
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-3 space-y-6">
              {selectedClient ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-orange-500 flex items-center justify-center font-bold text-white text-xl">
                        {selectedClient.displayName?.[0] || 'C'}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">{selectedClient.displayName}</h3>
                        <p className="text-zinc-500 text-sm">{selectedClient.email}</p>
                      </div>
                    </div>
                    
                    <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                      <button
                        onClick={() => setClientViewTab('program')}
                        className={cn(
                          "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all",
                          clientViewTab === 'program' ? "bg-orange-500 text-white" : "text-zinc-500 hover:text-white"
                        )}
                      >
                        Program
                      </button>
                      <button
                        onClick={() => setClientViewTab('nutrition')}
                        className={cn(
                          "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all",
                          clientViewTab === 'nutrition' ? "bg-orange-500 text-white" : "text-zinc-500 hover:text-white"
                        )}
                      >
                        Nutrition
                      </button>
                      <button
                        onClick={() => setClientViewTab('dashboard')}
                        className={cn(
                          "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all",
                          clientViewTab === 'dashboard' ? "bg-orange-500 text-white" : "text-zinc-500 hover:text-white"
                        )}
                      >
                        Dashboard
                      </button>
                      <button
                        onClick={() => setClientViewTab('chat')}
                        className={cn(
                          "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all",
                          clientViewTab === 'chat' ? "bg-orange-500 text-white" : "text-zinc-500 hover:text-white"
                        )}
                      >
                        Chat
                      </button>
                    </div>
                  </div>

                  <AnimatePresence mode="wait">
                    {clientViewTab === 'program' && (
                      <motion.div
                        key="program"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                      >
                        <div className="lg:col-span-2 space-y-6">
                          <ClientDetailsEditor client={selectedClient} showToast={showToast} />
                          <WorkoutManager client={selectedClient} showToast={showToast} confirmAction={confirmAction} />
                          <ClientHistory client={selectedClient} />
                        </div>
                        <div className="lg:col-span-1">
                          <div className="sticky top-6 h-[600px]">
                            <Chat currentUser={{ uid: user.uid, role: profile.role }} otherUser={selectedClient} />
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {clientViewTab === 'nutrition' && (
                      <motion.div
                        key="nutrition"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                      >
                        <NutritionManager client={selectedClient} showToast={showToast} />
                      </motion.div>
                    )}

                    {clientViewTab === 'dashboard' && (
                      <motion.div
                        key="dashboard"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                      >
                        <ClientDashboardView client={selectedClient} />
                      </motion.div>
                    )}

                    {clientViewTab === 'chat' && (
                      <motion.div
                        key="chat"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="h-[700px]"
                      >
                        <Chat currentUser={{ uid: user.uid, role: profile.role }} otherUser={selectedClient} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-zinc-900/50 border border-dashed border-zinc-800 rounded-2xl text-zinc-500 p-8 text-center">
                  <Users className="w-12 h-12 mb-4 opacity-20" />
                  <p>Select a client to manage their program, workouts, and view progress.</p>
                </div>
              )}
            </div>
          </motion.div>
        ) : activeTab === 'calendar' ? (
          <motion.div
            key="calendar"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <CalendarView clients={clients} showToast={showToast} confirmAction={confirmAction} />
          </motion.div>
        ) : activeTab === 'reminders' ? (
          <motion.div
            key="reminders"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="max-w-4xl mx-auto"
          >
            <RemindersView clients={clients} showToast={showToast} currentUser={user} />
          </motion.div>
        ) : activeTab === 'templates' ? (
          <motion.div
            key="templates"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <TemplatesView clients={clients} showToast={showToast} />
          </motion.div>
        ) : (
          <motion.div
            key="tracker"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="font-bold text-xl">Global Consistency Tracker</h3>
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Clock className="w-4 h-4" />
                Real-time updates
              </div>
            </div>
            
            <div className="divide-y divide-zinc-800">
              {feedbacks.length > 0 ? (
                feedbacks.map((fb) => {
                  const client = clients.find(c => c.uid === fb.clientId);
                  return (
                    <div key={fb.id} className="p-6 flex items-start justify-between hover:bg-zinc-800/50 transition-colors">
                      <div className="flex gap-4">
                        <div className={cn(
                          "p-2 rounded-full",
                          fb.completionStatus ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                        )}>
                          {fb.completionStatus ? <CheckCircle className="w-6 h-6" /> : <Activity className="w-6 h-6" />}
                        </div>
                        <div>
                          <div className="font-bold text-lg">{client?.displayName || 'Unknown Client'}</div>
                          <div className="text-zinc-400 text-sm mb-2">
                            Completed Week {fb.weekNumber}, Day {fb.dayNumber}
                          </div>
                          {fb.clientNote && (
                            <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 text-sm italic text-zinc-300">
                              "{fb.clientNote}"
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-zinc-500">
                          {fb.createdAt?.toDate ? fb.createdAt.toDate().toLocaleDateString() : 'Just now'}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-12 text-center text-zinc-500">
                  No activity recorded yet.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={cn(
              "fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border",
              toast.type === 'success' ? "bg-zinc-900 border-green-500/50 text-green-500" : "bg-zinc-900 border-red-500/50 text-red-500"
            )}
          >
            {toast.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
            <span className="font-bold">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmModal(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl p-8 space-y-6"
            >
              <div className="space-y-2">
                <h3 className="text-2xl font-bold">{confirmModal.title}</h3>
                <p className="text-zinc-400">{confirmModal.message}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 py-4 px-6 border border-zinc-800 rounded-2xl font-bold text-zinc-400 hover:bg-zinc-800 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    confirmModal.onConfirm();
                    setConfirmModal(null);
                  }}
                  className="flex-1 bg-red-500 text-white font-bold py-4 px-6 rounded-2xl hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TemplatesView({ clients, showToast }: { clients: UserProfile[], showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [selectedTemplate, setSelectedTemplate] = useState<WorkoutTemplate | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<ProgramTemplate | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<UserProfile | null>(null);
  const [assignDate, setAssignDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [assigning, setAssigning] = useState(false);
  const [parsingFile, setParsingFile] = useState(false);
  const [customPrograms, setCustomPrograms] = useState<ProgramTemplate[]>([]);
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [editingTemplateName, setEditingTemplateName] = useState('');
  const [editingTemplateCategory, setEditingTemplateCategory] = useState('');
  const [editingTemplateDescription, setEditingTemplateDescription] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Fetch custom templates from Firestore
  useEffect(() => {
    const q = query(collection(db, 'templates'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProgramTemplate));
      setCustomPrograms(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'templates');
    });
    return () => unsubscribe();
  }, []);
  
  // Program scheduling state: map of day index to specific date string
  const [programDates, setProgramDates] = useState<Record<number, string>>({});
  const [programWorkoutsDraft, setProgramWorkoutsDraft] = useState<Record<number, Exercise[]>>({});
  const [activeEditingDay, setActiveEditingDay] = useState<number | null>(null);

  // Initialize dates and exercises when program is selected
  useEffect(() => {
    if (selectedProgram && selectedProgram.weeks && selectedProgram.weeks.length > 0) {
      const initialDates: Record<number, string> = {};
      const initialExercises: Record<number, Exercise[]> = {};
      selectedProgram.weeks[0].days.forEach((day, i) => {
        initialDates[i] = format(addDays(new Date(), i), 'yyyy-MM-dd');
        const template = WORKOUT_TEMPLATES.find(t => t.id === day.workoutTemplateId);
        initialExercises[i] = template ? JSON.parse(JSON.stringify(template.exercises)) : (day.exercises || []);
      });
      setProgramDates(initialDates);
      setProgramWorkoutsDraft(initialExercises);
      setActiveEditingDay(null);
    }
  }, [selectedProgram]);

  const moveDay = (index: number, direction: 'up' | 'down') => {
    if (!selectedProgram || !selectedProgram.weeks || selectedProgram.weeks.length === 0) return;
    const newWeeks = [...selectedProgram.weeks];
    const days = [...newWeeks[0].days];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= days.length) return;
    
    // Swap days in the template structure
    [days[index], days[targetIndex]] = [days[targetIndex], days[index]];
    
    // Re-index day numbers
    days.forEach((d, idx) => d.dayNumber = idx + 1);
    
    newWeeks[0].days = days;
    setSelectedProgram({...selectedProgram, weeks: newWeeks});

    // Also swap the draft data (dates and exercises) which are indexed by position
    const newDates = { ...programDates };
    const newWorkouts = { ...programWorkoutsDraft };
    
    const tempDate = newDates[index];
    newDates[index] = newDates[targetIndex];
    newDates[targetIndex] = tempDate;

    const tempWorkout = newWorkouts[index];
    newWorkouts[index] = newWorkouts[targetIndex];
    newWorkouts[targetIndex] = tempWorkout;
    
    setProgramDates(newDates);
    setProgramWorkoutsDraft(newWorkouts);
    
    if (activeEditingDay === index) setActiveEditingDay(targetIndex);
    else if (activeEditingDay === targetIndex) setActiveEditingDay(index);
  };

  const moveDraftExercise = (dayIdx: number, exIdx: number, direction: 'up' | 'down') => {
    const newWorkouts = { ...programWorkoutsDraft };
    const exercises = [...(newWorkouts[dayIdx] || [])];
    const targetIndex = direction === 'up' ? exIdx - 1 : exIdx + 1;
    
    if (targetIndex < 0 || targetIndex >= exercises.length) return;
    
    [exercises[exIdx], exercises[targetIndex]] = [exercises[targetIndex], exercises[exIdx]];
    newWorkouts[dayIdx] = exercises;
    setProgramWorkoutsDraft(newWorkouts);
  };

  const updateDraftExercise = (dayIdx: number, exIdx: number, field: keyof Exercise, value: any) => {
    setProgramWorkoutsDraft(prev => {
      const newDraft = { ...prev };
      const newDayExercises = [...newDraft[dayIdx]];
      newDayExercises[exIdx] = { ...newDayExercises[exIdx], [field]: value };
      newDraft[dayIdx] = newDayExercises;
      return newDraft;
    });
  };

  const addDraftExercise = (dayIdx: number) => {
    setProgramWorkoutsDraft(prev => {
      const newDraft = { ...prev };
      newDraft[dayIdx] = [...newDraft[dayIdx], { name: '', youtubeLink: '', sets: 3, reps: '12', weight: '', rest: '60s', coachNote: '' }];
      return newDraft;
    });
  };

  const removeDraftExercise = (dayIdx: number, exIdx: number) => {
    setProgramWorkoutsDraft(prev => {
      const newDraft = { ...prev };
      newDraft[dayIdx] = newDraft[dayIdx].filter((_, i) => i !== exIdx);
      return newDraft;
    });
  };

  const handleAssignSingle = async () => {
    if (!selectedTemplate || !selectedClient || !assignDate) return;
    setAssigning(true);
    try {
      await addDoc(collection(db, 'workouts'), {
        clientId: selectedClient.uid,
        weekNumber: 1,
        dayNumber: 1,
        exercises: selectedTemplate.exercises,
        scheduledDate: assignDate,
        createdAt: serverTimestamp()
      });
      showToast(`Template "${selectedTemplate.name}" assigned to ${selectedClient.displayName}`);
      setShowAssignModal(false);
      setSelectedTemplate(null);
      setSelectedClient(null);
    } catch (error) {
      console.error('Error assigning template:', error);
      showToast('Failed to assign template', 'error');
    } finally {
      setAssigning(false);
    }
  };

  const handleAssignProgram = async () => {
    if (!selectedProgram || !selectedClient || !selectedProgram.weeks || selectedProgram.weeks.length === 0) return;
    
    // Check if all dates are selected
    const workoutsToCreate = selectedProgram.weeks[0].days;
    if (Object.keys(programDates).length < workoutsToCreate.length) {
      showToast('Please select dates for all workouts', 'error');
      return;
    }

    setAssigning(true);
    try {
      const batch = [];
      
      for (let i = 0; i < workoutsToCreate.length; i++) {
        const scheduledDate = programDates[i];
        const exercises = programWorkoutsDraft[i] || [];

        batch.push(addDoc(collection(db, 'workouts'), {
          clientId: selectedClient.uid,
          weekNumber: 1,
          dayNumber: i + 1,
          exercises: exercises.filter(e => e.name.trim() !== ''),
          scheduledDate: scheduledDate,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          status: 'pending'
        }));
      }

      await Promise.all(batch);
      showToast(`Program "${selectedProgram.name}" assigned to ${selectedClient.displayName}`);
      setShowProgramModal(false);
      setSelectedProgram(null);
      setSelectedClient(null);
      setProgramDates({});
      setProgramWorkoutsDraft({});
    } catch (error) {
      console.error('Error assigning program:', error);
      showToast('Failed to assign program', 'error');
    } finally {
      setAssigning(false);
    }
  };

  const handleSaveTemplateChanges = async () => {
    if (!selectedProgram) return;
    setSavingTemplate(true);
    try {
      const updatedWeeks = [{
        weekNumber: 1,
        days: selectedProgram.weeks[0].days.map((day, i) => ({
          ...day,
          exercises: programWorkoutsDraft[i] || []
        }))
      }];

      const templateData = {
        name: editingTemplateName,
        category: editingTemplateCategory,
        description: editingTemplateDescription,
        weeks: updatedWeeks,
        updatedAt: serverTimestamp(),
        isCustom: true
      };

      if (selectedProgram.isCustom && selectedProgram.id) {
        await updateDoc(doc(db, 'templates', selectedProgram.id), templateData);
        showToast('Template updated successfully');
      } else {
        await addDoc(collection(db, 'templates'), {
          ...templateData,
          createdAt: serverTimestamp()
        });
        showToast('New template saved successfully');
      }

      setShowProgramModal(false);
      setIsEditingTemplate(false);
      setSelectedProgram(null);
    } catch (error) {
      console.error('Error saving template:', error);
      showToast('Failed to save template', 'error');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsingFile(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const content = event.target?.result as string;
        const parsedProgram = await parseWorkoutFile(content, file.name);
        
        if (parsedProgram) {
          // Save to Firestore
          await addDoc(collection(db, 'templates'), {
            ...parsedProgram,
            createdAt: serverTimestamp(),
            isCustom: true
          });
          showToast(`Custom program "${parsedProgram.name}" generated and saved!`);
        } else {
          showToast('Failed to parse workout file. Please try a different format.', 'error');
        }
        setParsingFile(false);
      };
      reader.readAsText(file);
    } catch (error) {
      console.error('Error uploading workout file:', error);
      showToast('Error processing file', 'error');
      setParsingFile(false);
    }
  };

  const allPrograms = [...WEEKLY_PROGRAMS, ...customPrograms];

  return (
    <div className="space-y-12">
      {/* Upload Section */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-[40px] p-10 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-10 transition-opacity">
          <Upload className="w-32 h-32 text-orange-500" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4 text-center md:text-left">
            <div className="inline-flex p-3 bg-orange-500/10 rounded-2xl text-orange-500">
              <Sparkles className="w-6 h-6" />
            </div>
            <h2 className="text-3xl font-black uppercase tracking-tight">AI Template Generator</h2>
            <p className="text-zinc-400 max-w-md leading-relaxed">
              Upload your workout splits in document or spreadsheet format. Nik's AI will analyze the content and generate a fully structured template for you.
            </p>
          </div>
          
          <label className={cn(
            "flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-[32px] p-10 cursor-pointer hover:border-orange-500/50 transition-all bg-zinc-950 min-w-[300px]",
            parsingFile && "opacity-50 cursor-not-allowed"
          )}>
            {parsingFile ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
                <span className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Nik is analyzing...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 bg-orange-500/10 rounded-2xl text-orange-500">
                  <Upload className="w-8 h-8" />
                </div>
                <div className="text-center">
                  <span className="block text-white font-bold">Upload Split File</span>
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">DOC, TXT, CSV, XLS</span>
                </div>
              </div>
            )}
            <input type="file" className="hidden" onChange={handleFileUpload} disabled={parsingFile} accept=".txt,.doc,.docx,.csv,.xls,.xlsx" />
          </label>
        </div>
      </section>

      {/* Weekly Programs Section */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-500/10 rounded-lg text-orange-500">
            <Layers className="w-5 h-5" />
          </div>
          <h2 className="text-2xl font-bold">Program Library</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allPrograms.map((program) => (
            <div 
              key={program.id || program.name} 
              className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 flex flex-col hover:border-orange-500/30 transition-all group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                <Layers className="w-24 h-24 text-orange-500" />
              </div>
              <div className="flex items-start justify-between mb-6">
                <div className="flex gap-2">
                  <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest bg-orange-500/10 px-3 py-1 rounded-full border border-orange-500/20">
                    {program.category}
                  </span>
                  {program.isCustom && (
                    <span className="text-[10px] font-bold text-purple-500 uppercase tracking-widest bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      AI Generated
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  {program.weeks?.[0]?.days?.length || 0} Workouts
                </span>
              </div>
              <h3 className="text-xl font-bold mb-3">{program.name}</h3>
              <p className="text-zinc-500 text-sm mb-8 flex-1 leading-relaxed line-clamp-3">{program.description}</p>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    setSelectedProgram(program);
                    setIsEditingTemplate(false);
                    setShowProgramModal(true);
                  }}
                  className="flex-1 py-4 bg-orange-500 text-white font-bold rounded-2xl hover:bg-orange-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
                >
                  <Calendar className="w-5 h-5" />
                  Schedule
                </button>
                <button 
                  onClick={() => {
                    setSelectedProgram(program);
                    setIsEditingTemplate(true);
                    setEditingTemplateName(program.name);
                    setEditingTemplateCategory(program.category);
                    setEditingTemplateDescription(program.description);
                    setShowProgramModal(true);
                  }}
                  className="p-4 bg-zinc-800 text-zinc-400 hover:text-white rounded-2xl transition-all"
                  title="Edit Template"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
                {program.isCustom && (
                  <button 
                    onClick={async () => {
                      if (confirm('Are you sure you want to delete this custom template?')) {
                        await deleteDoc(doc(db, 'templates', program.id!));
                        showToast('Template deleted');
                      }
                    }}
                    className="p-4 bg-zinc-800 text-zinc-500 hover:text-red-500 rounded-2xl transition-all"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Single Workout Templates Section */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-800 rounded-lg text-zinc-400">
            <BookOpen className="w-5 h-5" />
          </div>
          <h2 className="text-2xl font-bold">Single Workouts</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {WORKOUT_TEMPLATES.map((template) => (
            <div 
              key={template.id} 
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col hover:border-orange-500/30 transition-all group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-zinc-950 rounded-2xl text-zinc-500 group-hover:text-orange-500 transition-colors">
                  <BookOpen className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-950 px-3 py-1 rounded-full border border-zinc-800">
                  {template.category}
                </span>
              </div>
              <h3 className="text-lg font-bold mb-2">{template.name}</h3>
              <div className="flex-1" />
              <div className="space-y-3 mt-4">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Exercises</span>
                  <span className="font-bold">{template.exercises.length}</span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      setSelectedTemplate(template);
                      setShowAssignModal(true);
                    }}
                    className="flex-1 py-3 bg-zinc-800 text-white font-bold rounded-xl hover:bg-zinc-700 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Assign
                  </button>
                  <button 
                    onClick={() => {
                      const tempProgram: ProgramTemplate = {
                        name: template.name,
                        category: template.category || 'General',
                        description: template.description || '',
                        weeks: [{
                          weekNumber: 1,
                          days: [{ dayNumber: 1, label: 'Workout', exercises: template.exercises }]
                        }],
                        isCustom: false
                      };
                      setSelectedProgram(tempProgram);
                      setIsEditingTemplate(true);
                      setEditingTemplateName(tempProgram.name);
                      setEditingTemplateCategory(tempProgram.category);
                      setEditingTemplateDescription(tempProgram.description);
                      setShowProgramModal(true);
                    }}
                    className="p-3 bg-zinc-950 text-zinc-500 hover:text-white rounded-xl transition-all"
                    title="Edit & Save to Library"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Program Assignment Modal */}
      <AnimatePresence>
        {showProgramModal && selectedProgram && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowProgramModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-5xl bg-zinc-900 border border-zinc-800 rounded-[40px] shadow-2xl p-10 space-y-8 overflow-y-auto max-h-[90vh] custom-scrollbar"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-2 flex-1">
                  {isEditingTemplate ? (
                    <div className="space-y-4">
                      <input 
                        className="text-3xl font-black uppercase tracking-tight bg-transparent border-b border-zinc-800 focus:border-orange-500 outline-none w-full"
                        value={editingTemplateName}
                        onChange={(e) => setEditingTemplateName(e.target.value)}
                        placeholder="Template Name"
                      />
                      <div className="flex gap-4">
                        <input 
                          className="text-xs font-bold text-orange-500 uppercase tracking-widest bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1 outline-none focus:ring-1 focus:ring-orange-500"
                          value={editingTemplateCategory}
                          onChange={(e) => setEditingTemplateCategory(e.target.value)}
                          placeholder="Category"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-3xl font-black uppercase tracking-tight">Schedule Program</h3>
                      <p className="text-zinc-400 font-medium">Assigning "{selectedProgram.name}" to client calendar.</p>
                    </>
                  )}
                </div>
                <button 
                  onClick={() => {
                    setShowProgramModal(false);
                    setIsEditingTemplate(false);
                  }}
                  className="p-2 hover:bg-zinc-800 rounded-full transition-colors ml-4"
                >
                  <X className="w-6 h-6 text-zinc-500" />
                </button>
              </div>

              {isEditingTemplate && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Description</label>
                  <textarea 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-4 text-sm outline-none focus:ring-2 focus:ring-orange-500 transition-all min-h-[80px] resize-none"
                    value={editingTemplateDescription}
                    onChange={(e) => setEditingTemplateDescription(e.target.value)}
                    placeholder="Describe the goals and structure of this program..."
                  />
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-4 space-y-6">
                  {!isEditingTemplate && (
                    <div className="space-y-3">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">1. Select Client</label>
                      <select 
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-4 text-sm outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                        onChange={(e) => setSelectedClient(clients.find(c => c.uid === e.target.value) || null)}
                        value={selectedClient?.uid || ''}
                      >
                        <option value="">Select a client...</option>
                        {clients.map(c => (
                          <option key={c.uid} value={c.uid}>{c.displayName || c.email}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-3">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">
                      {isEditingTemplate ? 'Program Structure' : '2. Schedule & Days'}
                    </label>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {selectedProgram.weeks?.[0]?.days?.map((day, i) => (
                        <div 
                          key={i} 
                          onClick={() => setActiveEditingDay(i)}
                          className={cn(
                            "w-full text-left bg-zinc-950 border rounded-2xl p-4 transition-all group cursor-pointer",
                            activeEditingDay === i ? "border-orange-500 ring-1 ring-orange-500" : "border-zinc-800 hover:border-zinc-700"
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            {isEditingTemplate ? (
                              <input 
                                className="text-[10px] font-bold uppercase tracking-widest bg-transparent border-b border-zinc-800 focus:border-orange-500 outline-none flex-1 mr-4"
                                value={day.label}
                                onChange={(e) => {
                                  const newWeeks = [...selectedProgram.weeks];
                                  newWeeks[0].days[i].label = e.target.value;
                                  setSelectedProgram({...selectedProgram, weeks: newWeeks});
                                }}
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <span className={cn(
                                "text-[10px] font-bold uppercase tracking-widest",
                                activeEditingDay === i ? "text-orange-500" : "text-zinc-500"
                              )}>{day.label}</span>
                            )}
                            <div className="flex items-center gap-2">
                              <div className="flex flex-col gap-1 mr-1">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); moveDay(i, 'up'); }}
                                  disabled={i === 0}
                                  className="p-1 text-zinc-600 hover:text-orange-500 disabled:opacity-20 transition-colors"
                                  title="Move Day Up"
                                >
                                  <ChevronUp className="w-3 h-3" />
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); moveDay(i, 'down'); }}
                                  disabled={i === selectedProgram.weeks[0].days.length - 1}
                                  className="p-1 text-zinc-600 hover:text-orange-500 disabled:opacity-20 transition-colors"
                                  title="Move Day Down"
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </button>
                              </div>
                              <span className="text-[10px] text-zinc-600 font-bold">Day {i + 1}</span>
                              {activeEditingDay === i && <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />}
                              {isEditingTemplate && (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newWeeks = [...selectedProgram.weeks];
                                    newWeeks[0].days.splice(i, 1);
                                    // Re-index days
                                    newWeeks[0].days.forEach((d, idx) => d.dayNumber = idx + 1);
                                    setSelectedProgram({...selectedProgram, weeks: newWeeks});
                                    if (activeEditingDay === i) setActiveEditingDay(null);
                                  }}
                                  className="p-1 text-zinc-600 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          {!isEditingTemplate && (
                            <div className="flex items-center gap-2">
                              <Calendar className="w-3 h-3 text-zinc-600" />
                              <input 
                                type="date"
                                className="bg-transparent text-xs font-bold text-zinc-300 outline-none w-full"
                                value={programDates[i] || ''}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setProgramDates(prev => ({ ...prev, [i]: e.target.value }))}
                              />
                            </div>
                          )}
                          <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-500 font-bold">
                            <BookOpen className="w-3 h-3" />
                            {programWorkoutsDraft[i]?.length || 0} Exercises
                          </div>
                        </div>
                      ))}
                      {isEditingTemplate && (
                        <button 
                          onClick={() => {
                            const newWeeks = [...selectedProgram.weeks];
                            const newDayNum = newWeeks[0].days.length + 1;
                            newWeeks[0].days.push({ dayNumber: newDayNum, label: `Day ${newDayNum}`, exercises: [] });
                            setSelectedProgram({...selectedProgram, weeks: newWeeks});
                            setProgramWorkoutsDraft(prev => ({ ...prev, [newDayNum - 1]: [] }));
                          }}
                          className="w-full py-4 border border-dashed border-zinc-800 rounded-2xl text-zinc-500 hover:text-white hover:border-zinc-700 transition-all flex items-center justify-center gap-2 text-xs font-bold"
                        >
                          <Plus className="w-4 h-4" />
                          Add Day to Program
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-8 bg-zinc-950 border border-zinc-800 rounded-[32px] overflow-hidden flex flex-col min-h-[500px]">
                  {activeEditingDay !== null ? (
                    <div className="flex flex-col h-full">
                      <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30">
                        <div>
                          <h4 className="font-bold text-lg text-white">
                            Customize: {selectedProgram.weeks?.[0]?.days?.[activeEditingDay]?.label}
                          </h4>
                          <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Workout Day {activeEditingDay + 1}</p>
                        </div>
                        <button 
                          onClick={() => setActiveEditingDay(null)}
                          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                        >
                          Back to Summary
                        </button>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                        {programWorkoutsDraft[activeEditingDay]?.map((ex, exIdx) => (
                          <div key={exIdx} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500">
                                  {exIdx + 1}
                                </div>
                                <input 
                                  className="bg-transparent border-b border-zinc-800 focus:border-orange-500 outline-none font-bold text-sm w-full py-1"
                                  value={ex.name}
                                  placeholder="Exercise name..."
                                  onChange={(e) => updateDraftExercise(activeEditingDay, exIdx, 'name', e.target.value)}
                                />
                              </div>
                              <div className="flex items-center gap-1 mr-2">
                                <button
                                  onClick={() => moveDraftExercise(activeEditingDay, exIdx, 'up')}
                                  disabled={exIdx === 0}
                                  className="p-1.5 text-zinc-600 hover:text-orange-500 disabled:opacity-20 transition-colors"
                                >
                                  <ChevronUp className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => moveDraftExercise(activeEditingDay, exIdx, 'down')}
                                  disabled={exIdx === (programWorkoutsDraft[activeEditingDay]?.length || 0) - 1}
                                  className="p-1.5 text-zinc-600 hover:text-orange-500 disabled:opacity-20 transition-colors"
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </button>
                              </div>
                              <button 
                                onClick={() => removeDraftExercise(activeEditingDay, exIdx)}
                                className="p-2 text-zinc-600 hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="space-y-1">
                                <label className="text-[9px] text-zinc-600 uppercase font-bold">Sets</label>
                                <input 
                                  type="number"
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-orange-500"
                                  value={ex.sets}
                                  onChange={(e) => updateDraftExercise(activeEditingDay, exIdx, 'sets', parseInt(e.target.value))}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] text-zinc-600 uppercase font-bold">Reps</label>
                                <input 
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-orange-500"
                                  value={ex.reps}
                                  onChange={(e) => updateDraftExercise(activeEditingDay, exIdx, 'reps', e.target.value)}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] text-zinc-600 uppercase font-bold">Weight</label>
                                <input 
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-orange-500"
                                  value={ex.weight}
                                  placeholder="kg/lb"
                                  onChange={(e) => updateDraftExercise(activeEditingDay, exIdx, 'weight', e.target.value)}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] text-zinc-600 uppercase font-bold">Rest</label>
                                <input 
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-orange-500"
                                  value={ex.rest}
                                  placeholder="60s"
                                  onChange={(e) => updateDraftExercise(activeEditingDay, exIdx, 'rest', e.target.value)}
                                />
                              </div>
                            </div>

                            <div className="space-y-3">
                              <div className="space-y-1">
                                <label className="text-[9px] text-zinc-600 uppercase font-bold">YouTube Video Link</label>
                                <div className="flex gap-2">
                                  <div className="relative flex-1">
                                    <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                                    <input 
                                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-orange-500"
                                      value={ex.youtubeLink}
                                      placeholder="https://youtube.com/watch?v=..."
                                      onChange={(e) => updateDraftExercise(activeEditingDay, exIdx, 'youtubeLink', e.target.value)}
                                    />
                                  </div>
                                </div>
                              </div>
                              
                              {ex.youtubeLink && getYouTubeId(ex.youtubeLink) && (
                                <div className="relative aspect-video rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
                                  <iframe
                                    className="absolute inset-0 w-full h-full"
                                    src={`https://www.youtube.com/embed/${getYouTubeId(ex.youtubeLink)}`}
                                    title="YouTube video player"
                                    frameBorder="0"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                        
                        <button 
                          onClick={() => addDraftExercise(activeEditingDay)}
                          className="w-full py-3 border border-dashed border-zinc-800 rounded-2xl text-zinc-500 hover:text-white hover:border-zinc-700 transition-all flex items-center justify-center gap-2 text-xs font-bold"
                        >
                          <Plus className="w-4 h-4" />
                          Add Exercise to Day {activeEditingDay + 1}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full p-12 text-center space-y-6">
                      <div className="p-6 bg-zinc-900 rounded-full border border-zinc-800">
                        <Edit2 className="w-12 h-12 text-zinc-700" />
                      </div>
                      <div className="max-w-xs">
                        <h4 className="font-bold text-xl mb-2">Customize Exercises</h4>
                        <p className="text-sm text-zinc-500 leading-relaxed">
                          Select a day from the left to review and customize the exercises before assigning them to the client's calendar.
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2">
                        {selectedProgram.weeks?.[0]?.days?.map((_, i) => (
                          <button 
                            key={i}
                            onClick={() => setActiveEditingDay(i)}
                            className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-bold uppercase hover:border-orange-500/50 transition-all"
                          >
                            Day {i + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-zinc-800">
                <button
                  onClick={() => {
                    setShowProgramModal(false);
                    setIsEditingTemplate(false);
                  }}
                  className="flex-1 py-4 border border-zinc-800 rounded-2xl font-bold text-zinc-400 hover:bg-zinc-800 transition-all"
                >
                  Cancel
                </button>
                {isEditingTemplate ? (
                  <button
                    onClick={handleSaveTemplateChanges}
                    disabled={savingTemplate || !editingTemplateName}
                    className="flex-[2] bg-purple-600 text-white font-bold py-4 rounded-2xl hover:bg-purple-700 disabled:opacity-50 transition-all shadow-xl shadow-purple-500/20 flex items-center justify-center gap-2"
                  >
                    {savingTemplate ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {savingTemplate ? 'Saving...' : 'Save Template Changes'}
                  </button>
                ) : (
                  <button
                    onClick={handleAssignProgram}
                    disabled={assigning || !selectedClient}
                    className="flex-[2] bg-orange-500 text-white font-bold py-4 rounded-2xl hover:bg-orange-600 disabled:opacity-50 transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2"
                  >
                    {assigning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Calendar className="w-5 h-5" />}
                    {assigning ? 'Scheduling...' : 'Confirm & Assign Program'}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Single Assign Modal (Existing) */}
      <AnimatePresence>
        {showAssignModal && selectedTemplate && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAssignModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl p-8 space-y-6"
            >
              <div className="space-y-2">
                <h3 className="text-2xl font-bold">Assign Single Workout</h3>
                <p className="text-zinc-400">Assigning "{selectedTemplate.name}"</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Select Client</label>
                  <select 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                    onChange={(e) => setSelectedClient(clients.find(c => c.uid === e.target.value) || null)}
                    value={selectedClient?.uid || ''}
                  >
                    <option value="">Select a client...</option>
                    {clients.map(c => (
                      <option key={c.uid} value={c.uid}>{c.displayName || c.email}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Schedule Date</label>
                  <input 
                    type="date"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                    value={assignDate}
                    onChange={(e) => setAssignDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="flex-1 py-4 border border-zinc-800 rounded-2xl font-bold text-zinc-400 hover:bg-zinc-800 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignSingle}
                  disabled={assigning || !selectedClient}
                  className="flex-1 bg-orange-500 text-white font-bold py-4 rounded-2xl hover:bg-orange-600 disabled:opacity-50 transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2"
                >
                  {assigning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                  Assign
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RemindersView({ clients, showToast, currentUser }: { clients: UserProfile[], showToast: (m: string) => void, currentUser: User }) {
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [messageType, setMessageType] = useState<'motivation' | 'reminder'>('motivation');
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);

  const toggleClient = (uid: string) => {
    setSelectedClients(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const sendBroadcast = async () => {
    if (selectedClients.length === 0 || !messageText.trim()) return;
    setSending(true);
    try {
      const promises = selectedClients.map(clientId => 
        addDoc(collection(db, 'messages'), {
          senderId: currentUser.uid,
          receiverId: clientId,
          text: messageText,
          type: messageType,
          isRead: false,
          createdAt: serverTimestamp()
        })
      );
      await Promise.all(promises);
      showToast(`Successfully sent ${messageType} to ${selectedClients.length} clients!`);
      setMessageText('');
      setSelectedClients([]);
    } catch (error) {
      console.error('Error sending reminders:', error);
      showToast('Failed to send messages.');
    } finally {
      setSending(false);
    }
  };

  const motivationTemplates = [
    "Keep pushing! You're doing amazing work this week. 🔥",
    "Consistency is key. I see you logging those workouts, keep it up! 👏",
    "Don't stop now. You're closer to your goals than you were yesterday.",
    "Nik's tip: Focus on your form today. Quality over quantity! 💪"
  ];

  const reminderTemplates = [
    "Don't forget to log your water intake today! 💧",
    "Time to hit those steps! A quick walk makes a big difference. 🚶‍♂️",
    "Reminder: Your scheduled workout is waiting for you. Let's get it done!",
    "Nik's reminder: Make sure you're hitting your protein targets today. 🥩"
  ];

  return (
    <div className="space-y-8">
      <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 space-y-8">
        <div className="flex items-center gap-4">
          <div className={cn(
            "p-4 rounded-2xl text-white shadow-lg",
            messageType === 'motivation' ? "bg-purple-500 shadow-purple-500/20" : "bg-blue-500 shadow-blue-500/20"
          )}>
            {messageType === 'motivation' ? <Sparkles className="w-6 h-6" /> : <Bell className="w-6 h-6" />}
          </div>
          <div>
            <h3 className="text-2xl font-bold">Quick Broadcast</h3>
            <p className="text-zinc-500">Send motivational messages or reminders to multiple clients at once.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">1. Select Message Type</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setMessageType('motivation')}
                  className={cn(
                    "flex-1 py-3 rounded-xl font-bold text-sm transition-all border",
                    messageType === 'motivation' 
                      ? "bg-purple-500/10 border-purple-500/50 text-purple-400" 
                      : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                  )}
                >
                  Motivation
                </button>
                <button
                  onClick={() => setMessageType('reminder')}
                  className={cn(
                    "flex-1 py-3 rounded-xl font-bold text-sm transition-all border",
                    messageType === 'reminder' 
                      ? "bg-blue-500/10 border-blue-500/50 text-blue-400" 
                      : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                  )}
                >
                  Reminder
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">2. Choose Template or Write</label>
              <div className="flex flex-wrap gap-2">
                {(messageType === 'motivation' ? motivationTemplates : reminderTemplates).map((t, i) => (
                  <button
                    key={i}
                    onClick={() => setMessageText(t)}
                    className="text-[10px] bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-400 hover:border-zinc-600 transition-all text-left max-w-xs"
                  >
                    {t}
                  </button>
                ))}
              </div>
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type your message here..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-sm focus:ring-1 focus:ring-orange-500 outline-none min-h-[120px]"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">3. Select Clients ({selectedClients.length})</label>
              <button 
                onClick={() => setSelectedClients(selectedClients.length === clients.length ? [] : clients.map(c => c.uid))}
                className="text-[10px] font-bold text-orange-500 uppercase hover:underline"
              >
                {selectedClients.length === clients.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 max-h-[300px] overflow-y-auto custom-scrollbar space-y-2">
              {clients.map(client => (
                <button
                  key={client.uid}
                  onClick={() => toggleClient(client.uid)}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-xl border transition-all",
                    selectedClients.includes(client.uid)
                      ? "bg-orange-500/10 border-orange-500/50 text-white"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full overflow-hidden border border-zinc-800">
                      <img 
                        src={client.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${client.email}`} 
                        alt={client.displayName} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <span className="text-sm font-medium">{client.displayName}</span>
                  </div>
                  {selectedClients.includes(client.uid) && <CheckCircle className="w-4 h-4 text-orange-500" />}
                </button>
              ))}
            </div>

            <button
              onClick={sendBroadcast}
              disabled={sending || selectedClients.length === 0 || !messageText.trim()}
              className="w-full py-4 bg-orange-500 text-white font-bold rounded-2xl hover:bg-orange-600 disabled:opacity-50 transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2"
            >
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              {sending ? 'Sending...' : `Send to ${selectedClients.length} Clients`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarView({ clients, showToast, confirmAction }: { clients: UserProfile[], showToast: (m: string, t?: 'success' | 'error') => void, confirmAction: (t: string, m: string, c: () => void) => void }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedClientForSchedule, setSelectedClientForSchedule] = useState<UserProfile | null>(null);
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'workouts'), where('scheduledDate', '!=', null));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setWorkouts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Workout));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'workouts');
    });
    return () => unsubscribe();
  }, []);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end = endOfWeek(endOfMonth(currentMonth));
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const getWorkoutsForDay = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    return workouts.filter(w => w.scheduledDate === dateStr);
  };

  const handleEditWorkout = (workout: Workout) => {
    const client = clients.find(c => c.uid === workout.clientId);
    setEditingWorkout(workout);
    setSelectedClientForSchedule(client || null);
    setSelectedDate(parseISO(workout.scheduledDate!));
    setShowScheduleModal(true);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl">
      <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-orange-500 rounded-2xl text-white shadow-lg shadow-orange-500/20">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold">{format(currentMonth, 'MMMM yyyy')}</h3>
            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Workout Schedule</p>
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
                "min-h-[120px] p-2 border-r border-b border-zinc-800 last:border-r-0 relative group transition-colors",
                !isCurrentMonth ? "bg-zinc-950/30" : "bg-zinc-900/20",
                isToday(day) && "bg-orange-500/5"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={cn(
                  "text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full transition-colors",
                  isToday(day) ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" : 
                  isCurrentMonth ? "text-zinc-400" : "text-zinc-700"
                )}>
                  {format(day, 'd')}
                </span>
                <button
                  onClick={() => {
                    setSelectedDate(day);
                    setShowScheduleModal(true);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-orange-500 hover:text-white rounded-md transition-all text-zinc-600"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>

              <div className="space-y-1 overflow-y-auto max-h-[80px] custom-scrollbar">
                {dayWorkouts.map(w => {
                  const client = clients.find(c => c.uid === w.clientId);
                  return (
                    <div 
                      key={w.id} 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditWorkout(w);
                      }}
                      className="group/item relative px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-md text-[9px] font-bold text-zinc-300 truncate hover:border-orange-500/50 transition-colors cursor-pointer"
                      title={`${client?.displayName || 'Client'}: Week ${w.weekNumber} Day ${w.dayNumber}`}
                    >
                      <span className="text-orange-500 mr-1">{client?.displayName?.split(' ')[0] || 'Client'}</span>
                      W{w.weekNumber}D{w.dayNumber}
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmAction(
                            'Delete Workout',
                            `Are you sure you want to delete the workout for ${client?.displayName}?`,
                            async () => {
                              try {
                                await deleteDoc(doc(db, 'workouts', w.id!));
                                showToast('Workout deleted successfully');
                              } catch (err) {
                                handleFirestoreError(err, OperationType.DELETE, `workouts/${w.id}`);
                                showToast('Failed to delete workout', 'error');
                              }
                            }
                          );
                        }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/item:opacity-100 p-0.5 bg-zinc-900 rounded hover:text-red-500 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {showScheduleModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowScheduleModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-4xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-xl">{editingWorkout ? 'Edit Workout' : 'Schedule Workout'}</h3>
                  <p className="text-xs text-zinc-500 font-medium">{selectedDate && format(selectedDate, 'EEEE, MMMM do')}</p>
                </div>
                <button 
                  onClick={() => {
                    setShowScheduleModal(false);
                    setEditingWorkout(null);
                    setSelectedClientForSchedule(null);
                  }} 
                  className="text-zinc-500 hover:text-white"
                >
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                {!selectedClientForSchedule ? (
                  <div className="space-y-4">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Select Client</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {clients.map(client => (
                        <button
                          key={client.uid}
                          onClick={() => setSelectedClientForSchedule(client)}
                          className="flex items-center gap-3 p-4 bg-zinc-950 border border-zinc-800 rounded-2xl hover:border-orange-500/50 transition-all group"
                        >
                          <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center font-bold text-zinc-500 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                            {client.displayName?.charAt(0) || client.email.charAt(0)}
                          </div>
                          <div className="text-left">
                            <div className="font-bold text-sm">{client.displayName || 'Unnamed Client'}</div>
                            <div className="text-[10px] text-zinc-500 uppercase font-bold">{client.email}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between bg-zinc-950 p-4 rounded-2xl border border-zinc-800">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center font-bold text-white">
                          {selectedClientForSchedule.displayName?.charAt(0) || selectedClientForSchedule.email.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-sm">{selectedClientForSchedule.displayName}</div>
                          <div className="text-[10px] text-zinc-500 font-bold uppercase">Scheduling for {selectedDate && format(selectedDate, 'MMM do')}</div>
                        </div>
                      </div>
                      <button 
                        onClick={() => setSelectedClientForSchedule(null)}
                        className="text-xs font-bold text-orange-500 hover:underline"
                      >
                        Change Client
                      </button>
                    </div>
                    
                    <WorkoutManager 
                      client={selectedClientForSchedule} 
                      initialDate={selectedDate || undefined} 
                      initialWorkout={editingWorkout || undefined}
                      onSave={() => {
                        setShowScheduleModal(false);
                        setSelectedClientForSchedule(null);
                        setEditingWorkout(null);
                        showToast(editingWorkout ? 'Workout updated' : 'Workout assigned');
                      }}
                      showToast={showToast}
                      confirmAction={confirmAction}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ClientDetailsEditor({ client, showToast }: { client: UserProfile, showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [goals, setGoals] = useState(client.programGoals || '');
  const [details, setDetails] = useState(client.programDetails || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setGoals(client.programGoals || '');
    setDetails(client.programDetails || '');
  }, [client]);

  const handleUpdate = async () => {
    setSaving(true);
    try {
      const userDocRef = doc(db, 'users', client.uid);
      await updateDoc(userDocRef, {
        programGoals: goals,
        programDetails: details
      }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `users/${client.uid}`));
      showToast('Client details updated!');
    } catch (error) {
      console.error('Error updating client:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-xl flex items-center gap-2">
          <Edit2 className="w-5 h-5 text-orange-500" />
          Program Details
        </h3>
        <button
          onClick={handleUpdate}
          disabled={saving}
          className="bg-orange-500 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-all"
        >
          {saving ? 'Saving...' : 'Update Program'}
        </button>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] text-zinc-500 uppercase font-bold">Program Goals</label>
          <textarea
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            placeholder="e.g. Weight loss, Muscle gain..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm focus:ring-1 focus:ring-orange-500 outline-none min-h-[80px]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-zinc-500 uppercase font-bold">Program Details</label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="e.g. 12-week hypertrophy block..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm focus:ring-1 focus:ring-orange-500 outline-none min-h-[80px]"
          />
        </div>
      </div>
    </div>
  );
}

function ClientHistory({ client }: { client: UserProfile }) {
  const [history, setHistory] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'feedback'),
      where('clientId', '==', client.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Feedback));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'feedback');
    });
    return () => unsubscribe();
  }, [client.uid]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col h-full">
      <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
        <h3 className="font-bold text-xl flex items-center gap-2">
          <Clock className="w-5 h-5 text-orange-500" />
          Client History
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto max-h-[500px] divide-y divide-zinc-800">
        {loading ? (
          <div className="p-8 text-center text-zinc-500">Loading history...</div>
        ) : history.length > 0 ? (
          history.map((fb) => (
            <div key={fb.id} className="p-4 hover:bg-zinc-800/50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-orange-500 uppercase">Week {fb.weekNumber} • Day {fb.dayNumber}</span>
                <span className="text-[10px] text-zinc-500">{fb.createdAt?.toDate?.().toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-zinc-300 italic">"{fb.clientNote || 'No note left'}"</p>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-zinc-500">No history yet.</div>
        )}
      </div>
    </div>
  );
}

function getYouTubeId(url: string) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

function NutritionManager({ client, showToast }: { client: UserProfile, showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [activePlan, setActivePlan] = useState<NutritionPlan | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzingFile, setAnalyzingFile] = useState(false);
  const [planDraft, setPlanDraft] = useState<Partial<NutritionPlan>>({
    name: '',
    description: '',
    targetMacros: { calories: 2000, protein: 150, carbs: 200, fats: 70 },
    guidelines: [],
    plannedMeals: [],
    recommendedFoods: [],
    restrictedFoods: [],
    isActive: true
  });

  useEffect(() => {
    if (!client.uid) return;
    const q = query(collection(db, 'nutritionPlans'), where('clientId', '==', client.uid), where('isActive', '==', true), limit(1));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const plan = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as NutritionPlan;
        setActivePlan(plan);
        setPlanDraft(plan);
      } else {
        setActivePlan(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'nutritionPlans');
    });
    return () => unsubscribe();
  }, [client.uid]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAnalyzingFile(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target?.result as string;
        const analysis = await analyzeNutritionFile(content, file.name);
        if (analysis) {
          setPlanDraft({
            ...planDraft,
            ...analysis,
            isActive: true
          });
          showToast('Nutrition plan extracted successfully!');
        }
      };
      reader.readAsText(file);
    } catch (error) {
      console.error("Error analyzing nutrition file:", error);
      showToast('Failed to analyze file', 'error');
    } finally {
      setAnalyzingFile(false);
    }
  };

  const applyTemplate = (template: NutritionTemplate) => {
    setPlanDraft({
      ...planDraft,
      name: template.name,
      description: template.description,
      targetMacros: { ...template.targetMacros },
      guidelines: [...template.guidelines],
      plannedMeals: [],
      recommendedFoods: [],
      restrictedFoods: []
    });
    setIsEditing(true);
  };

  const handleSavePlan = async () => {
    if (!client.uid) return;
    setSaving(true);
    try {
      // Deactivate old plans
      const q = query(collection(db, 'nutritionPlans'), where('clientId', '==', client.uid), where('isActive', '==', true));
      let oldPlans;
      try {
        oldPlans = await getDocs(q);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'nutritionPlans');
        return;
      }

      for (const d of oldPlans.docs) {
        try {
          await updateDoc(doc(db, 'nutritionPlans', d.id), { isActive: false });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `nutritionPlans/${d.id}`);
        }
      }

      const planData = {
        ...planDraft,
        clientId: client.uid,
        isActive: true,
        createdAt: serverTimestamp()
      };

      try {
        await addDoc(collection(db, 'nutritionPlans'), planData);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'nutritionPlans');
      }

      showToast('Nutrition plan updated successfully!');
      setIsEditing(false);
    } catch (error) {
      console.error("Error saving plan:", error);
      showToast('Failed to save plan', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold">Nutrition Advisor</h3>
          <p className="text-zinc-500 text-sm">Design a scientific nutrition framework for {client.displayName}.</p>
        </div>
        {!isEditing && (
          <button 
            onClick={() => setIsEditing(true)}
            className="px-6 py-3 bg-orange-500 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20"
          >
            {activePlan ? 'Update Plan' : 'Create New Plan'}
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {isEditing ? (
          <motion.div
            key="editing"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8 bg-zinc-900 border border-zinc-800 rounded-[32px] p-8"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">AI Setup</label>
                    <div className="relative group">
                      <input 
                        type="file" 
                        id="nutrition-upload" 
                        className="hidden" 
                        accept="application/pdf,image/*,text/*"
                        onChange={handleFileUpload}
                      />
                      <label 
                        htmlFor="nutrition-upload"
                        className="flex items-center gap-2 px-4 py-2 bg-zinc-950 border border-dashed border-zinc-800 rounded-xl text-[10px] font-bold text-zinc-400 hover:text-white hover:border-orange-500 transition-all cursor-pointer"
                      >
                        {analyzingFile ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                        {analyzingFile ? 'Analyzing...' : 'Upload Plan (PDF/Img)'}
                      </label>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {NUTRITION_TEMPLATES.map(t => (
                      <button
                        key={t.id}
                        onClick={() => applyTemplate(t)}
                        className="p-4 bg-zinc-950 border border-zinc-800 rounded-2xl text-left hover:border-orange-500 transition-all group"
                      >
                        <h4 className="font-bold text-xs group-hover:text-orange-500 transition-colors">{t.name}</h4>
                        <p className="text-[10px] text-zinc-500 mt-1 line-clamp-1">{t.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Plan Name</label>
                    <input 
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-4 text-sm outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                      value={planDraft.name}
                      onChange={(e) => setPlanDraft({...planDraft, name: e.target.value})}
                      placeholder="e.g. Lean Muscle Evolution"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Description</label>
                    <textarea 
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-4 text-sm outline-none focus:ring-2 focus:ring-orange-500 transition-all min-h-[100px] resize-none"
                      value={planDraft.description}
                      onChange={(e) => setPlanDraft({...planDraft, description: e.target.value})}
                      placeholder="Overall strategy for this client..."
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-4 border-t border-zinc-800">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1 flex items-center justify-between">
                    Meal Schedule
                    <button 
                      onClick={() => setPlanDraft({...planDraft, plannedMeals: [...(planDraft.plannedMeals || []), { id: crypto.randomUUID(), time: '08:00', name: '', notes: '' }]})}
                      className="text-[10px] text-orange-500 hover:text-orange-400 font-bold"
                    >
                      + Add Meal
                    </button>
                  </label>
                  <div className="space-y-3">
                    {planDraft.plannedMeals?.map((m, i) => (
                      <div key={m.id} className="p-4 bg-zinc-950 border border-zinc-800 rounded-2xl space-y-3">
                        <div className="flex gap-2">
                          <input 
                            type="time"
                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-[10px] text-zinc-400"
                            value={m.time}
                            onChange={(e) => {
                              const newM = [...planDraft.plannedMeals!];
                              newM[i].time = e.target.value;
                              setPlanDraft({...planDraft, plannedMeals: newM});
                            }}
                          />
                          <input 
                            placeholder="Meal Name"
                            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1 text-xs text-white"
                            value={m.name}
                            onChange={(e) => {
                              const newM = [...planDraft.plannedMeals!];
                              newM[i].name = e.target.value;
                              setPlanDraft({...planDraft, plannedMeals: newM});
                            }}
                          />
                          <button 
                            onClick={() => {
                              const newM = planDraft.plannedMeals!.filter(meal => meal.id !== m.id);
                              setPlanDraft({...planDraft, plannedMeals: newM});
                            }}
                            className="text-zinc-600 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <input 
                          placeholder="Items/Notes (e.g. 3 eggs, 2 slices toast)"
                          className="w-full bg-zinc-900/50 border border-zinc-800/50 rounded-lg px-3 py-1 text-[10px] text-zinc-500"
                          value={m.notes}
                          onChange={(e) => {
                            const newM = [...planDraft.plannedMeals!];
                            newM[i].notes = e.target.value;
                            setPlanDraft({...planDraft, plannedMeals: newM});
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-4">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Daily Macro Targets</label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-zinc-600 uppercase ml-1">Calories</span>
                      <input 
                        type="number"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-3 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                        value={planDraft.targetMacros?.calories}
                        onChange={(e) => setPlanDraft({...planDraft, targetMacros: {...planDraft.targetMacros!, calories: Number(e.target.value)}})}
                      />
                    </div>
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-zinc-600 uppercase ml-1">Protein (g)</span>
                      <input 
                        type="number"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-3 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                        value={planDraft.targetMacros?.protein}
                        onChange={(e) => setPlanDraft({...planDraft, targetMacros: {...planDraft.targetMacros!, protein: Number(e.target.value)}})}
                      />
                    </div>
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-zinc-600 uppercase ml-1">Carbs (g)</span>
                      <input 
                        type="number"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-3 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                        value={planDraft.targetMacros?.carbs}
                        onChange={(e) => setPlanDraft({...planDraft, targetMacros: {...planDraft.targetMacros!, carbs: Number(e.target.value)}})}
                      />
                    </div>
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-zinc-600 uppercase ml-1">Fats (g)</span>
                      <input 
                        type="number"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-3 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                        value={planDraft.targetMacros?.fats}
                        onChange={(e) => setPlanDraft({...planDraft, targetMacros: {...planDraft.targetMacros!, fats: Number(e.target.value)}})}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Core Guidelines</label>
                  <div className="space-y-2">
                    {planDraft.guidelines?.map((g, i) => (
                      <div key={i} className="flex gap-2">
                        <input 
                          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-xs outline-none focus:ring-1 focus:ring-orange-500"
                          value={g}
                          onChange={(e) => {
                            const newG = [...planDraft.guidelines!];
                            newG[i] = e.target.value;
                            setPlanDraft({...planDraft, guidelines: newG});
                          }}
                        />
                        <button 
                          onClick={() => {
                            const newG = planDraft.guidelines!.filter((_, idx) => idx !== i);
                            setPlanDraft({...planDraft, guidelines: newG});
                          }}
                          className="p-2 text-zinc-600 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button 
                      onClick={() => setPlanDraft({...planDraft, guidelines: [...(planDraft.guidelines || []), '']})}
                      className="w-full py-2 border border-dashed border-zinc-800 rounded-xl text-[10px] font-bold text-zinc-500 hover:text-white transition-all flex items-center justify-center gap-2"
                    >
                      <Plus className="w-3 h-3" />
                      Add Guideline
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4 pt-8 border-t border-zinc-800">
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 py-4 border border-zinc-800 rounded-2xl font-bold text-zinc-400 hover:bg-zinc-800 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePlan}
                disabled={saving || !planDraft.name}
                className="flex-[2] bg-orange-500 text-white font-bold py-4 rounded-2xl hover:bg-orange-600 disabled:opacity-50 transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Save Nutrition Plan
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="display"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {activePlan ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-orange-500/10 rounded-2xl text-orange-500">
                          <Utensils className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="text-xl font-bold text-white">{activePlan.name}</h4>
                          <p className="text-sm text-zinc-500">{activePlan.description}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-center">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Calories</p>
                        <p className="text-2xl font-black text-white">{activePlan.targetMacros.calories}</p>
                      </div>
                      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-center">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Protein</p>
                        <p className="text-2xl font-black text-blue-500">{activePlan.targetMacros.protein}g</p>
                      </div>
                      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-center">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Carbs</p>
                        <p className="text-2xl font-black text-green-500">{activePlan.targetMacros.carbs}g</p>
                      </div>
                      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-center">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Fats</p>
                        <p className="text-2xl font-black text-orange-500">{activePlan.targetMacros.fats}g</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h5 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Client Guidelines</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {activePlan.guidelines.map((g, i) => (
                          <div key={i} className="flex items-center gap-3 bg-zinc-950/50 p-3 rounded-xl border border-zinc-800">
                            <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                            <span className="text-sm text-zinc-300">{g}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-orange-500" />
                      <h4 className="font-bold text-sm uppercase tracking-widest text-zinc-500">Coach Insights</h4>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed italic">
                      "This plan is designed to optimize their hormonal profile while maintaining a steady caloric deficit. Ensure they are tracking fiber intake alongside these macros."
                    </p>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
                    <h4 className="font-bold text-sm uppercase tracking-widest text-zinc-500">Recently Logged</h4>
                    <div className="text-xs text-zinc-500">
                      Feature coming soon: Visual sync between this plan and their actual logged meals.
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-[32px] p-24 text-center space-y-6">
                <div className="p-6 bg-zinc-900 rounded-full border border-zinc-800 inline-block">
                  <Utensils className="w-12 h-12 text-zinc-800" />
                </div>
                <div className="max-w-md mx-auto space-y-2">
                  <h4 className="text-xl font-bold">No High-Performance Plan Set</h4>
                  <p className="text-sm text-zinc-500">
                    Assign a structured nutrition strategy to help {client.displayName} reach their goals faster.
                  </p>
                </div>
                <button 
                  onClick={() => setIsEditing(true)}
                  className="px-8 py-4 bg-orange-500 text-white rounded-2xl font-bold text-sm hover:bg-orange-600 transition-all"
                >
                  Start Nutrition Planning
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WorkoutManager({ client, initialDate, initialWorkout, onSave, showToast, confirmAction }: { client: UserProfile, initialDate?: Date, initialWorkout?: Workout, onSave?: () => void, showToast: (m: string, t?: 'success' | 'error') => void, confirmAction: (t: string, m: string, c: () => void) => void }) {
  const [week, setWeek] = useState(initialWorkout?.weekNumber || 1);
  const [day, setDay] = useState(initialWorkout?.dayNumber || 1);
  const [scheduledDate, setScheduledDate] = useState<string>(
    initialWorkout?.scheduledDate || (initialDate ? format(initialDate, 'yyyy-MM-dd') : '')
  );
  const [exercises, setExercises] = useState<Exercise[]>(
    initialWorkout?.exercises || [{ name: '', youtubeLink: '', sets: 3, reps: '12', weight: '', rest: '60s', coachNote: '' }]
  );
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateCategory, setTemplateCategory] = useState('General');
  const [templateDescription, setTemplateDescription] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [searchingIndex, setSearchingIndex] = useState<number | null>(null);
  const [videoResults, setVideoResults] = useState<{title: string, url: string}[]>([]);

  const categories = ['All', 'General', 'Strength', 'Hypertrophy', 'Mobility', 'Flexibility', 'HIIT', 'Resistance Band'];

  useEffect(() => {
    const q = query(collection(db, 'templates'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as WorkoutTemplate));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'templates');
    });
    return () => unsubscribe();
  }, []);

  const addExercise = () => {
    const newIdx = exercises.length;
    setExercises([...exercises, { name: '', youtubeLink: '', sets: 3, reps: '12', weight: '', rest: '60s', coachNote: '' }]);
    setExpandedIndex(newIdx);
  };

  const removeExercise = (index: number) => {
    setExercises(exercises.filter((_, i) => i !== index));
    if (expandedIndex === index) setExpandedIndex(null);
  };

  const updateExercise = (index: number, field: keyof Exercise, value: any) => {
    const newExercises = [...exercises];
    newExercises[index] = { ...newExercises[index], [field]: value };
    setExercises(newExercises);
  };

  const handleSearchVideos = async (index: number, name: string) => {
    if (!name.trim()) return;
    setSearchingIndex(index);
    setVideoResults([]);
    try {
      const results = await searchExerciseVideos(name);
      setVideoResults(results);
    } catch (error) {
      console.error('Error searching videos:', error);
    } finally {
      setSearchingIndex(null);
    }
  };

  const moveExercise = (index: number, direction: 'up' | 'down') => {
    const newExercises = [...exercises];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newExercises.length) return;
    
    [newExercises[index], newExercises[targetIndex]] = [newExercises[targetIndex], newExercises[index]];
    setExercises(newExercises);
    if (expandedIndex === index) setExpandedIndex(targetIndex);
    else if (expandedIndex === targetIndex) setExpandedIndex(index);
  };

  const handleSaveWorkout = async () => {
    setSaving(true);
    try {
      const workoutData = {
        clientId: client.uid,
        weekNumber: week,
        dayNumber: day,
        exercises: exercises.filter(e => e.name.trim() !== ''),
        scheduledDate: scheduledDate || null,
        updatedAt: serverTimestamp()
      };

      if (initialWorkout?.id) {
        await updateDoc(doc(db, 'workouts', initialWorkout.id), workoutData)
          .catch(err => handleFirestoreError(err, OperationType.UPDATE, 'workouts'));
      } else {
        await addDoc(collection(db, 'workouts'), {
          ...workoutData,
          createdAt: serverTimestamp()
        }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'workouts'));

        // Automated Milestone: New activity assigned
        const q = query(collection(db, 'users'), where('role', '==', 'admin'), limit(1));
        const snap = await getDocs(q);
        const adminUid = snap.empty ? 'admin' : snap.docs[0].id;

        await addDoc(collection(db, 'messages'), {
          senderId: adminUid,
          receiverId: client.uid,
          text: `Hey! I've just assigned a new activity for you: Week ${week}, Day ${day}. Let's get to work! 🚀`,
          isRead: false,
          type: 'motivation',
          createdAt: serverTimestamp()
        });
      }
      onSave?.();
    } catch (error) {
      console.error('Error saving workout:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWorkout = async () => {
    if (!initialWorkout?.id) return;
    
    confirmAction(
      'Delete Workout',
      'Are you sure you want to delete this scheduled workout?',
      async () => {
        setSaving(true);
        try {
          await deleteDoc(doc(db, 'workouts', initialWorkout.id))
            .catch(err => handleFirestoreError(err, OperationType.DELETE, `workouts/${initialWorkout.id}`));
          onSave?.();
        } catch (error) {
          console.error('Error deleting workout:', error);
          showToast('Failed to delete workout', 'error');
        } finally {
          setSaving(false);
        }
      }
    );
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'templates'), {
        name: templateName,
        category: templateCategory,
        description: templateDescription,
        exercises: exercises.filter(e => e.name.trim() !== ''),
        createdAt: serverTimestamp()
      }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'templates'));
      setTemplateName('');
      setTemplateDescription('');
      setShowTemplateModal(false);
      showToast('Template saved!');
    } catch (error) {
      console.error('Error saving template:', error);
    } finally {
      setSaving(false);
    }
  };

  const importTemplate = (template: WorkoutTemplate) => {
    setExercises(template.exercises);
    setExpandedIndex(0);
  };

  const duplicateTemplate = async (template: WorkoutTemplate) => {
    setSaving(true);
    try {
      await addDoc(collection(db, 'templates'), {
        name: `${template.name} (Copy)`,
        category: template.category || 'General',
        description: template.description || '',
        exercises: template.exercises,
        createdAt: serverTimestamp()
      }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'templates'));
      showToast('Template duplicated!');
    } catch (error) {
      console.error('Error duplicating template:', error);
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    confirmAction(
      'Delete Template',
      'Are you sure you want to delete this template?',
      async () => {
        await deleteDoc(doc(db, 'templates', id)).catch(err => handleFirestoreError(err, OperationType.DELETE, `templates/${id}`));
        showToast('Template deleted');
      }
    );
  };

  const seedSamples = async () => {
    const samples = [
      {
        name: 'Leg Day - Hypertrophy',
        category: 'Hypertrophy',
        description: 'High volume leg session focused on quad and glute growth.',
        exercises: [
          { name: 'Barbell Back Squat', youtubeLink: 'https://www.youtube.com/watch?v=ultWZbUMPL8', sets: 4, reps: '8-10', weight: '70%', rest: '120s', coachNote: 'Focus on depth and control.' },
          { name: 'Leg Press', youtubeLink: 'https://www.youtube.com/watch?v=IZxyjW7MPJQ', sets: 3, reps: '12-15', weight: 'Moderate', rest: '90s', coachNote: 'Keep feet shoulder width apart.' },
          { name: 'Leg Extensions', youtubeLink: 'https://www.youtube.com/watch?v=YyvSfVLYd8Y', sets: 3, reps: '15', weight: 'Light', rest: '60s', coachNote: 'Squeeze at the top.' },
          { name: 'Seated Leg Curl', youtubeLink: 'https://www.youtube.com/watch?v=F488k67BTNo', sets: 3, reps: '12-15', weight: 'Moderate', rest: '60s', coachNote: 'Slow eccentric phase.' }
        ]
      },
      {
        name: 'Push Day - Strength',
        category: 'Strength',
        description: 'Heavy compound movements for chest, shoulders, and triceps.',
        exercises: [
          { name: 'Bench Press', youtubeLink: 'https://www.youtube.com/watch?v=rT7DgCr-3ps', sets: 5, reps: '5', weight: '80-85%', rest: '180s', coachNote: 'Explosive on the way up.' },
          { name: 'Overhead Press', youtubeLink: 'https://www.youtube.com/watch?v=2yjwxtZ4f_4', sets: 3, reps: '8', weight: '70%', rest: '120s', coachNote: 'Core tight, no leg drive.' },
          { name: 'Dumbbell Lateral Raise', youtubeLink: 'https://www.youtube.com/watch?v=3VcKaXpzqRo', sets: 3, reps: '12-15', weight: 'Light', rest: '60s', coachNote: 'Lead with elbows.' },
          { name: 'Tricep Pushdown', youtubeLink: 'https://www.youtube.com/watch?v=2-LAMcpzHLU', sets: 3, reps: '12', weight: 'Moderate', rest: '60s', coachNote: 'Full extension.' }
        ]
      },
      {
        name: 'Pull Day - Back & Bi',
        category: 'Hypertrophy',
        description: 'Focus on back width and thickness with direct bicep work.',
        exercises: [
          { name: 'Lat Pulldown', youtubeLink: 'https://www.youtube.com/watch?v=CAwf7n6Luuc', sets: 4, reps: '10-12', weight: 'Moderate', rest: '90s', coachNote: 'Pull to upper chest.' },
          { name: 'Seated Cable Row', youtubeLink: 'https://www.youtube.com/watch?v=GZbfZ033f74', sets: 3, reps: '12', weight: 'Moderate', rest: '90s', coachNote: 'Squeeze shoulder blades.' },
          { name: 'Face Pulls', youtubeLink: 'https://www.youtube.com/watch?v=rep-qVOkqgk', sets: 3, reps: '15', weight: 'Light', rest: '60s', coachNote: 'Pull towards forehead.' },
          { name: 'Barbell Bicep Curl', youtubeLink: 'https://www.youtube.com/watch?v=kwG2ipFRgfo', sets: 3, reps: '10-12', weight: 'Moderate', rest: '60s', coachNote: 'No swinging.' }
        ]
      },
      {
        name: 'Full Body HIIT',
        category: 'HIIT',
        description: 'High intensity circuit for fat loss and conditioning.',
        exercises: [
          { name: 'Burpees', youtubeLink: 'https://www.youtube.com/watch?v=dZfeV_pLpQA', sets: 4, reps: '45s', weight: 'Bodyweight', rest: '15s', coachNote: 'Max effort.' },
          { name: 'Mountain Climbers', youtubeLink: 'https://www.youtube.com/watch?v=zT-9L37Mz1U', sets: 4, reps: '45s', weight: 'Bodyweight', rest: '15s', coachNote: 'Keep hips low.' },
          { name: 'Kettlebell Swings', youtubeLink: 'https://www.youtube.com/watch?v=sSESeQAtRdw', sets: 4, reps: '45s', weight: '16-24kg', rest: '15s', coachNote: 'Snap the hips.' },
          { name: 'Plank', youtubeLink: 'https://www.youtube.com/watch?v=pSHjTRCQxIw', sets: 4, reps: '45s', weight: 'Bodyweight', rest: '15s', coachNote: 'Core engaged.' }
        ]
      },
      {
        name: 'Shoulder Mobility',
        category: 'Mobility',
        description: 'Routine to improve shoulder health and range of motion.',
        exercises: [
          { name: 'Shoulder Dislocations (PVC Pipe)', youtubeLink: 'https://www.youtube.com/watch?v=v_Yh62S8O3k', sets: 2, reps: '15', weight: 'N/A', rest: '30s', coachNote: 'Keep arms straight.' },
          { name: 'Scapular Pull-ups', youtubeLink: 'https://www.youtube.com/watch?v=p_9S8F2_X_s', sets: 3, reps: '10', weight: 'Bodyweight', rest: '60s', coachNote: 'Only move the shoulder blades.' },
          { name: 'External Rotations', youtubeLink: 'https://www.youtube.com/watch?v=P6MMD5L7uLw', sets: 3, reps: '12', weight: 'Light Band', rest: '45s', coachNote: 'Keep elbow tucked.' }
        ]
      },
      {
        name: 'Core Crusher',
        category: 'Strength',
        description: 'Direct abdominal and core stability work.',
        exercises: [
          { name: 'Hanging Leg Raises', youtubeLink: 'https://www.youtube.com/watch?v=hdng3nmjpW8', sets: 3, reps: '10-12', weight: 'Bodyweight', rest: '60s', coachNote: 'No swinging.' },
          { name: 'Russian Twists', youtubeLink: 'https://www.youtube.com/watch?v=wkD8rjkodUI', sets: 3, reps: '20 each side', weight: '5-10kg', rest: '45s', coachNote: 'Touch the floor.' },
          { name: 'Ab Wheel Rollouts', youtubeLink: 'https://www.youtube.com/watch?v=rqiQtEW_qI0', sets: 3, reps: '10', weight: 'Bodyweight', rest: '60s', coachNote: 'Don\'t arch back.' }
        ]
      }
    ];

    setSaving(true);
    try {
      for (const sample of samples) {
        await addDoc(collection(db, 'templates'), {
          ...sample,
          createdAt: serverTimestamp()
        });
      }
      showToast('Sample templates added!');
    } catch (error) {
      console.error('Error seeding templates:', error);
    } finally {
      setSaving(false);
    }
  };

  const filteredTemplates = filterCategory === 'All' 
    ? templates 
    : templates.filter(t => t.category === filterCategory);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="p-6 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h3 className="font-bold text-xl flex items-center gap-2">
            <Calendar className="w-5 h-5 text-orange-500" />
            Workout Builder
          </h3>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
              <div className="flex items-center gap-1.5 px-2">
                <span className="text-[10px] text-zinc-500 uppercase font-bold">Wk</span>
                <input 
                  type="number" 
                  value={week} 
                  onChange={(e) => setWeek(parseInt(e.target.value))}
                  className="w-10 bg-transparent text-sm font-bold text-center outline-none"
                />
              </div>
              <div className="w-[1px] h-4 bg-zinc-800" />
              <div className="flex items-center gap-1.5 px-2">
                <span className="text-[10px] text-zinc-500 uppercase font-bold">Day</span>
                <input 
                  type="number" 
                  value={day} 
                  onChange={(e) => setDay(parseInt(e.target.value))}
                  className="w-10 bg-transparent text-sm font-bold text-center outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
              <div className="flex items-center gap-1.5 px-2">
                <span className="text-[10px] text-zinc-500 uppercase font-bold">Date</span>
                <input 
                  type="date" 
                  value={scheduledDate} 
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="bg-transparent text-xs font-bold outline-none text-zinc-300"
                />
              </div>
            </div>
            
            <button 
              onClick={() => setShowTemplateModal(true)}
              className="p-2 bg-zinc-950 border border-zinc-800 rounded-lg hover:text-orange-500 transition-colors"
              title="Templates"
            >
              <Layout className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {exercises.map((ex, idx) => (
            <motion.div 
              layout
              key={idx} 
              className={cn(
                "bg-zinc-950 rounded-xl border transition-all overflow-hidden",
                expandedIndex === idx ? "border-orange-500/50" : "border-zinc-800"
              )}
            >
              <div
                onClick={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
                className="w-full flex items-center justify-between p-4 hover:bg-zinc-900/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="w-6 h-6 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500">
                    {idx + 1}
                  </div>
                  <span className={cn(
                    "font-bold transition-colors",
                    ex.name ? "text-white" : "text-zinc-600"
                  )}>
                    {ex.name || "Unnamed Exercise"}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  {expandedIndex !== idx && ex.name && (
                    <div className="hidden sm:flex items-center gap-3 text-[10px] font-bold text-zinc-500 uppercase">
                      <span>{ex.sets} Sets</span>
                      <span>•</span>
                      <span>{ex.reps} Reps</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 border-r border-zinc-800 pr-4 mr-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); moveExercise(idx, 'up'); }}
                      disabled={idx === 0}
                      className="p-1 hover:text-orange-500 disabled:opacity-20 transition-colors"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveExercise(idx, 'down'); }}
                      disabled={idx === exercises.length - 1}
                      className="p-1 hover:text-orange-500 disabled:opacity-20 transition-colors"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                  {expandedIndex === idx ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>

              <AnimatePresence>
                {expandedIndex === idx && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-zinc-800 p-4 space-y-4"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase font-bold">Exercise Name</label>
                        <input
                          value={ex.name}
                          onChange={(e) => updateExercise(idx, 'name', e.target.value)}
                          placeholder="e.g. Barbell Squat"
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-orange-500 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase font-bold">YouTube Link</label>
                        <div className="flex gap-2">
                          <input
                            value={ex.youtubeLink}
                            onChange={(e) => updateExercise(idx, 'youtubeLink', e.target.value)}
                            placeholder="https://youtube.com/..."
                            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-orange-500 outline-none"
                          />
                          <button
                            onClick={() => handleSearchVideos(idx, ex.name)}
                            disabled={!ex.name || searchingIndex === idx}
                            className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg hover:text-orange-500 transition-colors disabled:opacity-50"
                            title="Search for demo video"
                          >
                            {searchingIndex === idx ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                          </button>
                          {ex.youtubeLink && getYouTubeId(ex.youtubeLink) && (
                            <a 
                              href={ex.youtubeLink} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg hover:text-orange-500 transition-colors"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>

                        {/* Video Search Results */}
                        <AnimatePresence>
                          {videoResults.length > 0 && expandedIndex === idx && (
                            <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="mt-2 p-3 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 text-orange-500" />
                                  Suggested Demo Videos
                                </span>
                                <button 
                                  onClick={() => setVideoResults([])}
                                  className="text-[10px] text-zinc-500 hover:text-white uppercase font-bold"
                                >
                                  Clear
                                </button>
                              </div>
                              <div className="grid grid-cols-1 gap-2">
                                {videoResults.map((video, vIdx) => (
                                  <button
                                    key={vIdx}
                                    onClick={() => {
                                      updateExercise(idx, 'youtubeLink', video.url);
                                      setVideoResults([]);
                                    }}
                                    className="flex items-center justify-between p-2 bg-zinc-950 border border-zinc-800 rounded-lg hover:border-orange-500/50 group transition-all text-left"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded bg-zinc-900 flex items-center justify-center">
                                        <Play className="w-3 h-3 text-zinc-500 group-hover:text-orange-500" />
                                      </div>
                                      <span className="text-xs text-zinc-400 group-hover:text-white truncate max-w-[200px]">
                                        {video.title}
                                      </span>
                                    </div>
                                    <Plus className="w-3 h-3 text-zinc-600 group-hover:text-orange-500" />
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {ex.youtubeLink && getYouTubeId(ex.youtubeLink) && (
                          <div className="mt-2 relative aspect-video rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 group/vid">
                            <img 
                              src={`https://img.youtube.com/vi/${getYouTubeId(ex.youtubeLink)}/mqdefault.jpg`}
                              alt="Video Preview"
                              className="w-full h-full object-cover opacity-60 group-hover/vid:opacity-80 transition-opacity"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/20">
                                <Play className="w-5 h-5 text-white fill-current" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase font-bold">Sets</label>
                        <input
                          type="number"
                          value={ex.sets}
                          onChange={(e) => updateExercise(idx, 'sets', parseInt(e.target.value))}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-orange-500 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase font-bold">Reps</label>
                        <input
                          value={ex.reps}
                          onChange={(e) => updateExercise(idx, 'reps', e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-orange-500 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase font-bold">Weight</label>
                        <input
                          value={ex.weight}
                          onChange={(e) => updateExercise(idx, 'weight', e.target.value)}
                          placeholder="e.g. 60kg"
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-orange-500 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase font-bold">Rest</label>
                        <input
                          value={ex.rest}
                          onChange={(e) => updateExercise(idx, 'rest', e.target.value)}
                          placeholder="60s"
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-orange-500 outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500 uppercase font-bold">Coach Note</label>
                      <textarea
                        value={ex.coachNote}
                        onChange={(e) => updateExercise(idx, 'coachNote', e.target.value)}
                        placeholder="Focus on depth..."
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-orange-500 outline-none min-h-[60px]"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button 
                        onClick={() => removeExercise(idx)}
                        className="flex items-center gap-2 text-xs font-bold text-zinc-500 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove Exercise
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        <div className="mt-6 space-y-4">
          <button
            onClick={addExercise}
            className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-zinc-700 rounded-xl text-zinc-400 hover:text-white hover:border-zinc-500 transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Exercise
          </button>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setShowTemplateModal(true)}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-all"
            >
              <Save className="w-4 h-4" />
              Save as Template
            </button>
            <button
              onClick={handleSaveWorkout}
              disabled={saving}
              className="flex-[2] bg-orange-500 text-white font-bold py-3 rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              {saving ? 'Saving...' : initialWorkout ? 'Update Workout' : 'Assign to Client'}
            </button>
            {initialWorkout && (
              <button
                onClick={handleDeleteWorkout}
                disabled={saving}
                className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-500 hover:text-red-500 transition-all"
                title="Delete Workout"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Template Modal */}
      <AnimatePresence>
        {showTemplateModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTemplateModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="font-bold text-xl">Workout Templates</h3>
                <button onClick={() => setShowTemplateModal(false)} className="text-zinc-500 hover:text-white">
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-4">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Save Current as New Template</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500 uppercase font-bold">Template Name</label>
                      <input
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="e.g. Leg Day - Hypertrophy"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500 uppercase font-bold">Category</label>
                      <select
                        value={templateCategory}
                        onChange={(e) => setTemplateCategory(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                      >
                        {categories.filter(c => c !== 'All').map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-500 uppercase font-bold">Description</label>
                    <textarea
                      value={templateDescription}
                      onChange={(e) => setTemplateDescription(e.target.value)}
                      placeholder="What is this workout for?"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-orange-500 min-h-[60px]"
                    />
                  </div>
                  <button
                    onClick={handleSaveTemplate}
                    disabled={!templateName.trim() || saving}
                    className="w-full bg-orange-500 text-white font-bold py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-all"
                  >
                    Save Template
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-500 uppercase">Your Templates</label>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-500 uppercase font-bold">Filter:</span>
                      <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs outline-none"
                      >
                        {categories.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {filteredTemplates.map((t) => (
                      <div key={t.id} className="flex flex-col p-4 bg-zinc-950 border border-zinc-800 rounded-xl group hover:border-zinc-700 transition-all">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-base">{t.name}</span>
                              <span className="px-2 py-0.5 bg-orange-500/10 text-orange-500 text-[10px] font-bold rounded-full uppercase">
                                {t.category || 'General'}
                              </span>
                            </div>
                            {t.description && (
                              <p className="text-xs text-zinc-500 mt-1">{t.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                importTemplate(t);
                                setShowTemplateModal(false);
                              }}
                              className="p-2 bg-zinc-900 rounded-lg text-zinc-400 hover:text-orange-500 transition-colors"
                              title="Import"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => duplicateTemplate(t)}
                              className="p-2 bg-zinc-900 rounded-lg text-zinc-400 hover:text-blue-500 transition-colors"
                              title="Duplicate"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteTemplate(t.id!)}
                              className="p-2 bg-zinc-900 rounded-lg text-zinc-400 hover:text-red-500 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="text-[10px] text-zinc-600 uppercase font-bold">
                          {t.exercises.length} Exercises
                        </div>
                      </div>
                    ))}
                    {filteredTemplates.length === 0 && (
                      <div className="text-center py-12 bg-zinc-950/50 border border-dashed border-zinc-800 rounded-xl space-y-4">
                        <p className="text-zinc-500 text-sm">No templates found in this category.</p>
                        {templates.length === 0 && (
                          <button
                            onClick={seedSamples}
                            className="text-orange-500 text-xs font-bold hover:underline"
                          >
                            Seed Sample Templates
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ClientDashboardView({ client }: { client: UserProfile }) {
  const [metrics, setMetrics] = useState<BodyMetrics[]>([]);
  const [meals, setMeals] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);

  const consistencyData = useMemo(() => {
    const data = [];
    for (let i = 29; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dateStr = format(date, 'yyyy-MM-dd');
      
      const wasScheduled = workouts.find(w => w.scheduledDate === dateStr);
      const wasCompleted = feedback.find(f => {
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
  }, [workouts, feedback]);

  useEffect(() => {
    // Fetch metrics
    const qMetrics = query(
      collection(db, 'metrics'),
      where('clientId', '==', client.uid),
      orderBy('date', 'desc'),
      limit(30)
    );

    const qMeals = query(
      collection(db, 'meals'),
      where('clientId', '==', client.uid),
      orderBy('date', 'desc'),
      limit(50)
    );

    const qWorkouts = query(
      collection(db, 'workouts'),
      where('clientId', '==', client.uid),
      orderBy('scheduledDate', 'desc'),
      limit(100)
    );

    const qFeedback = query(
      collection(db, 'feedback'),
      where('clientId', '==', client.uid),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    const unsubscribeMetrics = onSnapshot(qMetrics, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as BodyMetrics);
      setMetrics(data.reverse());
    });

    const unsubscribeMeals = onSnapshot(qMeals, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMeals(data);
    });

    const unsubscribeWorkouts = onSnapshot(qWorkouts, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Workout);
      setWorkouts(data);
    });

    const unsubscribeFeedback = onSnapshot(qFeedback, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Feedback);
      setFeedback(data);
      setLoading(false);
    });

    return () => {
      unsubscribeMetrics();
      unsubscribeMeals();
      unsubscribeWorkouts();
      unsubscribeFeedback();
    };
  }, [client.uid]);

  const latestMetrics = metrics[metrics.length - 1];

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <Scale className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase">Weight</span>
          </div>
          <div className="text-2xl font-bold">{latestMetrics?.weight || client.weight || '--'} <span className="text-sm font-normal text-zinc-500">kg</span></div>
        </div>
        <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <Flame className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase">Calories</span>
          </div>
          <div className="text-2xl font-bold">{latestMetrics?.calories || 0} <span className="text-sm font-normal text-zinc-500">kcal</span></div>
        </div>
        <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <Droplets className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase">Water</span>
          </div>
          <div className="text-2xl font-bold">{latestMetrics?.waterIntake || 0} <span className="text-sm font-normal text-zinc-500">ml</span></div>
        </div>
        <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <Footprints className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase">Steps</span>
          </div>
          <div className="text-2xl font-bold">{latestMetrics?.stepCount || 0}</div>
        </div>
      </div>

      {/* Nutrition Breakdown */}
      <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
        <h4 className="font-bold mb-4 flex items-center gap-2">
          <Flame className="w-4 h-4 text-orange-500" />
          Daily Nutrition Breakdown
        </h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="text-[10px] text-zinc-500 uppercase font-bold">Protein</div>
            <div className="text-lg font-bold text-blue-400">{latestMetrics?.protein || 0}g</div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-400" style={{ width: `${Math.min((latestMetrics?.protein || 0) / 2, 100)}%` }} />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] text-zinc-500 uppercase font-bold">Carbs</div>
            <div className="text-lg font-bold text-green-400">{latestMetrics?.carbs || 0}g</div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-green-400" style={{ width: `${Math.min((latestMetrics?.carbs || 0) / 3, 100)}%` }} />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] text-zinc-500 uppercase font-bold">Fats</div>
            <div className="text-lg font-bold text-yellow-400">{latestMetrics?.fats || 0}g</div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-yellow-400" style={{ width: `${Math.min((latestMetrics?.fats || 0) / 1, 100)}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Weight Trend Chart */}
      <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
        <h4 className="font-bold mb-6 flex items-center gap-2">
          <Activity className="w-4 h-4 text-orange-500" />
          Weight Progress (Last 30 Days)
        </h4>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics}>
              <defs>
                <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis 
                dataKey="date" 
                stroke="#71717a" 
                fontSize={10} 
                tickFormatter={(str) => {
                  try {
                    return format(parseISO(str), 'MMM d');
                  } catch (e) {
                    return str;
                  }
                }}
              />
              <YAxis stroke="#71717a" fontSize={10} domain={['dataMin - 2', 'dataMax + 2']} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                itemStyle={{ color: '#f97316' }}
              />
              <Area 
                type="monotone" 
                dataKey="weight" 
                stroke="#f97316" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorWeight)" 
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Workout Consistency Chart */}
      <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 space-y-6">
        <h4 className="font-bold flex items-center gap-2">
          <Calendar className="w-4 h-4 text-orange-500" />
          Workout Consistency (Last 30 Days)
        </h4>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={consistencyData}>
              <XAxis dataKey="displayDate" hide />
              <YAxis hide domain={[0, 1]} />
              <Tooltip 
                cursor={{ fill: 'transparent' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-zinc-950 border border-zinc-800 p-2 rounded-lg text-[10px] font-bold shadow-xl">
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

      {/* Meal Logs Section for Coach */}
      <div className="space-y-4">
        <h4 className="font-bold flex items-center gap-2">
          <Utensils className="w-4 h-4 text-orange-500" />
          Client Meal History
        </h4>
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
                    <div className="mt-3 space-y-1">
                      {meal.items?.map((item: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-[9px] text-zinc-500 bg-zinc-950/50 px-2 py-1 rounded border border-zinc-800/30">
                          <span className="font-medium truncate flex-1">{item.name}</span>
                          <span className="font-bold text-zinc-400 ml-2">{item.calories} kcal</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-12 text-center bg-zinc-900/50 rounded-3xl border border-zinc-800 p-8">
              <Utensils className="w-8 h-8 text-zinc-800 mx-auto mb-4" />
              <p className="text-zinc-500 text-sm">No meals logged by this client yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

