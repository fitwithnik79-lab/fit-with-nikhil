/**
 * AdminKPICommandBar.tsx
 * Drop into: src/components/AdminKPICommandBar.tsx
 *
 * Animated KPI command bar for the admin Actions tab.
 * Place at the TOP of the {activeTab === 'dash' && (...)} block in AdminDashboard.tsx:
 *
 * USAGE:
 *   import { AdminKPICommandBar } from './AdminKPICommandBar';
 *
 *   // Inside {activeTab === 'dash' && (<motion.div ...>
 *   <AdminKPICommandBar
 *     clients={clients}
 *     feedbacks={feedbacks}
 *     allWorkouts={allWorkouts}
 *     allHabitLogs={allHabitLogs}
 *     allGoals={allGoals}
 *     onNavigateToClients={() => setActiveTab('clients')}
 *     onNavigateToTracker={() => setActiveTab('tracker')}
 *   />
 *   // ... rest of dash content
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, Activity, MessageSquare, Target,
  TrendingUp, Zap, AlertTriangle, CheckCircle, ChevronRight
} from 'lucide-react';
import { UserProfile, Feedback, Workout, HabitLog, Goal } from '../types';
import { cn } from '../lib/utils';
import {
  isToday, startOfWeek, isAfter, differenceInDays,
} from 'date-fns';

interface AdminKPICommandBarProps {
  clients: UserProfile[];
  feedbacks: Feedback[];
  allWorkouts: Workout[];
  allHabitLogs: HabitLog[];
  allGoals: Goal[];
  onNavigateToClients: () => void;
  onNavigateToTracker: () => void;
}

// Smooth counter hook — counts up from 0 to target on mount
function useCountUp(target: number, duration = 1200) {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    startTimeRef.current = null;

    const tick = (now: number) => {
      if (!startTimeRef.current) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out-expo
      const eased = 1 - Math.pow(2, -10 * progress);
      setCount(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return count;
}

// Sparkline: tiny SVG bar chart (last 7 days)
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const W = 64;
  const H = 24;
  const barW = W / data.length - 2;

  return (
    <svg width={W} height={H} className="opacity-50">
      {data.map((v, i) => {
        const h = (v / max) * H;
        return (
          <rect
            key={i}
            x={i * (barW + 2)}
            y={H - h}
            width={barW}
            height={h}
            rx={2}
            fill={color}
          />
        );
      })}
    </svg>
  );
}

// Individual KPI tile
function KPITile({
  label,
  value,
  suffix = '',
  trend,
  trendUp,
  icon: Icon,
  iconColor,
  bgColor,
  sparkData,
  sparkColor,
  onClick,
  delay = 0,
  alert = false,
}: {
  label: string;
  value: number;
  suffix?: string;
  trend: string;
  trendUp?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  bgColor: string;
  sparkData?: number[];
  sparkColor?: string;
  onClick?: () => void;
  delay?: number;
  alert?: boolean;
}) {
  const displayValue = useCountUp(value, 1000 + delay * 200);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 120, damping: 14, delay: delay * 0.1 }}
      whileHover={{ y: -5, scale: 1.015 }}
      onClick={onClick}
      className={cn(
        'relative overflow-hidden rounded-[32px] p-6 border transition-all shadow-2xl shadow-black/40',
        'bg-zinc-900 border-white/5',
        onClick && 'cursor-pointer hover:border-orange-500/30',
        alert && 'border-red-500/20 hover:border-red-500/40'
      )}
    >
      {/* Ambient glow */}
      {alert && (
        <div className="absolute inset-0 bg-red-500/[0.03] rounded-[32px] pointer-events-none" />
      )}

      {/* Top row: icon + trend */}
      <div className="flex items-start justify-between mb-5">
        <div className={cn('p-3 rounded-2xl', bgColor)}>
          <Icon className={cn('w-5 h-5', iconColor)} />
        </div>
        <div className="flex flex-col items-end gap-1">
          <div
            className={cn(
              'flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full',
              trendUp === true
                ? 'bg-green-500/10 text-green-500'
                : trendUp === false
                ? 'bg-red-500/10 text-red-400'
                : 'bg-zinc-800 text-zinc-500'
            )}
          >
            {trendUp === true && <TrendingUp className="w-2.5 h-2.5" />}
            {trendUp === false && <AlertTriangle className="w-2.5 h-2.5" />}
            {trend}
          </div>
          {sparkData && sparkColor && (
            <Sparkline data={sparkData} color={sparkColor} />
          )}
        </div>
      </div>

      {/* Value */}
      <div className="space-y-1">
        <div className="flex items-baseline gap-1">
          <AnimatePresence mode="wait">
            <motion.span
              key={displayValue}
              className="text-4xl font-black tracking-tighter text-white leading-none"
            >
              {displayValue.toLocaleString()}
            </motion.span>
          </AnimatePresence>
          {suffix && (
            <span className="text-lg font-black text-zinc-500">{suffix}</span>
          )}
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{label}</p>
      </div>

      {/* Click indicator */}
      {onClick && (
        <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <ChevronRight className="w-4 h-4 text-orange-500" />
        </div>
      )}
    </motion.div>
  );
}

