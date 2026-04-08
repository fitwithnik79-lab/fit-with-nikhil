import { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDocs, orderBy, deleteDoc, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, Workout, Exercise, Feedback, WorkoutTemplate, BodyMetrics } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { searchExerciseVideos } from '../lib/gemini';
import { Plus, Users, Calendar, CheckCircle, ExternalLink, ChevronRight, Search, Activity, Clock, MessageSquare, Trash2, Edit2, ChevronDown, ChevronUp, Save, Download, Layout, Copy, ChevronLeft, Play, Sparkles, Loader2, Droplets, Footprints, Flame, Scale } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import Chat from './Chat';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
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
  parseISO
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
  const [activeTab, setActiveTab] = useState<'clients' | 'tracker' | 'calendar'>('clients');
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

  const [clientViewTab, setClientViewTab] = useState<'program' | 'dashboard' | 'chat'>('program');

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
        </div>
      </div>

      <AnimatePresence mode="wait">
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
                        setEditingWorkout(w);
                        setSelectedClientForSchedule(client || null);
                        setSelectedDate(parseISO(w.scheduledDate!));
                        setShowScheduleModal(true);
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
              <button
                onClick={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
                className="w-full flex items-center justify-between p-4 hover:bg-zinc-900/50 transition-colors"
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
                  {expandedIndex === idx ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'metrics'),
      where('clientId', '==', client.uid),
      orderBy('date', 'desc'),
      limit(30)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as BodyMetrics);
      setMetrics(data.reverse());
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'metrics');
    });

    return () => unsubscribe();
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
    </div>
  );
}

