/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, onSnapshot, orderBy, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { UserProfile, UserRole } from './types';
import { handleFirestoreError, OperationType } from './lib/firestoreErrors';
import { LogIn, LogOut, Dumbbell, LayoutDashboard, CheckCircle, Calendar, MessageSquare, Plus, Edit2, Trash2, ExternalLink, ChevronRight, ChevronLeft, Menu, X, Trophy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import AdminDashboard from './components/AdminDashboard';
import ClientDashboard from './components/ClientDashboard';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef).catch(err => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`));
          
          if (!userDoc) return; // Error handled

          const isAdminEmail = user.email === 'fitwithnik79@gmail.com';
          
          if (userDoc.exists()) {
            const userData = userDoc.data() as UserProfile;
            // Sync admin role if email matches but role is not admin
            if (isAdminEmail && userData.role !== 'admin') {
              const updatedProfile = { ...userData, role: 'admin' as UserRole };
              await updateDoc(userDocRef, { role: 'admin' }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`));
              setProfile(updatedProfile);
            } else {
              setProfile(userData);
            }
          } else {
            // New user
            const newProfile: UserProfile = {
              uid: user.uid,
              email: user.email || '',
              role: isAdminEmail ? 'admin' : 'client',
              displayName: user.displayName || '',
              createdAt: serverTimestamp(),
            };
            await setDoc(userDocRef, newProfile).catch(err => handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`));
            setProfile(newProfile);
          }
        } catch (error) {
          console.error('Error in auth state change:', error);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = () => signOut(auth);

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
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="space-y-2">
            <div className="flex justify-center">
              <div className="p-4 bg-orange-500/10 rounded-full">
                <Dumbbell className="w-16 h-16 text-orange-500" />
              </div>
            </div>
            <h1 className="text-4xl font-bold text-white tracking-tight">Fit with Nik</h1>
            <p className="text-zinc-400">Your premium fitness coaching experience.</p>
          </div>
          
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white text-black font-semibold py-4 px-6 rounded-xl hover:bg-zinc-200 transition-colors"
          >
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans">
      <header className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-6 h-6 text-orange-500" />
            <span className="font-bold text-xl tracking-tight">FIT WITH NIK</span>
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
        {profile.role === 'admin' ? (
          <AdminDashboard user={user} profile={profile} />
        ) : (
          <ClientDashboard user={user} profile={profile} />
        )}
      </main>
    </div>
  );
}
