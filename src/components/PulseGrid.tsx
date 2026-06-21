import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Star, MessageSquare, Dumbbell, Activity, 
  AlertCircle, Sparkles, TrendingUp, TrendingDown,
  ChevronRight, BadgeInfo, HelpCircle, Check, Loader2
} from 'lucide-react';
import { UserProfile, WeeklyCheckIn, ClientType } from '../types';
import { getAvatarUrl, cn } from '../lib/utils';
import { format, startOfWeek, addDays } from 'date-fns';

interface PulseGridProps {
  clients: UserProfile[];
  weeklyCheckIns: WeeklyCheckIn[];
  onMessageClient: (uid: string) => void;
  onProgramClient: (uid: string) => void;
}

export function PulseGrid({ clients, weeklyCheckIns, onMessageClient, onProgramClient }: PulseGridProps) {
  const [filterType, setFilterType] = useState<'all' | 'submitted' | 'pending'>('all');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const thisSundayStr = useMemo(() => {
    return format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd');
  }, []);

  const lastSundayStr = useMemo(() => {
    return format(addDays(startOfWeek(new Date(), { weekStartsOn: 0 }), -7), 'yyyy-MM-dd');
  }, []);

  const activeClients = useMemo(() => {
    return clients.filter(c => (c.status || 'active') === 'active');
  }, [clients]);

  const pulseRows = useMemo(() => {
    return activeClients.map(client => {
      // Find this week's Sunday check-in
      const checkInThisWeek = weeklyCheckIns.find(
        c => c.uid === client.uid && c.weekOf === thisSundayStr
      );

      // Find last week's Sunday check-in
      const checkInLastWeek = weeklyCheckIns.find(
        c => c.uid === client.uid && c.weekOf === lastSundayStr
      );

      // Trend calculation
      let ratingTrend: 'up' | 'down' | 'stable' | null = null;
      if (checkInThisWeek && checkInLastWeek) {
        if (checkInThisWeek.programRating > checkInLastWeek.programRating) {
          ratingTrend = 'up';
        } else if (checkInThisWeek.programRating < checkInLastWeek.programRating) {
          ratingTrend = 'down';
        } else {
          ratingTrend = 'stable';
        }
      }

      return {
        client,
        checkIn: checkInThisWeek || null,
        prevCheckIn: checkInLastWeek || null,
        ratingTrend,
        programRating: checkInThisWeek ? checkInThisWeek.programRating : 0,
        submittedAt: checkInThisWeek ? checkInThisWeek.submittedAt : null,
      };
    }).filter(row => {
      if (filterType === 'submitted') return !!row.checkIn;
      if (filterType === 'pending') return !row.checkIn;
      return true;
    }).sort((a, b) => {
      // Sort lowest rated submitted checkins first
      if (a.checkIn && b.checkIn) {
        return a.programRating - b.programRating;
      }
      if (a.checkIn) return -1; // submitted checkins above pending
      if (b.checkIn) return 1;
      return 0;
    });
  }, [activeClients, weeklyCheckIns, thisSundayStr, lastSundayStr, filterType]);

  const getClientTypeLabel = (type?: ClientType) => {
    switch (type) {
      case 'fitness': return 'Fitness';
      case 'knee_injury': return 'Knee Rehab';
      case 'back_injury': return 'Back Rehab';
      case 'shoulder_injury': return 'Shoulder Rehab';
      default: return 'Fitness';
    }
  };

  const getClientTypeStyles = (type?: ClientType) => {
    switch (type) {
      case 'fitness': return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
      case 'knee_injury': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'back_injury': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'shoulder_injury': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default: return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    }
  };

  // Helper render for injury/specialized parameters
  const renderPainReductionBadge = (reduction?: 'slight' | 'moderate' | 'no' | string) => {
    if (!reduction) return null;
    let label = 'No recovery';
    let color = 'bg-rose-500/10 text-rose-400 border-rose-500/10';
    if (reduction === 'moderate') {
      label = 'Moderate Recovery';
      color = 'bg-green-500/10 text-green-400 border-green-500/10';
    } else if (reduction === 'slight') {
      label = 'Slight Recovery';
      color = 'bg-amber-500/10 text-amber-400 border-amber-500/10';
    }
    return (
      <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border", color)}>
        Pain: {label}
      </span>
    );
  };

  const renderMovementBadge = (movement?: 'slight' | 'moderate' | 'no' | 'yes' | 'no_improvement' | string) => {
    if (!movement) return null;
    let label = 'No Improvement';
    let color = 'bg-rose-500/10 text-rose-400 border-rose-500/10';
    if (movement === 'moderate') {
      label = 'Moderate Mob';
      color = 'bg-green-500/10 text-green-400 border-green-500/10';
    } else if (movement === 'slight') {
      label = 'Slight Mob';
      color = 'bg-amber-500/10 text-amber-400 border-amber-500/10';
    } else if (movement === 'yes') {
      label = 'Improved';
      color = 'bg-green-500/10 text-green-400 border-green-500/10';
    } else if (movement === 'no_improvement') {
      label = 'No change';
      color = 'bg-rose-500/10 text-rose-400 border-rose-500/10';
    }
    return (
      <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border", color)}>
        Mobility: {label}
      </span>
    );
  };

  return (
    <div id="pulse-grid-container" className="space-y-6">
      {/* Filters bar */}
      <div className="flex items-center justify-between border-b border-zinc-900 pb-5">
        <div className="flex items-center gap-2">
          {(['all', 'submitted', 'pending'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFilterType(tab)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border",
                filterType === tab
                  ? "bg-white text-zinc-950 border-white"
                  : "bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:border-zinc-700"
              )}
            >
              {tab} ({
                tab === 'all' ? pulseRows.length :
                tab === 'submitted' ? pulseRows.filter(r => !!r.checkIn).length : 
                pulseRows.filter(r => !r.checkIn).length
              })
            </button>
          ))}
        </div>
        <div className="text-zinc-500 text-xs font-semibold">
          Week: <span className="text-zinc-300 font-bold">{thisSundayStr}</span>
        </div>
      </div>

      {pulseRows.length === 0 ? (
        <div className="bg-zinc-900/30 border border-zinc-900 rounded-[32px] p-16 text-center">
          <Activity className="w-12 h-12 text-zinc-700 mx-auto mb-4 animate-pulse" />
          <p className="text-zinc-500 font-black uppercase tracking-widest text-xs">No check-ins found matches filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <AnimatePresence mode="popLayout">
            {pulseRows.map(({ client, checkIn, ratingTrend, programRating }) => {
              const type = client.clientType || 'fitness';
              const isPending = !checkIn;

              return (
                <motion.div
                  key={client.uid}
                  layoutId={`pulse-row-${client.uid}`}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  onMouseEnter={() => setHoveredRow(client.uid)}
                  onMouseLeave={() => setHoveredRow(null)}
                  className={cn(
                    "rounded-[32px] border p-6 md:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6 transition-all relative overflow-hidden",
                    isPending 
                      ? "bg-zinc-950/40 border-zinc-900/60 opacity-60" 
                      : hoveredRow === client.uid
                        ? "bg-zinc-900 border-zinc-850 shadow-xl"
                        : "bg-zinc-900/60 border-zinc-900 shadow-md"
                  )}
                >
                  {/* Left Column: Client Profile & Client type badge */}
                  <div className="flex items-center gap-5 min-w-[240px]">
                    <div className="w-14 h-14 rounded-full overflow-hidden bg-zinc-800 border border-white/5 relative shrink-0">
                      <img
                        src={getAvatarUrl(client.email || undefined, client.gender, client.photoURL)}
                        alt={client.displayName}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      {!isPending && (
                        <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-zinc-900 shadow-lg" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-lg font-black tracking-tight text-white leading-tight">
                        {client.displayName}
                      </h4>
                      <p className="text-xs text-zinc-500 font-semibold mt-0.5">{client.email}</p>
                      
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border", getClientTypeStyles(type))}>
                          {getClientTypeLabel(type)}
                        </span>
                        {isPending && (
                          <span className="px-2.5 py-1 rounded-lg text-[10px] bg-zinc-800 text-zinc-500 border border-zinc-700 font-black uppercase tracking-widest">
                            Pending
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Mid Column: Specific Metrics depending on Check-in */}
                  <div className="flex-1">
                    {isPending ? (
                      <div className="text-zinc-600 text-sm italic py-2 flex items-center gap-2 font-medium">
                        <Loader2 className="w-4 h-4 animate-spin text-zinc-700" />
                        Awaiting Sunday check-in response...
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {/* Specialized indicators based on type */}
                          {type === 'fitness' && (
                            <>
                              <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border", 
                                checkIn?.strengthGain === 'yes' ? 'bg-green-500/10 text-green-400 border-green-500/10' : 'bg-rose-500/10 text-rose-400 border-rose-500/10'
                              )}>
                                Strength: {checkIn?.strengthGain || 'no'}
                              </span>
                              <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border", 
                                checkIn?.dietAdherence === 'yes' ? 'bg-green-500/10 text-green-400 border-green-500/10' : 
                                checkIn?.dietAdherence === 'partially' ? 'bg-amber-500/10 text-amber-400 border-amber-500/10' :
                                'bg-rose-500/10 text-rose-400 border-rose-500/10'
                              )}>
                                Nutrition: {checkIn?.dietAdherence || 'no'}
                              </span>
                              <span className="px-2.5 py-1 rounded-lg text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/10 font-black uppercase tracking-widest">
                                Energy: {checkIn?.energyLevel || 3} / 5
                              </span>
                            </>
                          )}

                          {type === 'knee_injury' && (
                            <>
                              {renderPainReductionBadge(checkIn?.painReduction)}
                              {renderMovementBadge(checkIn?.movementImprovement)}
                              <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border", 
                                checkIn?.kneeStiffness === 'yes' ? 'bg-rose-500/10 text-rose-400 border-rose-500/10' : 'bg-green-500/10 text-green-400 border-green-500/10'
                              )}>
                                Stiffness: {checkIn?.kneeStiffness || 'no'}
                              </span>
                            </>
                          )}

                          {type === 'back_injury' && (
                            <>
                              {renderPainReductionBadge(checkIn?.painReduction)}
                              {renderMovementBadge(checkIn?.movementImprovement)}
                              <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border", 
                                checkIn?.sharpPain === 'yes' ? 'bg-rose-500/10 text-rose-400 border-rose-500/10' : 'bg-green-500/10 text-green-400 border-green-500/10'
                              )}>
                                Sharp Pain: {checkIn?.sharpPain || 'no'}
                              </span>
                            </>
                          )}

                          {type === 'shoulder_injury' && (
                            <>
                              {renderPainReductionBadge(checkIn?.painReduction)}
                              <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border", 
                                checkIn?.overheadReach === 'yes' ? 'bg-green-500/10 text-green-400 border-green-500/10' : 'bg-rose-500/10 text-rose-400 border-rose-500/10'
                              )}>
                                Overreach: {checkIn?.overheadReach || 'no'}
                              </span>
                              <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border", 
                                checkIn?.sleepAffected === 'yes' ? 'bg-rose-500/10 text-rose-400 border-rose-500/10' : 'bg-green-500/10 text-green-400 border-green-500/10'
                              )}>
                                Sleep Affected: {checkIn?.sleepAffected || 'no'}
                              </span>
                            </>
                          )}

                          {/* Workout Pattern indicator */}
                          <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border", 
                            checkIn?.workoutPattern === 'interesting' ? 'bg-green-500/10 text-green-400 border-green-500/10' : 'bg-rose-500/10 text-rose-400 border-rose-500/10'
                          )}>
                            Pattern: {checkIn?.workoutPattern || 'boring'}
                          </span>
                        </div>

                        {/* Free text preview */}
                        {checkIn?.freeText && (
                          <div className="bg-zinc-950/40 p-4 rounded-2xl border border-zinc-800 text-xs text-zinc-300 max-w-xl font-medium italic relative group overflow-hidden">
                            <span className="absolute top-0 left-0 h-full w-1 bg-orange-500" />
                            "{checkIn.freeText}"
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Program Rating & Wow Trend & Core Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-6 justify-end shrink-0">
                    {!isPending && (
                      <div className="flex flex-col items-start lg:items-end gap-1 select-none">
                        <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Program Rating</span>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map(star => (
                              <Star
                                key={star}
                                className={cn("w-4 h-4", 
                                  star <= (programRating || 0) 
                                    ? "text-orange-500 fill-orange-500" 
                                    : "text-zinc-800"
                                )}
                              />
                            ))}
                          </div>
                          
                          {/* Week-over-week Trend Icon */}
                          {ratingTrend === 'up' && (
                            <div className="flex items-center gap-0.5 bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded-lg text-[9px] font-black border border-green-500/10 animate-pulse">
                              <TrendingUp className="w-3 h-3 text-green-400" />
                              UP
                            </div>
                          )}
                          {ratingTrend === 'down' && (
                            <div className="flex items-center gap-0.5 bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded-lg text-[9px] font-black border border-rose-500/10 animate-pulse">
                              <TrendingDown className="w-3 h-3 text-rose-400" />
                              DOWN
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Actions button group */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onMessageClient(client.uid)}
                        className="p-3 bg-zinc-950 hover:bg-zinc-855 rounded-2xl border border-zinc-800 text-zinc-400 hover:text-white transition-all"
                        title="Chat with athlete"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onProgramClient(client.uid)}
                        className="px-4 py-3 bg-white text-zinc-950 hover:bg-orange-500 hover:text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md flex items-center gap-1.5"
                      >
                        <Dumbbell className="w-3.5 h-3.5" />
                        Edit Program
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
