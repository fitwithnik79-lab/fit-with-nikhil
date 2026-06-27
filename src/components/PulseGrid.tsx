import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Star, MessageSquare, Dumbbell, Activity, 
  AlertCircle, Sparkles, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Clock, HelpCircle
} from 'lucide-react';
import { UserProfile, WeeklyCheckIn, ClientType } from '../types';
import { getAvatarUrl, cn } from '../lib/utils';
import { format, startOfWeek, addDays, subDays } from 'date-fns';

interface PulseGridProps {
  clients: UserProfile[];
  weeklyCheckIns: WeeklyCheckIn[];
  onMessageClient: (uid: string) => void;
  onProgramClient: (uid: string) => void;
}

export function PulseGrid({ clients, weeklyCheckIns, onMessageClient, onProgramClient }: PulseGridProps) {
  // --- WEEK SELECTOR ---
  // Generate the last 6 weeks (Mondays) as selector options
  const weeksList = useMemo(() => {
    const list = [];
    let current = startOfWeek(new Date(), { weekStartsOn: 1 });
    for (let i = 0; i < 6; i++) {
      list.push(format(current, 'yyyy-MM-dd'));
      current = addDays(current, -7);
    }
    return list;
  }, []);

  const [selectedWeek, setSelectedWeek] = useState<string>(weeksList[0]);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc'); // programRating ascending by default (lowest = needs most attention)

  // Filter out inactive athletes so the coach focuses on active ones
  const activeClients = useMemo(() => {
    return clients.filter(c => (c.status || 'active') === 'active');
  }, [clients]);

  // Combine clients with their check-ins for the selected week
  const pulseRows = useMemo(() => {
    return activeClients.map(client => {
      const checkIn = weeklyCheckIns.find(
        c => c.uid === client.uid && c.weekOf === selectedWeek
      );

      return {
        client,
        checkIn: checkIn || null,
        hasSubmitted: !!checkIn,
        programRating: checkIn?.programRating !== undefined ? checkIn.programRating : null,
      };
    });
  }, [activeClients, weeklyCheckIns, selectedWeek]);

  // Sort rows based on default sorting or toggle: unsubmitted (pending) can be grouped or put at the bottom
  const sortedPulseRows = useMemo(() => {
    const submitted = pulseRows.filter(r => r.hasSubmitted);
    const unsubmitted = pulseRows.filter(r => !r.hasSubmitted);

    // Sort submitted ones by program rating
    submitted.sort((a, b) => {
      const ratingA = a.programRating ?? 0;
      const ratingB = b.programRating ?? 0;
      return sortDirection === 'asc' ? ratingA - ratingB : ratingB - ratingA;
    });

    // Unsubmitted are listed at the bottom
    return [...submitted, ...unsubmitted];
  }, [pulseRows, sortDirection]);

  const getClientTypeLabel = (type?: ClientType) => {
    switch (type) {
      case 'fitness': return 'Fitness';
      case 'knee_injury': return 'Knee Injury';
      case 'back_injury': return 'Back Injury';
      case 'shoulder_injury': return 'Shoulder Injury';
      default: return 'Fitness';
    }
  };

  const getClientTypeStyles = (type?: ClientType) => {
    switch (type) {
      case 'fitness': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'knee_injury': return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
      case 'back_injury': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'shoulder_injury': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      default: return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    }
  };

  // Helper to determine row color classes based on requested rules:
  // - Red background: sharpPain===true OR painReduction==='no'/'worse'
  // - Amber: programRating <= 2
  // - Green: (painReduction==='better'/'moderate') AND programRating >= 4
  // - Grey (italic): check-in not yet submitted
  const getRowStyles = (row: typeof pulseRows[0]) => {
    const { checkIn, hasSubmitted, programRating } = row;

    if (!hasSubmitted) {
      return 'bg-zinc-900/20 text-zinc-500 border-zinc-800/40 hover:bg-zinc-900/30 transition-all font-medium italic';
    }

    const painRed = checkIn?.painReduction;
    const isWorse = painRed === 'no';
    const isSharp = checkIn?.sharpPain === true;

    // Red: sharpPain === true OR painReduction === 'no'
    if (isSharp || isWorse) {
      return 'bg-red-500/10 border-red-500/20 text-red-100 hover:bg-red-500/15 transition-all';
    }

    // Amber: programRating <= 2
    if (programRating !== null && programRating <= 2) {
      return 'bg-amber-500/10 border-amber-500/20 text-amber-100 hover:bg-amber-500/15 transition-all';
    }

    // Green: painReduction is better/moderate AND programRating >= 4
    const isBetter = painRed === 'moderate';
    if (isBetter && programRating !== null && programRating >= 4) {
      return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-100 hover:bg-emerald-500/15 transition-all';
    }

    return 'bg-zinc-900/40 border-zinc-800 text-zinc-300 hover:bg-zinc-900/60 transition-all';
  };

  // Helper to render compact Pain/Progress column
  const renderPainProgress = (row: typeof pulseRows[0]) => {
    const { checkIn, hasSubmitted } = row;
    const type = row.client.clientType || 'fitness';

    if (!hasSubmitted) return <span className="text-zinc-600">-</span>;

    if (type === 'fitness') {
      const strengthLabel = checkIn?.strengthGain ? '💪 Yes' : '❌ No';
      const nutritionLabel = checkIn?.dietAdherence === 'yes' ? '🥗 Yes' : checkIn?.dietAdherence === 'partial' ? '🥗 Partly' : '❌ No';
      return (
        <div className="flex flex-col gap-1 text-[11px] font-semibold">
          <div>Strength: <span className="text-white">{strengthLabel}</span></div>
          <div>Diet: <span className="text-white">{nutritionLabel}</span></div>
        </div>
      );
    }

    // Injury clients
    const painRed = checkIn?.painReduction;
    const painLabel = painRed === 'moderate' ? 'Better' : painRed === 'slight' ? 'Same' : 'Worse';
    const moveImp = checkIn?.movementImprovement;
    const moveLabel = moveImp === 'moderate' ? 'Easier' : moveImp === 'slight' ? 'Same' : 'Harder';

    let extraInfo = '';
    if (type === 'knee_injury') {
      extraInfo = checkIn?.kneeStiffness ? 'Stiff Knee' : 'Knee OK';
    } else if (type === 'back_injury') {
      extraInfo = checkIn?.sharpPain ? '⚠️ Sharp Pain' : 'No Sharp Pain';
    } else if (type === 'shoulder_injury') {
      const reach = checkIn?.overheadReach === true ? 'Yes' : checkIn?.overheadReach === false ? 'No' : 'No Test';
      extraInfo = `Reach: ${reach}`;
    }

    return (
      <div className="flex flex-col gap-1 text-[11px] font-semibold">
        <div>Pain: <span className="text-white">{painLabel}</span></div>
        <div>Move: <span className="text-white">{moveLabel}</span></div>
        <div className="text-[10px] text-zinc-400 font-medium">{extraInfo}</div>
      </div>
    );
  };

  return (
    <div id="pulse-grid-container" className="space-y-6">
      {/* Header bar with Week selector and Sort */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl">
        <div className="space-y-1">
          <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest block">Review Period</label>
          <div className="relative">
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-white font-bold outline-none cursor-pointer focus:ring-1 focus:ring-orange-500 pr-10"
            >
              {weeksList.map(week => (
                <option key={week} value={week}>
                  Week of {format(new Date(week + 'T00:00:00'), 'MMM d, yyyy')}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-zinc-350 transition-all"
          >
            Sort: Rating {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
            {sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 text-orange-500" /> : <ChevronDown className="w-4 h-4 text-orange-500" />}
          </button>
        </div>
      </div>

      {/* Grid / Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-950/80 border-b border-zinc-800 text-[10px] text-zinc-500 font-black uppercase tracking-widest">
                <th className="py-4 px-6">Client name</th>
                <th className="py-4 px-4">Type badge</th>
                <th className="py-4 px-4">Pain / Progress</th>
                <th className="py-4 px-4">Pattern</th>
                <th className="py-4 px-4">Rating</th>
                <th className="py-4 px-4">Notes preview</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {sortedPulseRows.map((row) => {
                  const { client, checkIn, hasSubmitted, programRating } = row;
                  const rowStyles = getRowStyles(row);

                  return (
                    <motion.tr
                      key={client.uid}
                      layoutId={`pulse-row-${client.uid}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={cn("border-b border-zinc-900/60 transition-all text-xs", rowStyles)}
                    >
                      {/* Column 1: Client name */}
                      <td className="py-4 px-6 font-bold text-white">
                        <div className="flex items-center gap-3">
                          <img
                            src={getAvatarUrl(client.email || undefined, client.gender, client.photoURL)}
                            alt={client.displayName}
                            className="w-9 h-9 rounded-full object-cover border border-white/5 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <span className="block text-sm font-black tracking-tight">{client.displayName}</span>
                            <span className="block text-[10px] text-zinc-500 font-medium tracking-wide mt-0.5">{client.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Column 2: Type badge */}
                      <td className="py-4 px-4">
                        <span className={cn("inline-block px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest", getClientTypeStyles(client.clientType))}>
                          {getClientTypeLabel(client.clientType)}
                        </span>
                      </td>

                      {/* Column 3: Pain / Progress */}
                      <td className="py-4 px-4 font-semibold text-zinc-300">
                        {renderPainProgress(row)}
                      </td>

                      {/* Column 4: Pattern */}
                      <td className="py-4 px-4 font-bold">
                        {hasSubmitted ? (
                          checkIn?.workoutPattern === 'interesting' ? (
                            <span className="text-emerald-400">💪 Interesting</span>
                          ) : (
                            <span className="text-rose-400">😴 Boring</span>
                          )
                        ) : (
                          <span className="text-zinc-600">-</span>
                        )}
                      </td>

                      {/* Column 5: Rating */}
                      <td className="py-4 px-4">
                        {hasSubmitted && programRating !== null ? (
                          <div className="flex items-center gap-1.5">
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={cn("w-3.5 h-3.5",
                                    star <= programRating ? "text-orange-500 fill-orange-500" : "text-zinc-800"
                                  )}
                                />
                              ))}
                            </div>
                            <span className="font-bold text-zinc-350">{programRating}/5</span>
                          </div>
                        ) : (
                          <span className="text-zinc-600">-</span>
                        )}
                      </td>

                      {/* Column 6: Notes preview */}
                      <td className="py-4 px-4">
                        {hasSubmitted && checkIn?.freeText ? (
                          <div 
                            className="max-w-[150px] truncate italic text-zinc-400 font-medium"
                            title={checkIn.freeText}
                          >
                            "{checkIn.freeText}"
                          </div>
                        ) : !hasSubmitted ? (
                          <span className="text-zinc-600 italic">Not yet submitted</span>
                        ) : (
                          <span className="text-zinc-600">-</span>
                        )}
                      </td>

                      {/* Column 7: Actions */}
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onMessageClient(client.uid)}
                            className="p-2.5 bg-zinc-950 hover:bg-zinc-850 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white transition-all"
                            title="Message Athlete"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onProgramClient(client.uid)}
                            className="p-2.5 bg-white hover:bg-orange-500 text-zinc-950 hover:text-white rounded-xl transition-all shadow border border-zinc-800"
                            title="Edit Athlete Program"
                          >
                            <Dumbbell className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {sortedPulseRows.length === 0 && (
          <div className="py-12 text-center text-zinc-500 font-semibold uppercase tracking-widest text-xs">
            No active athletes in the system
          </div>
        )}
      </div>
    </div>
  );
}
