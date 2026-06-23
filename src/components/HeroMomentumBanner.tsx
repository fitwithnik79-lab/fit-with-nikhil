/**
 * HeroMomentumBanner.tsx
 * Drop into: src/components/HeroMomentumBanner.tsx
 *
 * Full-bleed animated hero for the client dash tab.
 * Replace the "Welcome Section" div inside {activeTab === 'dash' && ...}
 * with <HeroMomentumBanner ... />
 *
 * USAGE in ClientDashboard.tsx — replace the first <motion.div variants={bentoItemVariants}> block:
 *   import { HeroMomentumBanner } from './HeroMomentumBanner';
 *   <HeroMomentumBanner
 *     profile={profile}
 *     streak={profile.streak || calculateStreakFromMetrics(metrics)}
 *     completedToday={isWorkoutCompletedToday}
 *     todayWorkout={currentWorkout}
 *     completedSessions={allFeedback.filter(f => f.completionStatus).length}
 *     habitsCompletedToday={habits.filter(h => habitLogs.some(l => l.habitId === h.id && l.date === todayStr && l.completed)).length}
 *     totalHabits={habits.length}
 *     unreadMessages={messages.filter(m => !m.isRead && m.receiverId === profile.uid).length}
 *     onGoToCalendar={() => setActiveTab('calendar')}
 *     onGoToChat={() => setShowChat(true)}
 *   />
 */

import { useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Flame, Calendar, MessageCircle, Dumbbell,
  ChevronRight, Zap, Target, Clock, Trophy, Activity, Youtube
} from 'lucide-react';
import { UserProfile, Workout } from '../types';
import { StreakRingWidget } from './StreakRingWidget';
import { cn, getAvatarUrl } from '../lib/utils';
import { format } from 'date-fns';

interface HeroMomentumBannerProps {
  profile: UserProfile;
  workoutStreak: number;
  habitStreak: number;
  completedToday: boolean;
  todayWorkout: Workout | null;
  completedSessions: number;
  habitsCompletedToday: number;
  totalHabits: number;
  unreadMessages: number;
  onGoToCalendar: () => void;
  onGoToChat: () => void;
  className?: string;
}

// Motivational ticker phrases — shown in scrolling banner
const TICKER_PHRASES = [
  '🔥 Consistency beats intensity every single time',
  '⚡ Champions train when no one is watching',
  "💪 Your only competition is yesterday's you",
  '🎯 Progress, not perfection — every rep counts',
  '🏆 The grind you hate today is the glory you love tomorrow',
  '🔥 Pain is temporary. Greatness is forever',
  '⚡ Discipline is the bridge between goals and accomplishment',
  '💪 Results happen when commitment meets consistency',
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Night Owl Mode 🌙';
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  if (hour < 21) return 'Good Evening';
  return 'Late Night Grind 🌙';
}

function getMotivationalLine(streak: number, completedToday: boolean): string {
  if (completedToday) return "Session complete. Coach Nik is proud. 🏆";
  if (streak >= 4) return "Four consecutive weeks. Legendary consistency! 🏆";
  if (streak >= 2) return "Two weeks straight. You're building solid momentum!";
  if (streak >= 1) return "Week streak active. Keep the fire burning.";
  return "Crush your workout to build your weekly streak.";
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 120, damping: 16 } },
};

