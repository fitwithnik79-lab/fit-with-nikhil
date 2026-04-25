import { useState } from 'react';
import { motion } from 'motion/react';
import { User } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { Dumbbell, Target, Ruler, Scale, ChevronRight, Sparkles, Award, Users, Clock, Activity } from 'lucide-react';
import { cn } from '../lib/utils';

interface LandingPageProps {
  user: User;
  profile: UserProfile;
  onComplete: () => void;
}

export default function LandingPage({ user, profile, onComplete }: LandingPageProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    height: '',
    weight: '',
    gender: '',
    chosenProgram: 'Weight Loss'
  });
  const [submitting, setSubmitting] = useState(false);

  const programs = [
    { name: 'Weight Loss', description: 'Focus on fat loss and metabolic health.' },
    { name: 'Muscle Gain', description: 'Build lean muscle mass and strength.' },
    { name: 'General Fitness', description: 'Improve overall health and longevity.' },
    { name: 'Athletic Performance', description: 'Sport-specific training and explosive power.' }
  ];

  const handleNext = () => setStep(step + 1);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        ...formData,
        onboardingComplete: true
      }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`));
      onComplete();
    } catch (error) {
      console.error('Error completing onboarding:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center py-12">
      <div className="max-w-4xl w-full">
        {step === 1 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-12"
          >
            <div className="text-center space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/10 rounded-full text-orange-500 text-sm font-bold border border-orange-500/20">
                <Sparkles className="w-4 h-4" />
                <span>Join the Elite 1%</span>
              </div>
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-tight">
                Fit with <span className="text-orange-500">Nik</span>
              </h1>
              <p className="text-zinc-400 text-xl max-w-2xl mx-auto leading-relaxed">
                Transform your physique and mindset with world-class coaching from an international expert.
              </p>
            </div>

            <div className="relative group rounded-[40px] overflow-hidden border border-zinc-800 shadow-2xl shadow-orange-500/5">
              <img 
                src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=2070&auto=format&fit=crop" 
                alt="Fitness Motivation" 
                className="w-full h-[400px] object-cover transition-transform duration-700 group-hover:scale-105"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
              <div className="absolute bottom-8 left-8 right-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold">Coach Nik</h2>
                  <div className="flex flex-wrap gap-3">
                    <span className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold border border-white/10">Masters in Sports Physiotherapy</span>
                    <span className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold border border-white/10">Certified International Trainer</span>
                  </div>
                </div>
                <div className="flex gap-8">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-500">7+</div>
                    <div className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest">Years Exp</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-500">500+</div>
                    <div className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest">Success Stories</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-zinc-900 p-8 rounded-[32px] border border-zinc-800 space-y-4 hover:border-orange-500/30 transition-colors">
                <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center text-orange-500">
                  <Award className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold">Clinical Expertise</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">
                  With a Masters in Sports Physiotherapy, Nik ensures your training is not just effective, but safe and scientifically sound.
                </p>
              </div>
              <div className="bg-zinc-900 p-8 rounded-[32px] border border-zinc-800 space-y-4 hover:border-orange-500/30 transition-colors">
                <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center text-orange-500">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold">Global Impact</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">
                  Certified internationally, Nik has helped over 500+ clients worldwide achieve life-changing transformations.
                </p>
              </div>
              <div className="bg-zinc-900 p-8 rounded-[32px] border border-zinc-800 space-y-4 hover:border-orange-500/30 transition-colors">
                <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center text-orange-500">
                  <Clock className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold">24/7 Mentorship</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">
                  Get direct access to Nik's expertise with constant support and weekly program adjustments tailored to your progress.
                </p>
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={handleNext}
                className="group flex items-center gap-3 bg-orange-500 text-white font-bold py-4 px-10 rounded-2xl hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20"
              >
                Let's Get Started
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="max-w-md mx-auto space-y-8"
          >
            <div className="text-center space-y-2">
              <div className="inline-flex p-4 bg-orange-500/10 rounded-full text-orange-500 mb-4">
                <Sparkles className="w-8 h-8" />
              </div>
              <h2 className="text-3xl font-bold">Tell us about yourself</h2>
              <p className="text-zinc-500">This helps Nik design the perfect plan for you.</p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-3 h-3" /> Gender
                </label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-white focus:ring-1 focus:ring-orange-500 outline-none transition-all"
                >
                  <option value="">Select Gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                  <Ruler className="w-3 h-3" /> Height (cm)
                </label>
                <input
                  type="number"
                  value={formData.height}
                  onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                  placeholder="e.g. 180"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-white focus:ring-1 focus:ring-orange-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                  <Scale className="w-3 h-3" /> Weight (kg)
                </label>
                <input
                  type="number"
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                  placeholder="e.g. 75"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-white focus:ring-1 focus:ring-orange-500 outline-none transition-all"
                />
              </div>

              <button
                onClick={handleNext}
                disabled={!formData.height || !formData.weight || !formData.gender}
                className="w-full bg-white text-black font-bold py-4 rounded-2xl hover:bg-zinc-200 disabled:opacity-50 transition-all"
              >
                Next Step
              </button>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-8"
          >
            <div className="text-center space-y-2">
              <div className="inline-flex p-4 bg-orange-500/10 rounded-full text-orange-500 mb-4">
                <Target className="w-8 h-8" />
              </div>
              <h2 className="text-3xl font-bold">Choose your program</h2>
              <p className="text-zinc-500">Select the goal that best describes your ambition.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {programs.map((p) => (
                <button
                  key={p.name}
                  onClick={() => setFormData({ ...formData, chosenProgram: p.name })}
                  className={cn(
                    "text-left p-6 rounded-3xl border transition-all space-y-2",
                    formData.chosenProgram === p.name
                      ? "bg-orange-500 border-orange-500 text-black shadow-xl shadow-orange-500/20"
                      : "bg-zinc-900 border-zinc-800 text-white hover:border-zinc-700"
                  )}
                >
                  <h4 className="font-bold text-lg">{p.name}</h4>
                  <p className={cn(
                    "text-sm leading-relaxed",
                    formData.chosenProgram === p.name ? "text-black/70" : "text-zinc-500"
                  )}>
                    {p.description}
                  </p>
                </button>
              ))}
            </div>

            <div className="flex gap-4 max-w-md mx-auto">
              <button
                onClick={() => setStep(2)}
                className="flex-1 py-4 border border-zinc-800 rounded-2xl font-bold text-zinc-400 hover:bg-zinc-900 transition-all"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-[2] bg-orange-500 text-white font-bold py-4 rounded-2xl hover:bg-orange-600 disabled:opacity-50 transition-all shadow-xl shadow-orange-500/20"
              >
                {submitting ? 'Creating your profile...' : 'Complete Setup'}
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
