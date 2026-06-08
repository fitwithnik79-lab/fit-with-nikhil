/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [previewClientId, setPreviewClientId] = useState<string | null>(null);
  const [previewProfile, setPreviewProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
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
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login error:', error);
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

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans">
      <header className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DynamicKineticLogo size="sm" />
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-medium">{profile.displayName}</span>
              <span className="text-xs text-zinc-500 capitalize">{profile.role}</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {previewClientId && previewProfile && (
          <div className="mb-6 flex items-center justify-between bg-orange-500/10 border border-orange-500/20 p-4 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <Shield className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-white leading-none">Admin Preview Mode</p>
                <p className="text-xs text-orange-500/70 font-medium">Viewing dashboard as {previewProfile.displayName}</p>
              </div>
            </div>
            <button
              onClick={() => setPreviewClientId(null)}
              className="px-4 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20"
            >
              Exit Preview
            </button>
          </div>
        )}
        <ErrorBoundary>
          {previewClientId && previewProfile ? (
            <ClientDashboard user={user} profile={previewProfile} />
          ) : profile.role === 'admin' ? (
            <AdminDashboard user={user} profile={profile} onEnterPreview={(id) => setPreviewClientId(id)} />
          ) : !profile.onboardingComplete ? (
            <LandingPage 
              user={user} 
              profile={profile} 
              onComplete={() => setProfile({ ...profile, onboardingComplete: true })} 
            />
          ) : (
            <ClientDashboard user={user} profile={profile} />
          )}
        </ErrorBoundary>
      </main>
    </div>
  );
}