export function HeroMomentumBanner({
  profile,
  workoutStreak,
  habitStreak,
  completedToday,
  todayWorkout,
  completedSessions,
  habitsCompletedToday,
  totalHabits,
  unreadMessages,
  onGoToCalendar,
  onGoToChat,
  className,
}: HeroMomentumBannerProps) {
  const greeting = useMemo(() => getGreeting(), []);
  const motivationalLine = useMemo(() => getMotivationalLine(workoutStreak, completedToday), [workoutStreak, completedToday]);
  const firstName = profile.displayName?.split(' ')[0] || 'Athlete';
  const todayStr = format(new Date(), 'EEEE, MMMM d');

  // Double the ticker array for seamless loop
  const ticker = [...TICKER_PHRASES, ...TICKER_PHRASES];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={cn('relative w-full overflow-hidden', className)}
    >
      {/* Ambient background glow blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[48px]">
        <div className="absolute -top-1/4 -left-1/4 w-3/4 h-3/4 bg-orange-500/[0.04] rounded-full blur-[100px] animate-pulse" />
        <div
          className="absolute bottom-0 right-0 w-1/2 h-1/2 bg-blue-500/[0.03] rounded-full blur-[80px] animate-pulse"
          style={{ animationDelay: '3s' }}
        />
      </div>

      {/* ──────── TOP: Identity bar ──────── */}
      <motion.div
        variants={itemVariants}
        className="flex items-center justify-between mb-8 px-1"
      >
        <div className="flex items-center gap-4">
          <div className="relative">
            <img
              src={getAvatarUrl(profile.email, profile.gender, profile.photoURL)}
              alt={firstName}
              className="w-14 h-14 rounded-2xl object-cover border-2 border-white/10 shadow-xl"
            />
            {completedToday && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-black flex items-center justify-center">
                <span className="text-[8px] text-white font-bold">✓</span>
              </div>
            )}
          </div>
          <div>
            <p className="text-zinc-500 text-xs font-black uppercase tracking-[0.2em]">{greeting}</p>
            <h2 className="text-2xl font-black tracking-tight text-white leading-none">{firstName}</h2>
            <p className="text-zinc-600 text-xs font-medium mt-0.5">{todayStr}</p>
          </div>
        </div>

        {/* Quick action pills */}
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onGoToChat}
            className="relative flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-white/5 rounded-2xl text-xs font-black uppercase tracking-wider text-zinc-400 hover:text-white hover:border-orange-500/30 transition-all"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Coach</span>
            {unreadMessages > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center border border-black animate-bounce">
                {unreadMessages}
              </span>
            )}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onGoToCalendar}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-white/5 rounded-2xl text-xs font-black uppercase tracking-wider text-zinc-400 hover:text-white hover:border-orange-500/30 transition-all"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Calendar</span>
          </motion.button>
        </div>
      </motion.div>

      {/* ──────── MAIN: Hero headline + ring + focus card ──────── */}
      <div className="flex flex-col lg:flex-row gap-8 items-start mb-8">
        {/* Left: Big headline */}
        <motion.div variants={itemVariants} className="flex-1 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-2xl">
            <Flame className="w-3.5 h-3.5 text-orange-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500">
              {motivationalLine}
            </span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.82] uppercase">
            No{' '}
            <span className="text-orange-500 italic">Excuses</span>
            <br />
            just{' '}
            <span className="font-serif italic lowercase font-normal text-zinc-700">
              results.
            </span>
          </h1>
          <p className="text-zinc-500 font-medium text-base max-w-sm leading-relaxed">
            {completedSessions > 0
              ? `${completedSessions} sessions down. Every one built you stronger.`
              : "Your journey starts with a single rep. Let's go."}
          </p>

          {/* Stat pills */}
          <div className="flex flex-wrap gap-2 pt-2">
            <StatPill
              icon={<Dumbbell className="w-3 h-3 text-orange-500" />}
              value={completedSessions}
              label="Sessions"
              color="orange"
            />
            <StatPill
              icon={<Target className="w-3 h-3 text-green-500" />}
              value={`${habitsCompletedToday}/${totalHabits}`}
              label="Habits Today"
              color="green"
            />
            {todayWorkout && (
              <StatPill
                icon={<Clock className="w-3 h-3 text-blue-500" />}
                value={`Wk${todayWorkout.weekNumber} · D${todayWorkout.dayNumber}`}
                label="Today"
                color="blue"
              />
            )}
          </div>
        </motion.div>

        {/* Right: Streak rings */}
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-6 justify-center lg:justify-end w-full lg:w-auto self-center lg:self-start">
          <StreakRingWidget
            streak={workoutStreak}
            completedToday={completedToday}
            totalSessions={completedSessions}
            size="md"
            label="Workout Streak"
            unit={workoutStreak === 1 ? "week" : "weeks"}
            colorTheme="orange"
          />
          <StreakRingWidget
            streak={habitStreak}
            completedToday={habitsCompletedToday > 0}
            size="md"
            label="Daily Habits"
            unit={habitStreak === 1 ? "day" : "days"}
            colorTheme="green"
          />
        </motion.div>
      </div>

      {/* ──────── TODAY'S FOCUS CARD ──────── */}
      <motion.div variants={itemVariants}>
        {todayWorkout ? (
          <TodayFocusCard workout={todayWorkout} completedToday={completedToday} onGoToCalendar={onGoToCalendar} />
        ) : (
          <RestDayCard onGoToCalendar={onGoToCalendar} />
        )}
      </motion.div>

      {/* ──────── SCROLLING TICKER ──────── */}
      <motion.div
        variants={itemVariants}
        className="mt-8 overflow-hidden py-3 border-y border-white/5"
      >
        <div className="animate-marquee-left flex gap-12 whitespace-nowrap w-max">
          {ticker.map((phrase, i) => (
            <span
              key={i}
              className="text-[11px] font-black uppercase tracking-[0.15em] text-zinc-600"
            >
              {phrase}
            </span>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatPill({
  icon,
  value,
  label,
  color,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  color: 'orange' | 'green' | 'blue';
}) {
  const colorMap = {
    orange: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
    green: 'bg-green-500/10 border-green-500/20 text-green-400',
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  };
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border text-[10px] font-black uppercase tracking-wider',
        colorMap[color]
      )}
    >
      {icon}
      <span className="text-white">{value}</span>
      <span className="opacity-60">{label}</span>
    </div>
  );
}

