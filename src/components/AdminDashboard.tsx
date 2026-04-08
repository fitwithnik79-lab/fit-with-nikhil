import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, Workout, Exercise, Feedback } from '../types';
import { Plus, Users, Calendar, CheckCircle, ExternalLink, ChevronRight, Search, Activity, Clock, MessageSquare, Trash2, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface AdminDashboardProps {
  user: User;
  profile: UserProfile;
}

export default function AdminDashboard({ user, profile }: AdminDashboardProps) {
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [selectedClient, setSelectedClient] = useState<UserProfile | null>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'clients' | 'tracker'>('clients');

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'client'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const clientData = snapshot.docs.map(doc => doc.data() as UserProfile);
      setClients(clientData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const feedbackData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Feedback);
      setFeedbacks(feedbackData);
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
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'clients' ? (
          <motion.div
            key="clients"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
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
              
              <div className="space-y-2">
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

            <div className="md:col-span-2 space-y-6">
              {selectedClient ? (
                <>
                  <ClientDetailsEditor client={selectedClient} />
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <WorkoutManager client={selectedClient} />
                    <ClientHistory client={selectedClient} />
                  </div>
                </>
              ) : (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-zinc-900/50 border border-dashed border-zinc-800 rounded-2xl text-zinc-500 p-8 text-center">
                  <Users className="w-12 h-12 mb-4 opacity-20" />
                  <p>Select a client to manage their program, workouts, and view progress.</p>
                </div>
              )}
            </div>
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
    </div>
  );
}

function ClientDetailsEditor({ client }: { client: UserProfile }) {
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
      await updateDoc(doc(db, 'users', client.uid), {
        programGoals: goals,
        programDetails: details
      });
      alert('Client details updated!');
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

function WorkoutManager({ client }: { client: UserProfile }) {
  const [week, setWeek] = useState(1);
  const [day, setDay] = useState(1);
  const [exercises, setExercises] = useState<Exercise[]>([
    { name: '', youtubeLink: '', sets: 3, reps: '12', weight: '', rest: '60s', coachNote: '' }
  ]);
  const [saving, setSaving] = useState(false);

  const addExercise = () => {
    setExercises([...exercises, { name: '', youtubeLink: '', sets: 3, reps: '12', weight: '', rest: '60s', coachNote: '' }]);
  };

  const removeExercise = (index: number) => {
    setExercises(exercises.filter((_, i) => i !== index));
  };

  const updateExercise = (index: number, field: keyof Exercise, value: any) => {
    const newExercises = [...exercises];
    newExercises[index] = { ...newExercises[index], [field]: value };
    setExercises(newExercises);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await addDoc(collection(db, 'workouts'), {
        clientId: client.uid,
        weekNumber: week,
        dayNumber: day,
        exercises: exercises.filter(e => e.name.trim() !== ''),
        createdAt: serverTimestamp()
      });
      alert('Workout assigned successfully!');
    } catch (error) {
      console.error('Error saving workout:', error);
      alert('Failed to assign workout.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="p-6 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-xl flex items-center gap-2">
            <Calendar className="w-5 h-5 text-orange-500" />
            Assign Routine
          </h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 uppercase font-bold">Week</span>
              <input 
                type="number" 
                value={week} 
                onChange={(e) => setWeek(parseInt(e.target.value))}
                className="w-16 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-center focus:ring-1 focus:ring-orange-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 uppercase font-bold">Day</span>
              <input 
                type="number" 
                value={day} 
                onChange={(e) => setDay(parseInt(e.target.value))}
                className="w-16 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-center focus:ring-1 focus:ring-orange-500 outline-none"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {exercises.map((ex, idx) => (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              key={idx} 
              className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 space-y-4"
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
                  <input
                    value={ex.youtubeLink}
                    onChange={(e) => updateExercise(idx, 'youtubeLink', e.target.value)}
                    placeholder="https://youtube.com/..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-orange-500 outline-none"
                  />
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

              <div className="flex items-end gap-4">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] text-zinc-500 uppercase font-bold">Coach Note</label>
                  <input
                    value={ex.coachNote}
                    onChange={(e) => updateExercise(idx, 'coachNote', e.target.value)}
                    placeholder="Focus on depth..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-orange-500 outline-none"
                  />
                </div>
                <button 
                  onClick={() => removeExercise(idx)}
                  className="p-2 text-zinc-500 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-4">
          <button
            onClick={addExercise}
            className="flex-1 flex items-center justify-center gap-2 py-3 border border-dashed border-zinc-700 rounded-xl text-zinc-400 hover:text-white hover:border-zinc-500 transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Exercise
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-orange-500 text-white font-bold py-3 rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-all shadow-lg shadow-orange-500/20"
          >
            {saving ? 'Saving...' : 'Assign Workout'}
          </button>
        </div>
      </div>
    </div>
  );
}