export function AdminKPICommandBar({
  clients,
  feedbacks,
  allWorkouts,
  allHabitLogs,
  allGoals,
  onNavigateToClients,
  onNavigateToTracker,
}: AdminKPICommandBarProps) {
  const weekStart = startOfWeek(new Date());

  // ── Derived metrics ──────────────────────────────────────────────
  const activeClients = useMemo(
    () => clients.filter(c => (c.status || 'active') === 'active'),
    [clients]
  );

  const sessionsThisWeek = useMemo(
    () =>
      feedbacks.filter(f => {
        const d = f.createdAt?.toDate ? f.createdAt.toDate() : new Date();
        return isAfter(d, weekStart);
      }).length,
    [feedbacks, weekStart]
  );

  // Avg completion rate across all clients
  const avgCompletionRate = useMemo(() => {
    const rates = activeClients.map(client => {
      const assigned = allWorkouts.filter(w => w.clientId === client.uid).length;
      const completed = feedbacks.filter(
        f => f.clientId === client.uid && f.completionStatus
      ).length;
      return assigned > 0 ? (completed / assigned) * 100 : 0;
    });
    return rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;
  }, [activeClients, allWorkouts, feedbacks]);

  // Pending reviews (feedbacks without a motivational reply)
  const pendingReviews = useMemo(
    () => feedbacks.filter(f => !f.motivationalMessage && !f.isRead).length,
    [feedbacks]
  );

  // Athletes at risk: streak = 0 and has active goals
  const athletesAtRisk = useMemo(
    () =>
      activeClients.filter(c => {
        const hasStreak = (c.streak || 0) > 0;
        const hasActiveGoals = allGoals.some(
          g => g.clientId === c.uid && g.status === 'in-progress'
        );
        return !hasStreak && hasActiveGoals;
      }).length,
    [activeClients, allGoals]
  );

  // Sparkline: last 7 days feedback count
  const feedbackSparkline = useMemo(() => {
    return [...Array(7)].map((_, i) => {
      const day = differenceInDays(new Date(), new Date()) - (6 - i);
      return feedbacks.filter(f => {
        const d = f.createdAt?.toDate ? f.createdAt.toDate() : null;
        if (!d) return false;
        return differenceInDays(new Date(), d) === 6 - i;
      }).length;
    });
  }, [feedbacks]);

  const activeSparkline = useMemo(() => {
    return [...Array(7)].map((_, i) => {
      return feedbacks.filter(f => {
        const d = f.createdAt?.toDate ? f.createdAt.toDate() : null;
        if (!d) return false;
        return differenceInDays(new Date(), d) === 6 - i && f.completionStatus;
      }).length;
    });
  }, [feedbacks]);

  return (
    <div className="space-y-4 mb-10">
      {/* Live indicator */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_6px_rgba(34,197,94,0.6)]" />
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
            Live Intelligence Dashboard
          </span>
        </div>
        <span className="text-[10px] text-zinc-700 font-medium">
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="group">
          <KPITile
            label="Active Athletes"
            value={activeClients.length}
            trend="Enrolled"
            trendUp={activeClients.length > 0}
            icon={Users}
            iconColor="text-blue-500"
            bgColor="bg-blue-500/10"
            sparkData={[...Array(7)].map((_, i) => activeClients.length - (6 - i) * 0)}
            sparkColor="#3b82f6"
            onClick={onNavigateToClients}
            delay={0}
          />
        </div>

        <div className="group">
          <KPITile
            label="Sessions This Week"
            value={sessionsThisWeek}
            trend={sessionsThisWeek > 5 ? 'High Volume' : 'Building'}
            trendUp={sessionsThisWeek > 3}
            icon={Zap}
            iconColor="text-orange-500"
            bgColor="bg-orange-500/10"
            sparkData={feedbackSparkline}
            sparkColor="#f97316"
            onClick={onNavigateToTracker}
            delay={1}
          />
        </div>

        <div className="group">
          <KPITile
            label="Avg Completion"
            value={avgCompletionRate}
            suffix="%"
            trend={avgCompletionRate >= 75 ? 'Elite' : avgCompletionRate >= 50 ? 'Good' : 'Needs Work'}
            trendUp={avgCompletionRate >= 50}
            icon={Activity}
            iconColor="text-green-500"
            bgColor="bg-green-500/10"
            sparkData={activeSparkline}
            sparkColor="#22c55e"
            delay={2}
          />
        </div>

        <div className="group">
          <KPITile
            label={pendingReviews > 0 ? 'Needs Your Review' : 'Pending Reviews'}
            value={pendingReviews}
            trend={pendingReviews > 5 ? 'Urgent' : pendingReviews > 0 ? 'Action Needed' : 'All Clear'}
            trendUp={pendingReviews === 0}
            icon={pendingReviews > 0 ? MessageSquare : CheckCircle}
            iconColor={pendingReviews > 0 ? 'text-purple-400' : 'text-green-500'}
            bgColor={pendingReviews > 0 ? 'bg-purple-500/10' : 'bg-green-500/10'}
            onClick={pendingReviews > 0 ? onNavigateToTracker : undefined}
            delay={3}
            alert={pendingReviews > 5}
          />
        </div>
      </div>

      {/* Secondary: At-risk alert banner (only shows when there are at-risk athletes) */}
      <AnimatePresence>
        {athletesAtRisk > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className="flex items-center justify-between p-4 rounded-2xl bg-red-500/5 border border-red-500/20 cursor-pointer hover:bg-red-500/10 transition-colors"
              onClick={onNavigateToClients}
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" />
                <span className="text-xs font-black uppercase tracking-wider text-red-400">
                  {athletesAtRisk} Athlete{athletesAtRisk > 1 ? 's' : ''} at risk
                </span>
                <span className="text-xs text-zinc-600 font-medium">
                  — Streak broken with active goals. Consider sending a check-in.
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-red-400 hover:text-red-300">
                View <ChevronRight className="w-3 h-3" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