function TodayFocusCard({
  workout,
  completedToday,
  onGoToCalendar,
}: {
  workout: Workout;
  completedToday: boolean;
  onGoToCalendar: () => void;
}) {
  const exerciseCount = workout.exercises?.length ?? 0;

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.005 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={cn(
        'relative overflow-hidden rounded-[40px] p-8 cursor-pointer group',
        completedToday
          ? 'bg-green-500/10 border border-green-500/20'
          : 'bg-zinc-900 border border-white/5 hover:border-orange-500/20'
      )}
      onClick={onGoToCalendar}
    >
      {/* Background decoration */}
      <div className="absolute -right-8 -top-8 opacity-5 group-hover:opacity-10 transition-opacity">
        <Dumbbell className="w-48 h-48 text-orange-500 rotate-12" />
      </div>

      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'p-2 rounded-xl',
                completedToday ? 'bg-green-500/20' : 'bg-orange-500/20'
              )}
            >
              {completedToday ? (
                <Trophy className="w-4 h-4 text-green-500" />
              ) : (
                <Zap className="w-4 h-4 text-orange-500" />
              )}
            </div>
            <span
              className={cn(
                'text-[10px] font-black uppercase tracking-[0.2em]',
                completedToday ? 'text-green-500' : 'text-orange-500'
              )}
            >
              {completedToday ? '✓ Completed Today' : "Today's Session"}
            </span>
          </div>
          <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tighter text-white leading-none">
            Week {workout.weekNumber}{' '}
            <span className={completedToday ? 'text-green-500' : 'text-orange-500'}>
              · Day {workout.dayNumber}
            </span>
          </h3>
          {workout.notes && (
            <p className="text-zinc-500 text-sm font-medium max-w-md leading-relaxed line-clamp-2">
              {workout.notes}
            </p>
          )}
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600 bg-zinc-950 px-3 py-1 rounded-full">
              {exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}
            </span>
            {workout.exercises?.slice(0, 3).map((ex, i) => (
              <span
                key={i}
                className="text-[10px] font-black uppercase tracking-wider text-zinc-500 hidden sm:inline"
              >
                {i > 0 ? '· ' : ''}{ex.name}
              </span>
            ))}
            {exerciseCount > 3 && (
              <span className="text-[10px] text-zinc-600 hidden sm:inline">
                +{exerciseCount - 3} more
              </span>
            )}
          </div>
        </div>

        <motion.div
          whileHover={{ x: 4 }}
          className="flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-orange-500/25 self-start sm:self-center group-hover:bg-orange-600 transition-colors"
        >
          {completedToday ? (
            <>
              <Trophy className="w-4 h-4" /> View Details
            </>
          ) : (
            <>
              <Activity className="w-4 h-4" /> Start Session
              <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
            </>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

function RestDayCard({ onGoToCalendar }: { onGoToCalendar: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-[40px] p-8 bg-zinc-950 border border-white/5 border-dashed">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-zinc-900">
              <Activity className="w-4 h-4 text-zinc-600 animate-pulse" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">
              Recovery Day
            </span>
          </div>
          <h3 className="text-2xl font-black uppercase tracking-tighter text-white/50">
            Rest & Recover
          </h3>
          <p className="text-zinc-600 text-sm font-medium max-w-md">
            Coach Nik is finalizing your next training block. Optimize your nutrition and rest today.
          </p>
        </div>
        <button
          onClick={onGoToCalendar}
          className="flex items-center gap-2 px-5 py-3 bg-zinc-900 border border-white/5 text-zinc-400 rounded-2xl font-black uppercase tracking-widest text-xs hover:text-white hover:border-orange-500/30 transition-all self-start sm:self-center"
        >
          <Calendar className="w-4 h-4" />
          View Schedule
        </button>
      </div>
    </div>
  );
}
