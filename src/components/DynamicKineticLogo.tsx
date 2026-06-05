import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Dumbbell, 
  Users, 
  Activity, 
  Calendar, 
  Send, 
  BookOpen, 
  Settings, 
  Sparkles, 
  Shield, 
  Utensils, 
  Flame, 
  MessageSquare,
  TrendingUp,
  Target
} from 'lucide-react';

interface DynamicKineticLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  fixedRole?: 'admin' | 'client' | null;
  fixedTab?: string | null;
}

export const DynamicKineticLogo: React.FC<DynamicKineticLogoProps> = ({ 
  className = "", 
  size = "md",
  fixedRole = null,
  fixedTab = null
}) => {
  const [activeTab, setActiveTab] = useState<string>('dash');
  const [role, setRole] = useState<'admin' | 'client'>('client');
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (fixedTab) {
      setActiveTab(fixedTab);
    }
    if (fixedRole) {
      setRole(fixedRole);
    }

    if (fixedTab && fixedRole) return;

    const handleTabChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ tab: string; role: 'admin' | 'client' }>;
      if (customEvent.detail) {
        if (!fixedTab && customEvent.detail.tab) setActiveTab(customEvent.detail.tab);
        if (!fixedRole && customEvent.detail.role) setRole(customEvent.detail.role);
      }
    };

    window.addEventListener('app-tab-changed', handleTabChange);
    return () => window.removeEventListener('app-tab-changed', handleTabChange);
  }, [fixedTab, fixedRole]);

  // Determine the theme / visual mode based on the current page context
  const getThemeConfig = () => {
    // Map of various subtabs across admin & client layouts
    const tabName = activeTab.toLowerCase();
    
    if (tabName === 'dash' || tabName === 'home') {
      return {
        icon: Dumbbell,
        label: "Core Intensity",
        color: "from-orange-500 to-amber-500",
        shadowColor: "rgba(249, 115, 22, 0.4)",
        glowColor: "bg-orange-500/10",
        rotation: 0,
        energyPulse: "animate-pulse"
      };
    }
    
    if (tabName === 'clients' || tabName === 'athletes' || tabName === 'classes') {
      return {
        icon: Users,
        label: "The Squad",
        color: "from-blue-500 to-indigo-500",
        shadowColor: "rgba(59, 130, 246, 0.4)",
        glowColor: "bg-blue-500/10",
        rotation: 12,
        energyPulse: "animate-[ping_3s_infinite]"
      };
    }
    
    if (tabName === 'tracker' || tabName === 'flow' || tabName === 'progress') {
      return {
        icon: Activity,
        label: "Telemetry Flow",
        color: "from-emerald-500 to-teal-500",
        shadowColor: "rgba(16, 185, 129, 0.4)",
        glowColor: "bg-emerald-500/10",
        rotation: -15,
        energyPulse: "animate-pulse"
      };
    }
    
    if (tabName === 'calendar' || tabName === 'plan' || tabName === 'program') {
      return {
        icon: Calendar,
        label: "Periodization",
        color: "from-rose-500 to-red-500",
        shadowColor: "rgba(244, 63, 94, 0.4)",
        glowColor: "bg-rose-500/10",
        rotation: 45,
        energyPulse: ""
      };
    }
    
    if (tabName === 'broadcast' || tabName === 'chat' || tabName === 'messages') {
      return {
        icon: Send,
        label: "Signal Ripple",
        color: "from-purple-500 to-fuchsia-500",
        shadowColor: "rgba(168, 85, 247, 0.4)",
        glowColor: "bg-purple-500/10",
        rotation: -45,
        energyPulse: "animate-bounce"
      };
    }
    
    if (
      tabName === 'templates' || 
      tabName === 'vault' || 
      tabName === 'meal' || 
      tabName === 'meal-ai' || 
      tabName === 'nutrition'
    ) {
      return {
        icon: BookOpen,
        label: "The Vault",
        color: "from-amber-400 to-yellow-600",
        shadowColor: "rgba(245, 158, 11, 0.4)",
        glowColor: "bg-yellow-500/10",
        rotation: 180,
        energyPulse: "animate-pulse"
      };
    }
    
    // Fallback/Settings/Profile
    return {
      icon: Settings,
      label: "System Engine",
      color: "from-zinc-400 to-zinc-600",
      shadowColor: "rgba(113, 113, 122, 0.4)",
      glowColor: "bg-zinc-500/10",
      rotation: 90,
      energyPulse: "animate-spin"
    };
  };

  const config = getThemeConfig();
  const IconComponent = config.icon;

  // Render sizing
  const dimensions = {
    sm: { container: 'h-8 px-2.5 gap-2', iconBg: 'w-6 h-6', iconSize: 'w-3.5 h-3.5', text: 'text-[11px] tracking-widest', badge: 'text-[7px]' },
    md: { container: 'h-11 px-4 gap-3', iconBg: 'w-8 h-8', iconSize: 'w-5 h-5', text: 'text-sm tracking-widest', badge: 'text-[8.5px]' },
    lg: { container: 'h-16 px-6 gap-4', iconBg: 'w-12 h-12', iconSize: 'w-7 h-7', text: 'text-lg tracking-[0.15em]', badge: 'text-[10px]' }
  };

  const d = dimensions[size];

  return (
    <motion.div 
      className={`inline-flex items-center rounded-2xl bg-zinc-950/40 border border-zinc-900 overflow-hidden select-none pr-4 py-1 backdrop-blur-3xl transition-all duration-500 hover:border-zinc-800 ${d.container} ${className}`}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      animate={{
        boxShadow: isHovered 
          ? `0 10px 40px -10px ${config.shadowColor}` 
          : '0 4px 20px -10px rgba(0,0,0,0.5)'
      }}
    >
      {/* Outer Glow Wrapper */}
      <div className="relative">
        {/* Kinetic Energy Orbs in Background */}
        <AnimatePresence mode="popLayout">
          <motion.div
            key={activeTab}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: isHovered ? 1.4 : 1.1, opacity: 0.6 }}
            exit={{ scale: 1.5, opacity: 0 }}
            className={`absolute inset-0 rounded-full blur-md ${config.glowColor}`}
            transition={{ type: 'spring', stiffness: 100, damping: 15 }}
          />
        </AnimatePresence>

        {/* Dynamic Icon Shell representing kinetic balance */}
        <motion.div 
          className={`relative rounded-xl bg-gradient-to-br ${config.color} flex items-center justify-center text-white font-black overflow-hidden shadow-lg ${d.iconBg}`}
          animate={{
            rotate: isHovered ? config.rotation + 18 : config.rotation,
            borderRadius: activeTab === 'dash' ? "10px" : activeTab === 'settings' ? "50%" : "14px",
            scale: isHovered ? 1.08 : 1
          }}
          transition={{ type: 'spring', stiffness: 200, damping: 12 }}
        >
          {/* Internal ripple wave */}
          <span className={`absolute inset-0 bg-white/20 blur-[1px] transform translate-y-1/2 scale-150 ${config.energyPulse}`} />
          
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, scale: 0.6, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.6, y: -10 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="relative z-10"
            >
              <IconComponent className={`${d.iconSize}`} />
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Dynamic Text Shifter badge */}
      <div className="flex flex-col justify-center select-none overflow-hidden">
        <div className="flex items-center gap-1.5 leading-none">
          <span className={`font-black uppercase tracking-widest text-white ${d.text}`}>
            FIT WITH NIK
          </span>
          <motion.div
            animate={{ scale: isHovered ? [1, 1.2, 1] : 1 }}
            transition={{ repeat: isHovered ? Infinity : 0, duration: 1 }}
          >
            <Sparkles className="w-3 h-3 text-orange-400 opacity-60" />
          </motion.div>
        </div>
        
        {/* Shifting Coach Status / Active Zone display subtext */}
        <div className="h-4 mt-0.5 relative overflow-hidden flex items-center">
          <AnimatePresence mode="popLayout">
            <motion.p 
              key={activeTab}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={`font-mono font-black uppercase text-zinc-500 select-none tracking-[0.2em] inline-flex items-center gap-1 ${d.badge}`}
            >
              {role === 'admin' && <Shield className="w-2.5 h-2.5 text-zinc-600 mr-0.5" />}
              {role === 'admin' ? `COACH • ${config.label}` : `ATHLETE • ${config.label}`}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};
