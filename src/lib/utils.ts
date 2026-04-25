import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function playNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
    oscillator.frequency.exponentialRampToValueAtTime(1100, audioContext.currentTime + 0.1); 
    oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.2);

    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.3);

    if ("vibrate" in navigator) {
      navigator.vibrate([100, 50, 100]);
    }
  } catch (e) {
    console.warn("Audio/Vibration not supported or blocked", e);
  }
}

export function getAvatarUrl(email?: string, gender?: string, photoURL?: string) {
  if (photoURL) return photoURL;
  const seed = email || 'default';
  if (gender === 'female') {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}&topType=longHair,turban,hijab`;
  }
  if (gender === 'male') {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}&topType=shortHair,sides,shavedSides`;
  }
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
}
