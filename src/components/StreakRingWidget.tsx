/**
 * StreakRingWidget.tsx
 * Drop into: src/components/StreakRingWidget.tsx
 *
 * Self-contained animated streak ring.
 * Fires confetti when completedToday flips true.
 * Zero new dependencies — uses canvas-confetti already in the project.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flame, Zap } from 'lucide-react';
import confetti from 'canvas-confetti';
import { cn } from '../lib/utils';

interface StreakRingWidgetProps {
  streak: number;
  completedToday: boolean;
  totalSessions?: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  unit?: string;
  colorTheme?: 'orange' | 'green';
}

const SIZE_MAP = {
  sm: { box: 100, r: 38, stroke: 7, center: 50, fontSize: 'text-2xl', subFontSize: 'text-[9px]' },
  md: { box: 140, r: 54, stroke: 9, center: 70, fontSize: 'text-3xl', subFontSize: 'text-[10px]' },
  lg: { box: 180, r: 70, stroke: 11, center: 90, fontSize: 'text-5xl', subFontSize: 'text-xs' },
};

export function StreakRingWidget({
  streak,
  completedToday,
  totalSessions = 0,
  className,
  size = 'md',
  label,
  unit,
  colorTheme = 'orange',
}: StreakRingWidgetProps) {
  const prevCompleted = useRef(completedToday);
  const [pulseRing, setPulseRing] = useState(false);
  const dims = SIZE_MAP[size];
  const MAX_STREAK = 30;
  const progress = Math.min(streak / MAX_STREAK, 1);
  const circumference = 2 * Math.PI * dims.r;
  const offset = circumference - progress * circumference;

  // Milestones for colour shift
  const isGreen = colorTheme === 'green';
  const ringColor =
    streak === 0
      ? '#27272a' // zinc-800
      : isGreen
      ? streak < 7
        ? '#10b981' // emerald-500
        : streak < 14
        ? '#059669' // emerald-600
        : '#34d399' // emerald-400
      : streak < 7
      ? '#f97316' // orange-500
      : streak < 14
      ? '#ef4444' // red-500
      : '#facc15'; // gold for 2+ weeks

  const glowColor =
    streak === 0
      ? 'transparent'
      : isGreen
      ? streak < 7
        ? 'rgba(16,185,129,0.35)'
        : streak < 14
        ? 'rgba(5,150,105,0.35)'
        : 'rgba(52,211,153,0.40)'
      : streak < 7
      ? 'rgba(249,115,22,0.35)'
      : streak < 14
      ? 'rgba(239,68,68,0.35)'
      : 'rgba(250,204,21,0.4)';

  // Fire confetti and pulse when athlete completes today
  useEffect(() => {
    if (!prevCompleted.current && completedToday) {
      setPulseRing(true);
      setTimeout(() => setPulseRing(false), 1200);
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: isGreen ? ['#10b981', '#34d399', '#a7f3d0', '#ffffff'] : ['#ff4d00', '#f97316', '#facc15', '#ffffff'],
        gravity: 1.2,
      });
    }
    prevCompleted.current = completedToday;
  }, [completedToday, isGreen]);

  const flameEmoji = isGreen 
    ? (streak >= 30 ? '🌱🏆' : streak >= 14 ? '⚡' : '🌱') 
    : (streak >= 30 ? '🏆' : streak >= 14 ? '⚡' : '🔥');

  return (
    <div className={cn('relative flex flex-col items-center gap-3', className)}>
      {/* Outer glow ring (blurred background) */}
      <div className="relative" style={{ width: dims.box, height: dims.box }}>
        {/* Glow pulse on completion */}
        <AnimatePresence>
          {pulseRing && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0.8 }}
              animate={{ scale: 1.5, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="absolute inset-0 rounded-full"
              style={{ background: glowColor }}
            />
          )}
        </AnimatePresence>

        {/* Ambient glow */}
        {streak > 0 && (
          <div
            className="absolute inset-4 rounded-full blur-xl opacity-30 animate-pulse"
            style={{ background: glowColor }}
          />
        )}

        {/* SVG ring */}
        <svg
          width={dims.box}
          height={dims.box}
          viewBox={`0 0 ${dims.box} ${dims.box}`}
          className="relative z-10"
        >
          {/* Track */}
          <circle
            cx={dims.center}
            cy={dims.center}
            r={dims.r}
            fill="none"
            stroke="#18181b"
            strokeWidth={dims.stroke}
          />
          {/* Progress arc */}
          <motion.circle
            cx={dims.center}
            cy={dims.center}
            r={dims.r}
            fill="none"
            stroke={ringColor}
            strokeWidth={dims.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: [0.34, 1.56, 0.64, 1] }}
            style={{
              transform: `rotate(-90deg)`,
              transformOrigin: `${dims.center}px ${dims.center}px`,
              filter: streak > 0 ? `drop-shadow(0 0 6px ${ringColor})` : 'none',
            }}
          />
          {/* Tick marks at each week */}
          {[7, 14, 21].map((tick) => {
            const angle = (tick / MAX_STREAK) * 360 - 90;
            const rad = (angle * Math.PI) / 180;
            const x1 = dims.center + (dims.r - dims.stroke / 2 - 2) * Math.cos(rad);
            const y1 = dims.center + (dims.r - dims.stroke / 2 - 2) * Math.sin(rad);
            const x2 = dims.center + (dims.r + dims.stroke / 2 + 2) * Math.cos(rad);
            const y2 = dims.center + (dims.r + dims.stroke / 2 + 2) * Math.sin(rad);
            return (
              <line
                key={tick}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#3f3f46"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
          <motion.span
            key={streak}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            className={cn('font-black tracking-tighter leading-none', dims.fontSize)}
            style={{ color: streak > 0 ? ringColor : '#52525b' }}
          >
            {streak}
          </motion.span>
          <span className={cn('font-black uppercase tracking-widest text-zinc-500 mt-0.5', dims.subFontSize)}>
            {unit || (streak === 1 ? 'day' : 'days')}
          </span>
          <span className="text-base mt-1 leading-none">{flameEmoji}</span>
        </div>
      </div>

      {/* Labels */}
      <div className="text-center space-y-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
          {label || 'Current Streak'}
        </p>
        <div className="flex items-center justify-center gap-3">
          {streak >= 7 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-full",
                isGreen ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-orange-500/10 border border-orange-500/20"
              )}
            >
              <Zap className={cn("w-2.5 h-2.5", isGreen ? "text-emerald-500" : "text-orange-500")} />
              <span className={cn("text-[9px] font-black uppercase tracking-wider", isGreen ? "text-emerald-400" : "text-orange-500")}>
                {streak >= 21 ? 'Legendary' : streak >= 14 ? 'On Fire' : 'Hot Streak'}
              </span>
            </motion.div>
          )}
          {completedToday && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[9px] font-black uppercase tracking-wider text-green-500">Done Today</span>
            </motion.div>
          )}
        </div>
        {totalSessions > 0 && (
          <p className="text-[9px] text-zinc-600 font-medium">
            {totalSessions} total session{totalSessions !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Week progress dots */}
      <div className="flex gap-1">
        {[...Array(7)].map((_, i) => {
          const dayInCurrentWeek = streak % 7;
          const weeksFull = Math.floor(streak / 7);
          const isActive = weeksFull > 0 || i < dayInCurrentWeek;
          return (
            <motion.div
              key={i}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: i * 0.06, type: 'spring', stiffness: 300 }}
              className={cn(
                'w-1.5 h-6 rounded-full transition-all duration-700',
                isActive
                  ? 'shadow-[0_0_8px_rgba(249,115,22,0.5)]'
                  : 'bg-zinc-800'
              )}
              style={{ backgroundColor: isActive ? ringColor : undefined }}
            />
          );
        })}
      </div>
    </div>
  );
}
