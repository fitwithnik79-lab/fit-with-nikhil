/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { doc, getDoc, getDocFromCache, setDoc, updateDoc, collection, query, where, onSnapshot, orderBy, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { UserProfile, UserRole } from './types';
import { handleFirestoreError, OperationType } from './lib/firestoreErrors';
import { LogIn, LogOut, Dumbbell, LayoutDashboard, CheckCircle, Calendar, MessageSquare, Plus, Edit2, Trash2, ExternalLink, ChevronRight, ChevronLeft, Menu, X, Trophy, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import AdminDashboard from './components/AdminDashboard';
import ClientDashboard from './components/ClientDashboard';
import LandingPage from './components/LandingPage';
import MainWelcomePage from './components/MainWelcomePage';
import ErrorBoundary from './components/ErrorBoundary';
import { DynamicKineticLogo } from './components/DynamicKineticLogo';
import { NotificationBanner } from './components/NotificationBanner';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [previewClientId, setPreviewClientId] = useState<string | null>(null);
  const [previewProfile, setPreviewProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    // Check for redirect result on load
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          console.log("Logged in via redirect successfully:", result.user.email);
        }
      })
      .catch((error) => {
        console.error("Redirect login error:", error);
      });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef).catch(async (err) => {
            console.warn(`getDoc failed for users/${user.uid} (possibly offline), attempting cache fallback:`, err);
            try {
              return await getDocFromCache(userDocRef);
            } catch (cacheErr) {
              handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
              return null;
            }
          });
          
          const isAdminEmail = user.email?.toLowerCase() === 'fitwithnik79@gmail.com';
          
          if (userDoc && userDoc.exists()) {
            const userData = userDoc.data() as UserProfile;
            const updateFields: any = { lastLogin: serverTimestamp() };
            
            // Sync photoURL if available from Google Auth but missing in database
            if (user.photoURL && !userData.photoURL) {
              updateFields.photoURL = user.photoURL;
              userData.photoURL = user.photoURL;
            }
            
            // Sync admin role if needed
            if (isAdminEmail && userData.role !== 'admin') {
              const updatedProfile = { ...userData, ...updateFields, role: 'admin' as UserRole };
              updateDoc(userDocRef, { ...updateFields, role: 'admin' }).catch(err => console.error("Error syncing admin role:", err));
              setProfile(updatedProfile);
            } else {
              updateDoc(userDocRef, updateFields).catch(err => console.error("Error updating last login:", err));
              setProfile({ ...userData, ...updateFields });
            }
          } else if (!userDoc) {
            // Handle offline case where no cached profile exists yet. Fallback to auth metadata to prevent blocking user.
            const fallbackProfile: UserProfile = {
              uid: user.uid,
              email: user.email || '',
              role: isAdminEmail ? 'admin' : 'client',
              displayName: user.displayName || user.email?.split('@')[0] || 'User',
              photoURL: user.photoURL || '',
              createdAt: serverTimestamp(),
              onboardingComplete: true
            };
            setProfile(fallbackProfile);
          } else {
            // New user
            const newProfile: UserProfile = {
              uid: user.uid,
              email: user.email || '',
              role: isAdminEmail ? 'admin' : 'client',
              displayName: user.displayName || '',
              photoURL: user.photoURL || '',
              createdAt: serverTimestamp(),
            };
            await setDoc(userDocRef, newProfile).catch(err => handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`));
            setProfile(newProfile);
          }
        } catch (error) {
          console.error('Error in auth state change:', error);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setSigningIn(true);
    const provider = new GoogleAuthProvider();
    
    // Check if the user is on a mobile device or tablet to prefer redirect over popup
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
      try {
        await signInWithRedirect(auth, provider);
      } catch (error) {
        console.error('Mobile redirect login error:', error);
        setSigningIn(false);
      }
      return;
    }

    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.warn('Popup login blocked or failed. Attempting fallback redirect...', error);
      // Fallback to redirect on popup failure (e.g. popup blocker active)
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        try {
          await signInWithRedirect(auth, provider);
        } catch (redirectError) {
          console.error('Fallback redirect login error:', redirectError);
        }
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleLogout = () => signOut(auth);

  useEffect(() => {
    if (previewClientId) {
      setLoading(true);
      const docRef = doc(db, 'users', previewClientId);
      getDoc(docRef)
        .catch(async () => {
          try {
            return await getDocFromCache(docRef);
          } catch {
            return null;
          }
        })
        .then((docSnap) => {
          if (docSnap && docSnap.exists()) {
            setPreviewProfile({ uid: docSnap.id, ...docSnap.data() } as UserProfile);
          }
          setLoading(false);
        });
    } else {
      setPreviewProfile(null);
    }
  }, [previewClientId]);

  // Spatial bloom & scroll dynamics
  const [scrollProgress, setScrollProgress] = useState(0);
  const [bloomIntensity, setBloomIntensity] = useState(1);

  useEffect(() => {
    let lastActivity = Date.now();
    let frameId: number;

    const handleScroll = () => {
      const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (totalScroll > 0) {
        setScrollProgress(window.scrollY / totalScroll);
      }
      lastActivity = Date.now();
    };

    const handleActivity = () => {
      lastActivity = Date.now();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('mousedown', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });

    const updateBloom = () => {
      const now = Date.now();
      const msSinceActivity = now - lastActivity;
      
      // Calculate dynamic decay/bloom scale
      let target = 1.0;
      if (msSinceActivity < 1800) {
        const factor = (1800 - msSinceActivity) / 1800;
        target = 1.0 + factor * 1.2; // Up to 2.2x ambient intensity on interaction
      }
      
      setBloomIntensity((prev) => prev + (target - prev) * 0.05);
      frameId = requestAnimationFrame(updateBloom);
    };

    frameId = requestAnimationFrame(updateBloom);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      cancelAnimationFrame(frameId);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        >
          <Dumbbell className="w-12 h-12 text-orange-500" />
        </motion.div>
      </div>
    );
  }

  if (!user || !profile) {
    return <MainWelcomePage handleLogin={handleLogin} signingIn={signingIn} />;
  }

  // Bypasses the nested margins/headers for client view or client preview to ensure perfect full screen mobile rendering
  const isClientViewActive = (profile.role === 'client' && profile.onboardingComplete) || (previewClientId && previewProfile);

  if (isClientViewActive) {
    const activeProfile = (previewClientId && previewProfile) ? previewProfile : profile;
    return (
      <div className="min-h-screen bg-black text-white relative">
        <NotificationBanner userId={user?.uid} />
        
        {previewClientId && previewProfile && (
          <div className="fixed bottom-6 left-6 z-[120] flex items-center gap-4 bg-orange-500 text-white border border-orange-400 p-4 rounded-2xl shadow-2xl animate-fadeIn">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-white/20 rounded-lg">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-xs font-black leading-none uppercase tracking-wider">Preview Mode</p>
                <p className="text-[10px] text-orange-100 font-bold uppercase tracking-wider">{previewProfile.displayName}</p>
              </div>
            </div>
            <button
              onClick={() => setPreviewClientId(null)}
              className="px-3 py-1.5 bg-white text-orange-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-orange-50 transition-all shadow-md cursor-pointer"
            >
              Exit
            </button>
          </div>
        )}

        <ErrorBoundary>
          <ClientDashboard 
            user={user} 
            profile={activeProfile} 
            onLogout={handleLogout} 
          />
        </ErrorBoundary>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans relative overflow-x-hidden pb-12">
      {/* Ambient background spatial glow blobs */}
      <div className="fixed -top-40 -left-40 w-96 h-96 bg-orange-500/15 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="fixed top-1/4 -right-40 w-[500px] h-[500px] bg-orange-600/5 rounded-full blur-[150px] pointer-events-none z-0" />
      <div className="fixed -bottom-40 left-1/4 w-[600px] h-[600px] bg-zinc-500/5 rounded-full blur-[180px] pointer-events-none z-0" />

      {/* Dynamic Secondary Bloom Layer - Physically responds to scroll & user activity */}
      <motion.div 
        className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
        style={{
          opacity: 0.4 * bloomIntensity,
        }}
      >
        <motion.div 
          className="absolute w-[600px] h-[600px] rounded-full bg-gradient-to-br from-orange-500/10 to-orange-600/0 blur-[130px]"
          animate={{
            x: -100 + scrollProgress * 150,
            y: 100 - scrollProgress * 100,
            scale: 0.9 + bloomIntensity * 0.15,
          }}
          transition={{ type: 'spring', damping: 25, stiffness: 60 }}
        />
        <motion.div 
          className="absolute right-[-10%] top-[40%] w-[550px] h-[550px] rounded-full bg-gradient-to-bl from-orange-600/5 to-zinc-500/0 blur-[140px]"
          animate={{
            x: 50 - scrollProgress * 200,
            y: -50 + scrollProgress * 150,
            scale: 0.85 + bloomIntensity * 0.2,
          }}
          transition={{ type: 'spring', damping: 30, stiffness: 50 }}
        />
      </motion.div>

      <header className="sticky top-4 z-50 px-4 max-w-7xl mx-auto mt-4">
        <div className="bg-zinc-900/40 backdrop-blur-2xl border border-white/10 rounded-2xl md:rounded-full px-6 py-3 flex items-center justify-between shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2">
            <DynamicKineticLogo size="sm" />
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-semibold tracking-wide">{profile.displayName}</span>
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest bg-zinc-950/60 border border-white/5 px-2 py-0.5 rounded-full">{profile.role}</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 rounded-xl transition-all text-zinc-400 hover:text-white cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 relative z-10">
        <NotificationBanner userId={user?.uid} />
        <ErrorBoundary>
          {profile.role === 'admin' ? (
            <AdminDashboard user={user} profile={profile} onEnterPreview={(id) => setPreviewClientId(id)} />
          ) : (
            <LandingPage 
              user={user} 
              profile={profile} 
              onComplete={() => setProfile({ ...profile, onboardingComplete: true })} 
            />
          )}
        </ErrorBoundary>
      </main>
    </div>
  );
}
