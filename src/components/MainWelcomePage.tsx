import { motion } from 'motion/react';
import { Sparkles, Award, Users, Clock, ChevronRight, LogIn } from 'lucide-react';

interface MainWelcomePageProps {
  handleLogin: () => void;
  signingIn: boolean;
}

export default function MainWelcomePage({ handleLogin, signingIn }: MainWelcomePageProps) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans overflow-x-hidden flex flex-col justify-between">
      {/* HEADER NAVBAR */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
              <span className="font-sans text-xs font-bold uppercase tracking-widest text-zinc-300">Fit with Nik</span>
            </div>
          </div>
          <button
            onClick={handleLogin}
            disabled={signingIn}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl text-xs font-bold uppercase tracking-wider border border-zinc-800 transition-all disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" />
            {signingIn ? 'Signing In...' : 'Sign In'}
          </button>
        </div>
      </header>

      {/* HERO & DETAILS SECTION */}
      <main className="flex-1 py-12 md:py-20 flex items-center justify-center">
        <div className="max-w-4xl w-full px-6 space-y-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-12"
          >
            {/* Top Badge & Text */}
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

            {/* Coach Nik Highlight Profile Card */}
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
                    <div className="text-2xl font-bold text-orange-550">500+</div>
                    <div className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest">Success Stories</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Features Info Tri-Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-zinc-900 p-8 rounded-[32px] border border-zinc-800 space-y-4 hover:border-orange-500/30 transition-colors">
                <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center text-orange-500">
                  <Award className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold">Clinical Expertise</h3>
                <p className="text-zinc-550 text-sm leading-relaxed text-zinc-400">
                  With a Masters in Sports Physiotherapy, Nik ensures your training is not just effective, but safe and scientifically sound.
                </p>
              </div>
              <div className="bg-zinc-900 p-8 rounded-[32px] border border-zinc-800 space-y-4 hover:border-orange-500/30 transition-colors">
                <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center text-orange-500">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold">Global Impact</h3>
                <p className="text-zinc-550 text-sm leading-relaxed text-zinc-400">
                  Certified internationally, Nik has helped over 500+ clients worldwide achieve life-changing transformations.
                </p>
              </div>
              <div className="bg-zinc-900 p-8 rounded-[32px] border border-zinc-800 space-y-4 hover:border-orange-500/30 transition-colors">
                <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center text-orange-500">
                  <Clock className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold">24/7 Mentorship</h3>
                <p className="text-zinc-550 text-sm leading-relaxed text-zinc-400">
                  Get direct access to Nik's expertise with constant support and weekly program adjustments tailored to your progress.
                </p>
              </div>
            </div>

            {/* Google Authentication CTA Button */}
            <div className="flex justify-center pt-4">
              <button
                onClick={handleLogin}
                disabled={signingIn}
                className="group flex items-center gap-3 bg-orange-500 text-white font-bold py-4 px-10 rounded-2xl hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50"
              >
                {signingIn ? 'Signing In...' : 'Sign In with Google'}
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </motion.div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-zinc-900 py-6 bg-zinc-950">
        <div className="max-w-7xl mx-auto px-6 text-center text-zinc-500 font-mono tracking-wider text-xs">
          © {new Date().getFullYear()} FIT WITH NIK. ALL RIGHTS RESERVED. CLINICAL ATHLETIC PROTOCOLS.
        </div>
      </footer>
    </div>
  );
}
