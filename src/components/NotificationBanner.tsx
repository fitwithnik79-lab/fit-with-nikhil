import { useState, useEffect } from 'react';
import { useNotifications } from '../hooks/useNotifications';
import { Bell, X, ShieldAlert, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface NotificationBannerProps {
  userId: string | undefined;
}

export function NotificationBanner({ userId }: NotificationBannerProps) {
  const { permission, requestPermission } = useNotifications(userId);
  const [showBanner, setShowBanner] = useState<boolean>(false);

  useEffect(() => {
    if (!userId || permission !== 'default') return;

    // Check localStorage to see if user has already dismissed or accepted this session's prompt
    const hasDismissed = localStorage.getItem('fwn_notifications_prompt_dismissed') === 'true';
    if (hasDismissed) return;

    // Show banner 3 seconds after first visit/load
    const timer = setTimeout(() => {
      setShowBanner(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, [userId, permission]);

  const handleEnable = async () => {
    try {
      const token = await requestPermission();
      if (token) {
        console.log('[NotificationBanner] Notifications successfully armed!');
      }
    } catch (e) {
      console.error('[NotificationBanner] Error enabling notifications:', e);
    } finally {
      setShowBanner(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('fwn_notifications_prompt_dismissed', 'true');
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50 }}
        className="fixed top-20 left-4 right-4 md:left-auto md:right-6 md:w-96 z-[99] bg-zinc-950 border border-zinc-800 rounded-2xl p-4 shadow-2xl"
      >
        <div className="flex gap-3">
          <div className="p-2 bg-orange-500/10 text-orange-500 rounded-xl self-start">
            <Bell className="w-5 h-5 text-orange-500 animate-bounce" />
          </div>
          
          <div className="flex-1 space-y-1.5">
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              Real-Time Athlete Push Notifications
              <Sparkles className="w-3.5 h-3.5 text-orange-400 animate-pulse" />
            </h4>
            <p className="text-zinc-400 text-xs leading-relaxed">
              Enable real-time push alerts to receive instant Coach feedback, step milestone rewards, and morning motivation.
            </p>
            <div className="flex gap-2 pt-1.5">
              <button
                onClick={handleEnable}
                className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-black uppercase tracking-wider transition-colors"
              >
                Allow Alerts
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 rounded-lg text-xs font-black uppercase tracking-wider transition-colors"
              >
                Later
              </button>
            </div>
          </div>

          <button 
            onClick={handleDismiss}
            className="text-zinc-650 hover:text-zinc-400 self-start p-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
