import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Check, ChevronRight, User, Star, Activity, 
  Sparkles, Award, Users, Clock, ArrowRight, Dumbbell, ShieldAlert
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface MainWelcomePageProps {
  handleLogin: () => void;
  signingIn: boolean;
}

export default function MainWelcomePage({ handleLogin, signingIn }: MainWelcomePageProps) {
  // Navigation active indicators
  const [activeSection, setActiveSection] = useState('hero');
  const [navLogoVisible, setNavLogoVisible] = useState(false);
  
  // Custom cursor position state
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [ringPos, setRingPos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Stats Counter values
  const [clientsCount, setClientsCount] = useState(0);
  const [successRate, setSuccessRate] = useState(0);
  const [experienceYears, setExperienceYears] = useState(0);
  const [satisfactionRating, setSatisfactionRating] = useState(0);

  // Sticky transformation progress (0 to 1)
  const [scrollProgress, setScrollProgress] = useState(0);
  const stickyRef = useRef<HTMLDivElement>(null);

  // Admission Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState(1);
  const [modalProgram, setModalProgram] = useState('General Elite Coaching');
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Dual Before/After manual slider factor (backup view mode)
  const [manualSliderPercentage, setManualSliderPercentage] = useState(50);
  const sliderContainerRef = useRef<HTMLDivElement>(null);

  // Check touch devices & tracking mouse position
  useEffect(() => {
    const checkCoarse = window.matchMedia('(pointer: coarse)').matches;
    setIsMobile(checkCoarse);

    if (!checkCoarse) {
      const handleMouseMove = (e: MouseEvent) => {
        setMousePos({ x: e.clientX, y: e.clientY });
      };
      window.addEventListener('mousemove', handleMouseMove);
      return () => window.removeEventListener('mousemove', handleMouseMove);
    }
  }, []);

  // Soft cursor ring interpolation (Lerp effect)
  useEffect(() => {
    if (isMobile) return;
    let rId: number;
    const updateRing = () => {
      setRingPos(prev => {
        const dx = mousePos.x - prev.x;
        const dy = mousePos.y - prev.y;
        return {
          x: prev.x + dx * 0.15,
          y: prev.y + dy * 0.15
        };
      });
      rId = requestAnimationFrame(updateRing);
    };
    rId = requestAnimationFrame(updateRing);
    return () => cancelAnimationFrame(rId);
  }, [mousePos, isMobile]);

  // Monitor Scroll Activities
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const vh = window.innerHeight;

      // Brand Logo visibility inside navbar
      setNavLogoVisible(scrollY > vh * 0.45);

      // Section tracking for active tab highlights
      const sections = ['hero', 'programs', 'sticky-transformation', 'coach'];
      for (const sectionId of sections) {
        const el = document.getElementById(sectionId);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= vh * 0.45 && rect.bottom >= vh * 0.35) {
            setActiveSection(sectionId);
            break;
          }
        }
      }

      // Calculate Sticky Transformation transition factor based on viewport coordinates
      if (stickyRef.current) {
        const rect = stickyRef.current.getBoundingClientRect();
        const startOffset = window.pageYOffset + rect.top;
        const totalHeight = rect.height;
        const progress = (window.pageYOffset - startOffset) / (totalHeight - vh);
        setScrollProgress(Math.max(0, Math.min(1, progress)));
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Stats incremental animation trigger on mount
  useEffect(() => {
    let startTime: number | null = null;
    const duration = 2000; // 2 seconds

    const runCounters = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Cubic ease-out
      const easeVal = 1 - Math.pow(1 - progress, 3);

      setClientsCount(Math.floor(easeVal * 500));
      setSuccessRate(Math.floor(easeVal * 98));
      setExperienceYears(Math.floor(easeVal * 7));
      setSatisfactionRating(parseFloat((easeVal * 4.9).toFixed(1)));

      if (progress < 1) {
        requestAnimationFrame(runCounters);
      }
    };

    requestAnimationFrame(runCounters);
  }, []);

  // Handlers for manual slider slide
  const handleSliderMove = (clientX: number) => {
    if (sliderContainerRef.current) {
      const rect = sliderContainerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setManualSliderPercentage(percentage);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches[0]) {
      handleSliderMove(e.touches[0].clientX);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (e.buttons === 1) { // Left mouse button clicked/held
      handleSliderMove(e.clientX);
    }
  };

  // Inquiry Submission
  const handleModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (modalStep === 1) {
      setModalStep(2);
    } else {
      setModalStep(3);
      confetti({
        particleCount: 100,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#ff4d00', '#ffffff', '#121212']
      });
    }
  };

  // Nav indicator calculations helpers
  const getNavPillStyle = (id: string) => {
    return activeSection === id 
      ? "relative z-10 px-4 py-1.5 text-[10px] font-bold font-sans uppercase tracking-[0.2em] text-brandAccent transition-colors duration-300" 
      : "relative z-10 px-4 py-1.5 text-[10px] font-bold font-sans uppercase tracking-[0.2em] text-zinc-400 hover:text-white transition-colors duration-300";
  };

  const handleOpenInquiry = (program: string) => {
    setModalProgram(program);
    setModalStep(1);
    setModalOpen(true);
  };

  // 3D card tilt handler
  const handleCardTilt = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2;
    const mouseY = e.clientY - rect.top - rect.height / 2;
    const rotY = (mouseX / (rect.width / 2)) * 10;
    const rotX = -(mouseY / (rect.height / 2)) * 10;
    card.style.transform = `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.02, 1.02, 1.02)`;
    
    const glow = card.querySelector('.card-glow') as HTMLDivElement;
    if (glow) {
      const pX = ((e.clientX - rect.left) / rect.width) * 100;
      const pY = ((e.clientY - rect.top) / rect.height) * 100;
      glow.style.background = `radial-gradient(circle 160px at ${pX}% ${pY}%, rgba(255, 77, 0, 0.15), transparent)`;
    }
  };

  const handleCardLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    const glow = card.querySelector('.card-glow') as HTMLDivElement;
    if (glow) glow.style.background = 'transparent';
  };

  return (
    <div className="relative min-h-screen bg-brandDark text-brandLight font-sans overflow-x-hidden">
      {/* Visual Grain Texture */}
      <div className="grain-overlay" />

      {/* Luxury Trailing Cursor */}
      {!isMobile && (
        <>
          <div 
            style={{ left: `${mousePos.x}px`, top: `${mousePos.y}px` }}
            className={`fixed w-2.5 h-2.5 rounded-full bg-brandAccent pointer-events-none z-[10000] -translate-x-1/2 -translate-y-1/2 transition-all duration-75 ${isHovering ? 'scale-[2.5] bg-white mix-blend-difference' : ''}`}
          />
          <div 
            style={{ left: `${ringPos.x}px`, top: `${ringPos.y}px` }}
            className={`fixed w-8 h-8 rounded-full border border-brandAccent/40 pointer-events-none z-[10000] -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ${isHovering ? 'scale-150 border-brandAccent text-brandAccent bg-brandAccent/10' : ''}`}
          />
        </>
      )}

      {/* FLOAT BAR NAVBAR */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-[900] w-[92%] max-w-4xl flex items-center justify-between px-6 py-3 bg-[#0a0a0af2] backdrop-blur-[24px] border border-white/[0.08] rounded-full shadow-[0_25px_50px_-12px_rgba(0,0,0,0.85)]">
        <a 
          href="#hero" 
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('hero')?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="flex items-center gap-2"
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          <div className={`flex items-center gap-1.5 transition-all duration-500 ease-out ${navLogoVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}>
            <span className="font-display text-2xl tracking-wider text-white">FIT WITH NIKHIL</span>
            <span className="w-1.5 h-1.5 rounded-full bg-brandAccent" />
          </div>
        </a>

        {/* Links */}
        <div className="relative flex items-center gap-1 bg-white/[0.02] border border-white/[0.04] p-1 rounded-full">
          <a 
            href="#hero" 
            onClick={(e) => { e.preventDefault(); document.getElementById('hero')?.scrollIntoView({ behavior: 'smooth' }); }}
            className={getNavPillStyle('hero')}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            Home
          </a>
          <a 
            href="#programs" 
            onClick={(e) => { e.preventDefault(); document.getElementById('programs')?.scrollIntoView({ behavior: 'smooth' }); }}
            className={getNavPillStyle('programs')}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            Programs
          </a>
          <a 
            href="#sticky-transformation" 
            onClick={(e) => { e.preventDefault(); document.getElementById('sticky-transformation')?.scrollIntoView({ behavior: 'smooth' }); }}
            className={getNavPillStyle('sticky-transformation')}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            Results
          </a>
          <a 
            href="#coach" 
            onClick={(e) => { e.preventDefault(); document.getElementById('coach')?.scrollIntoView({ behavior: 'smooth' }); }}
            className={getNavPillStyle('coach')}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            Coach
          </a>
        </div>

        {/* CTA */}
        <div>
          <button 
            onClick={handleLogin}
            disabled={signingIn}
            className="px-5 py-2 bg-brandAccent text-white select-none whitespace-nowrap hover:scale-105 active:scale-95 transition-all duration-300 rounded-full font-display text-sm tracking-widest uppercase hover:shadow-[0_0_20px_rgba(255,77,0,0.4)] disabled:opacity-50"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            {signingIn ? 'ENTERING...' : 'START NOW'}
          </button>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section id="hero" className="relative min-h-screen w-full flex flex-col md:flex-row items-stretch justify-center overflow-hidden bg-brandDark pt-20 md:pt-0">
        
        {/* Parallax typographic bg decoration */}
        <div className="absolute inset-0 z-0 select-none pointer-events-none opacity-[0.03] flex items-center justify-center">
          <div className="font-display text-[25vw] leading-none text-white whitespace-nowrap tracking-tighter select-none">
            NIKHIL ATHLETICS
          </div>
        </div>

        {/* Left Half: Premium Profile Silhouette Back glowing panel */}
        <div className="relative w-full md:w-1/2 min-h-[45vh] md:min-h-screen flex items-end justify-center overflow-hidden z-10 border-b md:border-b-0 md:border-r border-white/[0.05] bg-gradient-to-t from-brandDark via-brandDark/90 to-[#ff4d00]/[0.02]">
          <div className="absolute bottom-0 w-[85%] h-[92%] max-w-[440px] bg-gradient-to-t from-brandDark to-[#121212] rounded-t-[500px] border-t-2 border-x-2 border-brandAccent/25 flex items-center justify-center overflow-hidden relative">
            
            {/* Back glowing aura */}
            <div className="absolute bottom-0 w-[180%] h-1/2 bg-gradient-radial from-brandAccent/20 to-transparent blur-3xl rounded-full" />
            
            {/* Minimalist athletic logo icon outline */}
            <div className="absolute top-[35%] text-center opacity-30 select-none animate-pulse">
              <Dumbbell className="w-24 h-24 text-brandAccent/80 mx-auto stroke-[1]" />
              <span className="font-display text-4xl tracking-[0.25em] text-[#f5f3ee] mt-4 block">NIKHIL</span>
              <span className="font-sans text-[9px] uppercase tracking-[0.3em] text-brandAccent mt-1 block">BIOMETRIC APEX STATUS</span>
            </div>

            <div className="absolute bottom-12 text-center">
              <span className="text-zinc-500 font-mono text-[10px] tracking-[0.4em] uppercase">SYSTEM LOADING STATUS: ENCRYPTED //</span>
            </div>
          </div>
        </div>

        {/* Right Half: Strong Brand messaging, authentication CTA triggers */}
        <div className="relative w-full md:w-1/2 flex flex-col justify-center px-6 md:px-16 py-12 z-20 self-center">
          <div className="flex flex-wrap gap-2.5 mb-8">
            <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-full px-4 py-1.5">
              <span className="w-2 h-2 rounded-full bg-brandAccent animate-ping" />
              <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-[#f5f3ee]">500+ Lives Transformed</span>
            </div>
            <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-full px-4 py-1.5">
              <span className="text-xs text-brandAccent">★</span>
              <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-[#f5f3ee]">4.9 Rated Coach</span>
            </div>
            <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-full px-4 py-1.5">
              <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-brandAccent">CLINICAL PHYSIOTHERAPY METHOD</span>
            </div>
          </div>

          <h1 className="font-display text-[12vw] md:text-[6.5vw] xl:text-[7.2vw] leading-[0.85] tracking-tighter text-white font-black uppercase mb-6 text-left">
            TRANSFORM <br /> YOUR BODY.<br />
            <span className="text-brandAccent">TRANSFORM</span> <br /> YOUR LIFE.
          </h1>

          <p className="font-sans text-base font-light text-zinc-400 max-w-lg mb-8 leading-relaxed">
            Stop guessing in the gym. Elite physical outcome requires meticulous biological engineering. Work one-on-one with Coach Nikhil to align your structural postures, ignite high-octane metabolic performance, and realize sustainable density.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <button 
              onClick={handleLogin}
              disabled={signingIn}
              className="px-10 py-5 bg-brandAccent text-white rounded-full font-display text-lg tracking-widest uppercase hover:shadow-[0_0_30px_rgba(255,77,0,0.5)] transition-all duration-300 hover:scale-102 flex items-center justify-center gap-3"
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
            >
              {signingIn ? 'ENTERING BIOMETRICS...' : 'APPLY FOR COACHING'}
              <ArrowRight className="w-5 h-5" />
            </button>
            <button 
              onClick={() => document.getElementById('programs')?.scrollIntoView({ behavior: 'smooth' })}
              className="px-8 py-5 border border-white/20 hover:border-brandAccent text-white rounded-full font-display text-base tracking-widest uppercase transition-all duration-300 flex items-center justify-center"
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
            >
              EXPLORE PROTOCOLS
            </button>
          </div>
        </div>
      </section>

      {/* THREE FOCUS PROGRAMS SECTION */}
      <section id="programs" className="relative py-28 bg-brandDark border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6 mb-20 text-center">
          <span className="text-brandAccent font-display text-lg tracking-[0.25em] uppercase block mb-2">BESPOKE PROTOCOLS</span>
          <h2 className="font-display text-5xl md:text-7xl leading-tight text-white mb-4">CHOOSE YOUR FOCUS</h2>
          <div className="w-16 h-1 bg-brandAccent mx-auto" />
        </div>

        {/* 3D Tilting Cards Bento Matrix */}
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Card Shred */}
          <div 
            onMouseMove={handleCardTilt}
            onMouseLeave={handleCardLeave}
            className="card-3d relative overflow-hidden bg-[#0c0c0c] border border-white/[0.04] p-8 md:p-10 rounded-3xl flex flex-col justify-between group transition-all duration-300 ease-out min-h-[480px]"
          >
            <div className="card-glow absolute inset-0 pointer-events-none transition-opacity duration-350 opacity-100" />
            <div className="relative z-10">
              <span className="font-display text-brandAccent text-sm tracking-widest uppercase block mb-2">01 / APEX SHRED</span>
              <h3 className="font-display text-3.5xl text-white tracking-wider mb-4">SHRED</h3>
              <p className="font-sans text-sm font-light text-zinc-400 mb-8 leading-relaxed">
                Directed adipose loss while prioritizing high-end muscle fiber preservation. Tailored clinical caloric programming for busy executives.
              </p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-3 font-sans text-xs uppercase tracking-wider text-zinc-300 border-b border-white/[0.03] pb-2">
                  <span className="text-brandAccent font-bold">✔</span> Accelerated Lipolysis Layout
                </li>
                <li className="flex items-center gap-3 font-sans text-xs uppercase tracking-wider text-zinc-300 border-b border-white/[0.03] pb-2">
                  <span className="text-brandAccent font-bold">✔</span> Sparing Lean Tissue Protocols
                </li>
                <li className="flex items-center gap-3 font-sans text-xs uppercase tracking-wider text-zinc-300 pb-2">
                  <span className="text-brandAccent font-bold">✔</span> Personalized Bio-Feedback Logs
                </li>
              </ul>
            </div>
            <div className="relative z-10 w-full">
              <button 
                onClick={() => handleOpenInquiry('Apex Shred Program')}
                className="w-full py-4 bg-transparent border border-brandAccent hover:bg-brandAccent text-white font-display text-sm tracking-widest uppercase transition-all duration-300 rounded-xl hover:shadow-[0_0_15px_rgba(255,77,0,0.25)]"
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
              >
                APPLY FOR PROTOCOL
              </button>
            </div>
          </div>

          {/* Card Volume Build */}
          <div 
            onMouseMove={handleCardTilt}
            onMouseLeave={handleCardLeave}
            className="card-3d relative overflow-hidden bg-[#0c0c0c] border border-white/[0.04] p-8 md:p-10 rounded-3xl flex flex-col justify-between group transition-all duration-300 ease-out min-h-[480px]"
          >
            <div className="card-glow absolute inset-0 pointer-events-none transition-opacity duration-350 opacity-100" />
            <div className="relative z-10">
              <span className="font-display text-brandAccent text-sm tracking-widest uppercase block mb-2">02 / HYPERTROPHY CODE</span>
              <h3 className="font-display text-3.5xl text-white tracking-wider mb-4">BUILD</h3>
              <p className="font-sans text-sm font-light text-zinc-400 mb-8 leading-relaxed">
                Mechanically structured load parameters to force hyper-dense muscular hypertrophy while shielding sensitive spinal skeletal joints.
              </p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-3 font-sans text-xs uppercase tracking-wider text-zinc-300 border-b border-white/[0.03] pb-2">
                  <span className="text-brandAccent font-bold">✔</span> Progressive Tension Hypertrophy Sets
                </li>
                <li className="flex items-center gap-3 font-sans text-xs uppercase tracking-wider text-zinc-300 border-b border-white/[0.03] pb-2">
                  <span className="text-brandAccent font-bold">✔</span> Macro-Partitioning Blueprints
                </li>
                <li className="flex items-center gap-3 font-sans text-xs uppercase tracking-wider text-zinc-300 pb-2">
                  <span className="text-brandAccent font-bold">✔</span> Real-Time Structural Asymmetry Corrections
                </li>
              </ul>
            </div>
            <div className="relative z-10 w-full">
              <button 
                onClick={() => handleOpenInquiry('Hypertrophy Code Program')}
                className="w-full py-4 bg-transparent border border-brandAccent hover:bg-brandAccent text-white font-display text-sm tracking-widest uppercase transition-all duration-300 rounded-xl hover:shadow-[0_0_15px_rgba(255,77,0,0.25)]"
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
              >
                APPLY FOR PROTOCOL
              </button>
            </div>
          </div>

          {/* Card Rehab Rehab/Perf */}
          <div 
            onMouseMove={handleCardTilt}
            onMouseLeave={handleCardLeave}
            className="card-3d relative overflow-hidden bg-[#0c0c0c] border border-white/[0.04] p-8 md:p-10 rounded-3xl flex flex-col justify-between group transition-all duration-300 ease-out min-h-[480px]"
          >
            <div className="card-glow absolute inset-0 pointer-events-none transition-opacity duration-350 opacity-100" />
            <div className="relative z-10">
              <span className="font-display text-brandAccent text-sm tracking-widest uppercase block mb-2">03 / METRIC PERFORMANCE</span>
              <h3 className="font-display text-3.5xl text-white tracking-wider mb-4">ATHLETIC</h3>
              <p className="font-sans text-sm font-light text-zinc-400 mb-8 leading-relaxed">
                Unlock maximal power vectors, explosive joint kinetics, and massive lung capacity. Grounded securely in Sports Physiotherapy.
              </p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-3 font-sans text-xs uppercase tracking-wider text-zinc-300 border-b border-white/[0.03] pb-2">
                  <span className="text-brandAccent font-bold">✔</span> Explosive Speed & Power Units
                </li>
                <li className="flex items-center gap-3 font-sans text-xs uppercase tracking-wider text-zinc-300 border-b border-white/[0.03] pb-2">
                  <span className="text-brandAccent font-bold">✔</span> Biomechanical Multi-Joint Mobility
                </li>
                <li className="flex items-center gap-3 font-sans text-xs uppercase tracking-wider text-zinc-300 pb-2">
                  <span className="text-brandAccent font-bold">✔</span> Multi-System Recovery Protocols
                </li>
              </ul>
            </div>
            <div className="relative z-10 w-full">
              <button 
                onClick={() => handleOpenInquiry('Metric Performance Program')}
                className="w-full py-4 bg-transparent border border-brandAccent hover:bg-brandAccent text-white font-display text-sm tracking-widest uppercase transition-all duration-300 rounded-xl hover:shadow-[0_0_15px_rgba(255,77,0,0.25)]"
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
              >
                APPLY FOR PROTOCOL
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* STICKY TRANSFORMATION CROSSFADER SECTION */}
      <section ref={stickyRef} id="sticky-transformation" className="relative bg-[#080808] w-full border-t border-white/[0.04] min-h-[170vh] md:min-h-[220vh]">
        <div className="sticky top-0 w-full h-screen overflow-hidden flex items-center justify-center">
          
          <div className="absolute inset-0 bg-[#080808] z-0" />

          {/* Interactive Drag/Swipe comparative Slider (for excellent desktop & mobile responsive engagement) */}
          <div className="relative w-full h-[90%] flex flex-col justify-center px-4 md:px-12 z-20">
            <h2 className="font-display text-center text-4xl md:text-6xl text-white tracking-widest mb-4">THE TRANSFORMATION INDEX</h2>
            <p className="font-sans text-center text-zinc-500 text-xs md:text-sm uppercase tracking-widest mb-8 max-w-lg mx-auto">
              Real-time interactive assessment results. Click and drag the handle or scroll downwards to transform Alex's metric bio-index.
            </p>

            <div className="relative w-full max-w-4xl mx-auto h-[450px] bg-zinc-950 rounded-[32px] overflow-hidden border border-white/5 shadow-2xl">
              {/* SLIDE BEFORE CONTAINER (Left) */}
              <div className="absolute inset-0 w-full h-full flex flex-col md:flex-row items-stretch">
                {/* Visual before block */}
                <div className="w-full md:w-1/2 bg-gradient-to-br from-[#111] to-[#0a0a0a] flex items-center justify-center relative p-6">
                  <div className="w-48 h-48 rounded-full bg-zinc-900 border border-white/5 opacity-50 flex items-center justify-center relative z-20">
                    <span className="font-display text-3xl text-zinc-700 tracking-wider font-extrabold rotate-[-12deg]">BEFORE PROTOCOL</span>
                  </div>
                  <div className="absolute bottom-6 left-6 text-left">
                    <span className="text-zinc-650 font-mono text-[9px] text-zinc-600 block">SYSTEM STATUS // INACTIVE #820</span>
                    <span className="font-display text-zinc-500 text-2xl uppercase">ALEX • EXECUTIVE CONSULTANT</span>
                  </div>
                </div>

                {/* Metrics before */}
                <div className="w-full md:w-1/2 flex flex-col justify-center px-8 py-6 text-left">
                  <span className="text-zinc-500 font-display text-xs tracking-widest mb-1.5Block">BASELINE ASSESSMENT INDEX</span>
                  <p className="font-display text-4xl md:text-5xl text-zinc-500 leading-none uppercase mb-6">
                    FATIGUED. LACKING RECOVERY ALIGNMENT.
                  </p>
                  <div className="grid grid-cols-2 gap-4 max-w-xs mb-6">
                    <div className="border-l border-zinc-800 pl-3">
                      <span className="font-display text-3xl text-zinc-400">102 KG</span>
                      <span className="font-sans text-[10px] text-zinc-600 uppercase tracking-widest block mt-0.5">Weight Index</span>
                    </div>
                    <div className="border-l border-zinc-800 pl-3">
                      <span className="font-display text-3xl text-zinc-400">24.2 %</span>
                      <span className="font-sans text-[10px] text-zinc-600 uppercase tracking-widest block mt-0.5">Fat Ratio</span>
                    </div>
                  </div>
                  <p className="font-sans text-xs text-zinc-500 leading-relaxed italic max-w-sm">
                    "80-hour work weeks left my circadian alignment entirely broken. High metabolic cortisol, dependency on high caffeine, joint pain, systemic stress exhaustion."
                  </p>
                </div>
              </div>

              {/* SLIDE AFTER CONTAINER (Right Overlay with Slide transition) */}
              <div 
                style={{ 
                  clipPath: `polygon(0 0, ${scrollProgress * 100}% 0, ${scrollProgress * 100}% 100%, 0 100%)`,
                  transition: 'clip-path 0.1s ease-out'
                }}
                className="absolute inset-0 w-full h-full flex flex-col md:flex-row items-stretch bg-neutral-900 pointer-events-none select-none z-30"
              >
                {/* Visual after glowing block */}
                <div className="w-full md:w-1/2 bg-gradient-to-br from-[#1c0c02] to-[#0a0a0a] flex items-center justify-center relative p-6">
                  <div className="absolute inset-x-0 bottom-0 top-0 bg-[#ff4d00]/[0.025]" />
                  <div className="w-48 h-48 rounded-full bg-gradient-to-tr from-brandAccent/30 to-brandDark border border-brandAccent/40 flex items-center justify-center relative shadow-[0_0_50px_rgba(255,77,0,0.2)] z-20 animate-pulse">
                    <span className="font-display text-3xl text-brandAccent tracking-wider font-extrabold drop-shadow-[0_0_8px_rgba(255,77,0,0.5)]">AFTER PROTOCOL</span>
                  </div>
                  <div className="absolute bottom-6 left-6 text-left">
                    <span className="text-brandAccent font-mono text-[9px] block">SYSTEM RECORD // EXTRINSIC SUCCESS_S22</span>
                    <span className="font-display text-white text-2xl uppercase">ALEX • HIGH PERFORMANCE ATHLETE</span>
                  </div>
                </div>

                {/* Metrics after */}
                <div className="w-full md:w-1/2 flex flex-col justify-center px-8 py-6 text-left bg-zinc-950">
                  <span className="text-brandAccent font-display text-xs tracking-widest mb-1.5Block">SHRED LEVEL ACHIEVED</span>
                  <p className="font-display text-4xl md:text-5xl text-white leading-none uppercase mb-6">
                    SHREDDED. RAZOR-SHARP COGNITIVE FOCUS.
                  </p>
                  <div className="grid grid-cols-2 gap-4 max-w-xs mb-6">
                    <div className="border-l-2 border-brandAccent pl-3">
                      <span className="font-display text-3xl text-white">84 KG</span>
                      <span className="font-sans text-[10px] text-brandAccent uppercase tracking-widest block mt-0.5">Weight Index</span>
                    </div>
                    <div className="border-l-2 border-brandAccent pl-3">
                      <span className="font-display text-3xl text-white">8.5 %</span>
                      <span className="font-sans text-[10px] text-brandAccent uppercase tracking-widest block mt-0.5">Fat Ratio</span>
                    </div>
                  </div>
                  <p className="font-sans text-xs text-zinc-350 leading-relaxed italic max-w-sm">
                    "Nikhil's bio-architectural approach overhauled my physical capabilities completely. We re-calibrated postural mechanics to lift pain-free and adjusted sleep alignment."
                  </p>
                </div>
              </div>

              {/* Slider comparative dividing bar line indicator */}
              <div 
                style={{ left: `${scrollProgress * 100}%` }}
                className="absolute top-0 bottom-0 w-[2px] bg-brandAccent z-[40] pointer-events-none"
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-brandAccent border border-white flex items-center justify-center shadow-lg">
                  <span className="text-[9px] text-white">↔</span>
                </div>
              </div>
            </div>

            {/* Slider scroll pointer tag indicator */}
            <div className="mt-6 flex flex-col items-center gap-1 opacity-75">
              <span className="font-display text-xs text-brandAccent tracking-widest uppercase">
                {scrollProgress < 0.9 ? 'Scroll down to watch before convert to after' : 'Completed Assessment Success'}
              </span>
              <div className="w-5 h-8 border border-white/20 rounded-full flex justify-center p-1 mt-1">
                <div className="w-1 h-2 bg-brandAccent rounded-full animate-bounce" />
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* THREE ADDITIONAL DETAILED TRANSFORMATIONS */}
      <section id="transformations-archive" className="relative py-28 bg-[#0c0c0c] border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6 mb-20">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-brandAccent font-display text-lg tracking-[0.25em] uppercase block mb-2">PROOF IN TRANSFORMATION</span>
              <h2 className="font-display text-5xl md:text-7xl leading-tight text-white mb-4">THE RECORD ARCHIVE</h2>
              <div className="w-16 h-1 bg-brandAccent" />
            </div>
            <p className="font-sans text-sm font-light text-zinc-400 max-w-md mt-6 md:mt-0 leading-relaxed">
              Biological outcomes built purely on physical science. Read real validated transformations achieved by diverse client profiles.
            </p>
          </div>
        </div>

        {/* Triple Cards Transform */}
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
          
          <div className="relative overflow-hidden bg-brandDark border border-white/[0.04] p-8 rounded-3xl flex flex-col justify-between hover:border-brandAccent/25 transition-all duration-500">
            <div>
              <span className="font-display text-brandAccent text-sm tracking-widest block mb-4">Shed 18kg fat in 12 weeks</span>
              <h4 className="font-display text-2xl text-white tracking-wide uppercase mb-3">MARCUS L. • RISK ANALYST</h4>
              <p className="font-sans text-sm font-light text-zinc-500 leading-relaxed mb-6">
                "Before finding Nikhil, I hit plateau after plateau. His meticulous biomechanics stance saved my knee tendons while rapidly shaving down waist bloating."
              </p>
            </div>
            <div className="border-t border-white/[0.04] pt-4 flex justify-between items-center">
              <span className="font-sans text-[10px] uppercase tracking-widest text-zinc-500">Protocol: Apex Shred</span>
              <span className="text-xs text-brandAccent">★★★★★</span>
            </div>
          </div>

          <div className="relative overflow-hidden bg-brandDark border border-white/[0.04] p-8 rounded-3xl flex flex-col justify-between hover:border-brandAccent/25 transition-all duration-500">
            <div>
              <span className="font-display text-brandAccent text-sm tracking-widest block mb-4">Gained 9kg Raw Lean Mass</span>
              <h4 className="font-display text-2xl text-white tracking-wide uppercase mb-3">SOPHIA R. • FOUNDER</h4>
              <p className="font-sans text-sm font-light text-zinc-500 leading-relaxed mb-6">
                "Training under Coach Nikhil meant targeting precise peak muscular contraction profiles, resolving structural asymmetry, and macro partitioning."
              </p>
            </div>
            <div className="border-t border-white/[0.04] pt-4 flex justify-between items-center">
              <span className="font-sans text-[10px] uppercase tracking-widest text-zinc-500">Protocol: Hypertrophy Code</span>
              <span className="text-xs text-brandAccent">★★★★★</span>
            </div>
          </div>

          <div className="relative overflow-hidden bg-brandDark border border-white/[0.04] p-8 rounded-3xl flex flex-col justify-between hover:border-brandAccent/25 transition-all duration-500">
            <div>
              <span className="font-display text-brandAccent text-sm tracking-widest block mb-4">Lowered fat & tripled spine strength</span>
              <h4 className="font-display text-2xl text-white tracking-wide uppercase mb-3">DANIEL K. • OPERATIONS DIR.</h4>
              <p className="font-sans text-sm font-light text-zinc-500 leading-relaxed mb-6">
                "The metabolic diet blueprint is exceptionally logical. We optimized insulin thresholds directly which stripped visceral layers and kept my mood factor elevated."
              </p>
            </div>
            <div className="border-t border-white/[0.04] pt-4 flex justify-between items-center">
              <span className="font-sans text-[10px] uppercase tracking-widest text-zinc-500">Protocol: Athletic Metric</span>
              <span className="text-xs text-brandAccent">★★★★★</span>
            </div>
          </div>

        </div>

        {/* View assessment archives link */}
        <div className="text-center mt-12">
          <button 
            onClick={handleLogin}
            className="font-display text-base tracking-[0.2em] text-white hover:text-brandAccent transition-colors duration-300 inline-flex items-center gap-2"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            VIEW ALL DETAILED CASE ASSESSMENTS <span>→</span>
          </button>
        </div>
      </section>

      {/* MEET THE COACH SECTION */}
      <section id="coach" className="relative py-28 bg-brandDark border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center gap-12 md:gap-20">
          
          {/* Coach graphic representation card */}
          <div className="w-full md:w-1/2 flex justify-center">
            <div className="relative w-full max-w-[420px] aspect-[4/5] bg-gradient-to-tr from-brandDark via-[#151515] to-[#252525] rounded-3xl border border-white/[0.05] overflow-hidden flex items-center justify-center shadow-2xl">
              <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-brandDark opacity-90" />
              <div className="absolute inset-y-10 inset-x-6 border border-brandAccent/15 rounded-2xl flex flex-col justify-end p-6 select-none">
                <div className="flex flex-col">
                  <span className="font-display text-6xl text-white tracking-wider leading-none mb-1">NIKHIL</span>
                  <span className="font-sans text-xs text-brandAccent uppercase tracking-[0.3em] font-semibold">CHIEF BIOMECHANIST & PT</span>
                </div>
              </div>
              <div className="absolute top-0 right-0 w-[50%] h-[50%] bg-[#ff4d00]/[0.08] blur-3xl rounded-full" />
            </div>
          </div>

          {/* Coach Bio narrative */}
          <div className="w-full md:w-1/2 flex flex-col justify-center">
            <span className="text-brandAccent font-display text-lg tracking-[0.25em] uppercase block mb-2">THE ELITE STANDARD</span>
            <h2 className="font-display text-5xl md:text-7xl leading-[0.9] text-white mb-6 uppercase">
              MEET COACH <br /><span className="text-brandAccent">NIKHIL</span>
            </h2>

            <div className="flex flex-wrap gap-2 mb-8">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2 font-display text-xs tracking-wider uppercase text-[#f5f3ee]">
                ✔ Certified Personal Trainer
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2 font-display text-xs tracking-wider uppercase text-[#f5f3ee]">
                ✔ 7+ Years Experience
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2 font-display text-xs tracking-wider uppercase text-[#f5f3ee]">
                ✔ Clinical Bio-Mechanics Focus
              </div>
            </div>

            <p className="font-sans text-base font-light text-zinc-400 mb-8 leading-relaxed">
              I don't believe in mindless "hustle-till-collapse" regimes that lead to skeletal joint stress and high tendon exhaustion. My philosophy balances custom muscle recruitment patterns with clinical nutrition pathways to ensure you build clean power, correct physical posture asymmetries, and unlock elite metabolic capability.
            </p>

            {/* Live Achievement Counters */}
            <div className="grid grid-cols-2 gap-8 border-t border-white/[0.04] pt-8">
              <div>
                <span className="font-display text-5xl text-brandAccent font-black leading-none block">
                  {clientsCount}+
                </span>
                <span className="font-sans text-[11px] text-zinc-500 uppercase tracking-widest block mt-2">ACTIVE CLIENTS</span>
              </div>
              <div>
                <span className="font-display text-5xl text-brandAccent font-black leading-none block">
                  {successRate}%
                </span>
                <span className="font-sans text-[11px] text-zinc-500 uppercase tracking-widest block mt-2">SUCCESS INDEX</span>
              </div>
              <div>
                <span className="font-display text-5xl text-brandAccent font-black leading-none block">
                  {experienceYears}+
                </span>
                <span className="font-sans text-[11px] text-zinc-500 uppercase tracking-widest block mt-2">YEARS IN FIELD</span>
              </div>
              <div>
                <span className="font-display text-5xl text-brandAccent font-black leading-none block">
                  {satisfactionRating}★
                </span>
                <span className="font-sans text-[11px] text-zinc-500 uppercase tracking-widest block mt-2">SATISFACTION RATING</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* INFINITE SCROLL TESTIMONIAL TICKERS */}
      <section id="marquee" className="relative py-28 bg-[#050505] overflow-hidden border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6 mb-16 text-center">
          <span className="text-brandAccent font-display text-lg tracking-[0.25em] uppercase block mb-2">VERIFIED REPUTATION</span>
          <h2 className="font-display text-5xl md:text-7xl leading-tight text-white mb-4">THE STRONGEST VOICES</h2>
          <div className="w-16 h-1 bg-brandAccent mx-auto" />
        </div>

        {/* Oppenheimer Scrolling ticker boards */}
        <div className="flex flex-col gap-6 w-full overflow-hidden select-none">
          
          {/* Row 1 Left Sliding */}
          <div className="relative overflow-hidden flex whitespace-nowrap w-full">
            <div className="flex gap-6 animate-marquee-left">
              
              {/* Card A */}
              <div className="inline-block w-[360px] md:w-[460px] shrink-0 bg-[#0c0c0c] border border-white/[0.04] p-8 rounded-3xl relative overflow-hidden whitespace-normal">
                <span className="absolute -bottom-6 right-2 font-display text-9xl text-brandAccent/[0.02] select-none">”</span>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brandAccent to-zinc-800 flex items-center justify-center font-display text-sm text-white">RH</div>
                  <div>
                    <h4 className="font-display text-lg text-white tracking-wide uppercase">Ryan H. • Equity Partner</h4>
                    <p className="font-sans text-[10px] text-brandAccent uppercase tracking-widest">Protocol: APEX Shred</p>
                  </div>
                </div>
                <p className="font-sans text-sm font-light text-zinc-400 leading-relaxed">
                  "Working with Nikhil is structured, metric-driven, and incredibly objective. No fluff whatsoever. We engineered metabolic balance first, and the physique outcomes took care of themselves."
                </p>
              </div>

              {/* Card B */}
              <div className="inline-block w-[360px] md:w-[460px] shrink-0 bg-[#0c0c0c] border border-white/[0.04] p-8 rounded-3xl relative overflow-hidden whitespace-normal">
                <span className="absolute -bottom-6 right-2 font-display text-9xl text-brandAccent/[0.02] select-none">”</span>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brandAccent to-zinc-800 flex items-center justify-center font-display text-sm text-white">AK</div>
                  <div>
                    <h4 className="font-display text-lg text-white tracking-wide uppercase">Anirudh K. • Tech Lead</h4>
                    <p className="font-sans text-[10px] text-brandAccent uppercase tracking-widest">Protocol: Hypertrophy Code</p>
                  </div>
                </div>
                <p className="font-sans text-sm font-light text-zinc-400 leading-relaxed">
                  "My chronic lumbar postural issues was fully corrected within 4 weeks. My bone leverage feels aligned, muscular energy has peaked, and posture looks amazing."
                </p>
              </div>

              {/* Card C */}
              <div className="inline-block w-[360px] md:w-[460px] shrink-0 bg-[#0c0c0c] border border-white/[0.04] p-8 rounded-3xl relative overflow-hidden whitespace-normal">
                <span className="absolute -bottom-6 right-2 font-display text-9xl text-brandAccent/[0.02] select-none">”</span>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brandAccent to-zinc-800 flex items-center justify-center font-display text-sm text-white">TL</div>
                  <div>
                    <h4 className="font-display text-lg text-white tracking-wide uppercase">Theresa L. • Manager</h4>
                    <p className="font-sans text-[10px] text-brandAccent uppercase tracking-widest">Protocol: Apex Athletic</p>
                  </div>
                </div>
                <p className="font-sans text-sm font-light text-zinc-400 leading-relaxed">
                  "The nutrition profile map suited my travel schedule. No extreme lifestyle adjustments, yet I lost fat quickly. Outstanding coach mentorship."
                </p>
              </div>

              {/* Duplicated for loop */}
              <div className="inline-block w-[360px] md:w-[460px] shrink-0 bg-[#0c0c0c] border border-white/[0.04] p-8 rounded-3xl relative overflow-hidden whitespace-normal">
                <span className="absolute -bottom-6 right-2 font-display text-9xl text-brandAccent/[0.02] select-none">”</span>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brandAccent to-zinc-800 flex items-center justify-center font-display text-sm text-white">RH</div>
                  <div>
                    <h4 className="font-display text-lg text-white tracking-wide uppercase">Ryan H. • Equity Partner</h4>
                    <p className="font-sans text-[10px] text-brandAccent uppercase tracking-widest">Protocol: APEX Shred</p>
                  </div>
                </div>
                <p className="font-sans text-sm font-light text-zinc-400 leading-relaxed">
                  "Working with Nikhil is structured, metric-driven, and incredibly objective. No fluff whatsoever. We engineered metabolic balance first."
                </p>
              </div>

            </div>
          </div>

          {/* Row 2 Right Sliding */}
          <div className="relative overflow-hidden flex whitespace-nowrap w-full">
            <div className="flex gap-6 animate-marquee-right">
              
              {/* Card D */}
              <div className="inline-block w-[360px] md:w-[460px] shrink-0 bg-[#0c0c0c] border border-white/[0.04] p-8 rounded-3xl relative overflow-hidden whitespace-normal">
                <span className="absolute -bottom-6 right-2 font-display text-9xl text-brandAccent/[0.02] select-none">”</span>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brandAccent to-zinc-800 flex items-center justify-center font-display text-sm text-white">JM</div>
                  <div>
                    <h4 className="font-display text-lg text-white tracking-wide uppercase">Jessica M. • Obstetrician</h4>
                    <p className="font-sans text-[10px] text-brandAccent uppercase tracking-widest">Protocol: Apex Athletic</p>
                  </div>
                </div>
                <p className="font-sans text-sm font-light text-zinc-400 leading-relaxed">
                  "As a surgeon working long shifts, Coach Nikhil developed nutritional timings that fit my routine. I retained muscle and built stamina safely!"
                </p>
              </div>

              {/* Card E */}
              <div className="inline-block w-[360px] md:w-[460px] shrink-0 bg-[#0c0c0c] border border-white/[0.04] p-8 rounded-3xl relative overflow-hidden whitespace-normal">
                <span className="absolute -bottom-6 right-2 font-display text-9xl text-brandAccent/[0.02] select-none">”</span>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brandAccent to-zinc-800 flex items-center justify-center font-display text-sm text-white">DK</div>
                  <div>
                    <h4 className="font-display text-lg text-white tracking-wide uppercase">Daniel K. • Partner</h4>
                    <p className="font-sans text-[10px] text-brandAccent uppercase tracking-widest">Protocol: Hypertrophy Code</p>
                  </div>
                </div>
                <p className="font-sans text-sm font-light text-zinc-400 leading-relaxed">
                  "Progressive tracking. Nikhil measures overload parameters with surgical precision. Best athletic mentorship in the market."
                </p>
              </div>

              {/* Card F */}
              <div className="inline-block w-[360px] md:w-[460px] shrink-0 bg-[#0c0c0c] border border-white/[0.04] p-8 rounded-3xl relative overflow-hidden whitespace-normal">
                <span className="absolute -bottom-6 right-2 font-display text-9xl text-brandAccent/[0.02] select-none">”</span>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brandAccent to-zinc-800 flex items-center justify-center font-display text-sm text-white">CH</div>
                  <div>
                    <h4 className="font-display text-lg text-white tracking-wide uppercase">Chris H. • Pilot</h4>
                    <p className="font-sans text-[10px] text-brandAccent uppercase tracking-widest">Protocol: APEX Shred</p>
                  </div>
                </div>
                <p className="font-sans text-sm font-light text-zinc-400 leading-relaxed">
                  "The cleanest personal training framework you'll ever deploy. It overhauled my cardiovascular levels and systemic productivity factor."
                </p>
              </div>

              {/* Duplicated for loop */}
              <div className="inline-block w-[360px] md:w-[460px] shrink-0 bg-[#0c0c0c] border border-white/[0.04] p-8 rounded-3xl relative overflow-hidden whitespace-normal">
                <span className="absolute -bottom-6 right-2 font-display text-9xl text-brandAccent/[0.02] select-none">”</span>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brandAccent to-zinc-800 flex items-center justify-center font-display text-sm text-white">CH</div>
                  <div>
                    <h4 className="font-display text-lg text-white tracking-wide uppercase">Chris H. • Pilot</h4>
                    <p className="font-sans text-[10px] text-brandAccent uppercase tracking-widest">Protocol: APEX Shred</p>
                  </div>
                </div>
                <p className="font-sans text-sm font-light text-zinc-400 leading-relaxed">
                  "The cleanest personal training framework you'll ever deploy. Overhauled my cardiovascular levels completely."
                </p>
              </div>

            </div>
          </div>

        </div>
      </section>

      {/* FOOTER LEAD CAPTURE CTA WRAP */}
      <footer className="relative bg-brandDark py-24 border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-12">
          <div>
            <h2 className="font-display text-4xl md:text-5xl text-white mb-2 tracking-wider">FIT WITH NIKHIL</h2>
            <p className="font-sans text-xs text-zinc-500 uppercase tracking-widest leading-relaxed">
              © 2026 Fit With Nikhil. Biomechanics & Rehabilitation Clinical Focus Coaching.
            </p>
          </div>
          <div>
            <button 
              onClick={handleLogin}
              className="px-10 py-5 bg-brandAccent text-white rounded-full font-display text-lg tracking-widest uppercase hover:shadow-[0_0_30px_rgba(255,77,0,0.5)] transition-all duration-300 hover:scale-105 active:scale-95"
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
            >
              APPLY FOR ADMISSION
            </button>
          </div>
        </div>
      </footer>

      {/* MULTI-STEP CONVERSION ENQUIRY FORM MODAL */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-[#0c0c0c] border border-white/[0.08] w-full max-w-lg p-8 md:p-10 rounded-3xl relative overflow-hidden shadow-2xl"
            >
              <button 
                onClick={() => setModalOpen(false)}
                className="absolute top-6 right-6 text-zinc-400 hover:text-white transition-colors duration-300 cursor-pointer p-1"
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
              >
                <X className="w-6 h-6" />
              </button>

              {modalStep === 1 && (
                <form onSubmit={handleModalSubmit} className="space-y-5">
                  <span className="text-brandAccent font-display text-xs tracking-widest uppercase block mb-1">Step 1 of 2</span>
                  <h3 className="font-display text-3xl text-white tracking-wider mb-2">PERSONAL BIO PROFILE</h3>
                  <p className="text-zinc-500 text-xs mb-6">Enter your contact parameters so Coach Nikhil can follow up directly.</p>

                  <div className="space-y-2">
                    <label className="font-sans text-[10px] uppercase tracking-widest text-[#f5f3ee] block font-bold">Your Full Name</label>
                    <input 
                      type="text" 
                      required 
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-white/[0.08] py-4 px-5 rounded-xl font-sans text-sm text-white focus:outline-none focus:border-brandAccent transition-colors"
                      placeholder="e.g. Marcus Mitchell"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="font-sans text-[10px] uppercase tracking-widest text-[#f5f3ee] block font-bold">Email Address</label>
                    <input 
                      type="email" 
                      required 
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-white/[0.08] py-4 px-5 rounded-xl font-sans text-sm text-white focus:outline-none focus:border-brandAccent transition-colors"
                      placeholder="e.g. marcus@corporate.com"
                    />
                  </div>

                  <button 
                    type="submit" 
                    className="w-full py-4.5 py-4 bg-brandAccent text-white font-display text-base tracking-widest uppercase rounded-xl hover:scale-[1.01] active:scale-[0.99] transition-all duration-300 mt-6"
                    onMouseEnter={() => setIsHovering(true)}
                    onMouseLeave={() => setIsHovering(false)}
                  >
                    CONTINUE ANALYSIS
                  </button>
                </form>
              )}

              {modalStep === 2 && (
                <form onSubmit={handleModalSubmit} className="space-y-5">
                  <span className="text-brandAccent font-display text-xs tracking-widest uppercase block mb-1">Step 2 of 2</span>
                  <h3 className="font-display text-3xl text-white tracking-wider mb-2">PHYSICAL OBJECTIVE</h3>
                  <p className="text-zinc-500 text-xs mb-6">Tell Coach Nikhil about your baseline weight and primary physique limits.</p>

                  <div className="space-y-2">
                    <label className="font-sans text-[10px] uppercase tracking-widest text-[#f5f3ee] block font-bold">Selected Program focus</label>
                    <select 
                      value={modalProgram}
                      onChange={(e) => setModalProgram(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-white/[0.08] py-4 px-5 rounded-xl font-sans text-sm text-white focus:outline-none focus:border-brandAccent transition-colors"
                    >
                      <option value="Apex Shred Program">APEX SHRED (Fat Reduction focus)</option>
                      <option value="Hypertrophy Code Program">HYPERTROPHY CODE (Lean Density build)</option>
                      <option value="Metric Performance Program">METRIC PERFORMANCE (Athletic focus)</option>
                      <option value="General Elite Coaching">Not sure / Needs structural review</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="font-sans text-[10px] uppercase tracking-widest text-[#f5f3ee] block font-bold">Weight Struggle & Background notes</label>
                    <textarea 
                      required 
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-white/[0.08] py-4 px-5 rounded-xl font-sans text-sm text-white focus:outline-none focus:border-brandAccent transition-colors h-24 resize-none"
                      placeholder="e.g. 94kg, struggle with hip posture asymmetry and high stress weight spikes..."
                    />
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button 
                      type="button" 
                      onClick={() => setModalStep(1)}
                      className="w-1/3 py-4 bg-zinc-900 text-zinc-400 font-display text-sm tracking-widest uppercase rounded-xl hover:text-white transition-colors"
                      onMouseEnter={() => setIsHovering(true)}
                      onMouseLeave={() => setIsHovering(false)}
                    >
                      BACK
                    </button>
                    <button 
                      type="submit" 
                      className="w-2/3 py-4 bg-brandAccent text-white font-display text-sm tracking-widest uppercase rounded-xl hover:scale-[1.01] active:scale-[0.99] transition-all duration-300"
                      onMouseEnter={() => setIsHovering(true)}
                      onMouseLeave={() => setIsHovering(false)}
                    >
                      SUBMIT DOSSIER
                    </button>
                  </div>
                </form>
              )}

              {modalStep === 3 && (
                <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
                  <div className="w-16 h-16 bg-brandAccent/10 border border-brandAccent/30 rounded-full flex items-center justify-center text-brandAccent mb-2 animate-bounce">
                    <Check className="w-8 h-8" />
                  </div>
                  <h3 className="font-display text-3xl text-white tracking-wider uppercase">APPLICATION RECEIVED</h3>
                  <p className="font-sans text-sm text-zinc-400 leading-relaxed max-w-xs mx-auto">
                    Thanks <span className="text-white font-medium">{formName}</span>. Your baseline indicators logged successfully. Coach Nikhil will contact you at <span className="text-white font-medium">{formEmail}</span> within 24 hours.
                  </p>
                  <button 
                    onClick={() => {
                      setModalOpen(false);
                      handleLogin(); // Prompt login to let them setup active dashboard profiles
                    }}
                    className="mt-6 px-8 py-3 bg-white text-black font-display text-xs tracking-widest uppercase rounded-full hover:scale-105 active:scale-95 transition-all duration-300"
                    onMouseEnter={() => setIsHovering(true)}
                    onMouseLeave={() => setIsHovering(false)}
                  >
                    CONTINUE ACCOUNT LINKING
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
