import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { fetchQuestionsCount } from '../services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ForestryLogo } from '@/components/ForestryLogo';
import { motion } from 'framer-motion';

const socialLinks = [
  { label: 'Facebook', href: '#', icon: 'fb' },
  { label: 'Instagram', href: '#', icon: 'ig' },
  { label: 'TikTok', href: '#', icon: 'tk' },
  { label: 'YouTube', href: '#', icon: 'yt' },
];
const SocialIconSm: React.FC<{ type: string }> = ({ type }) => {
  const common = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'currentColor' } as const;
  if (type === 'fb') return <svg {...common} aria-hidden="true"><path d="M14 8h3V4h-3c-2.76 0-5 2.24-5 5v3H6v4h3v4h4v-4h3l1-4h-4V9c0-.55.45-1 1-1z" /></svg>;
  if (type === 'ig') return <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" /></svg>;
  if (type === 'tk') return <svg {...common} aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V8.93a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.75a8.2 8.2 0 004.77 1.52V6.84a4.82 4.82 0 01-3.01-.15z" /></svg>;
  return <svg {...common} aria-hidden="true"><path d="M23 12s0-3.55-.45-5.27a1.82 1.82 0 00-1.28-1.28C19.55 5 12 5 12 5s-7.55 0-9.27.45A1.82 1.82 0 00 1.45 6.73C1 8.45 1 12 1 12s0 3.55.45 5.27a1.82 1.82 0 001.28 1.28c1.72.45 9.27.45 9.27.45s7.55 0 9.27-.45a1.82 1.82 0 001.28-1.28C23 15.55 23 12 23 12z" /><path d="M10 15l5-3-5-3z" fill="#0a2e1f" /></svg>;
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] } },
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] } },
};

const features = [
  { icon: '📝', title: 'Question Bank', getDesc: (count: number) => `${count.toLocaleString()}+ forestry MCQs across 10 categories, searchable and filterable.` },
  { icon: '⏱️', title: 'Timed Practice', getDesc: () => '2-minute timer per question with instant right/wrong feedback.' },
  { icon: '📊', title: 'Progress Tracking', getDesc: () => 'Weekly and lifetime accuracy by category with visual analytics.' },
  { icon: '🎯', title: 'Mistake Re-practice', getDesc: () => 'Wrong questions auto-queue for focused re-practice sessions.' },
  { icon: '🔍', title: 'Question Library', getDesc: () => 'Browse, search, and filter the complete question bank with answers shown.' },
  { icon: '📱', title: 'Cross-Device', getDesc: () => 'Works on desktop, tablet, and mobile. Progress syncs by user ID.' },
];

const steps = [
  { step: '1', title: 'Sign in', desc: 'Enter any username and password. Your account is created instantly.' },
  { step: '2', title: 'Practice', desc: 'Take timed quizzes filtered by category with a 2-minute timer.' },
  { step: '3', title: 'Review', desc: 'See instant feedback. Wrong questions go to your re-practice queue.' },
  { step: '4', title: 'Improve', desc: 'Track weekly and lifetime progress. Re-practice past mistakes.' },
];

const whatWeDo = [
  { icon: '📖', label: 'Practice', sub: 'Timed MCQs' },
  { icon: '✅', label: 'Review', sub: 'Instant feedback' },
  { icon: '📈', label: 'Improve', sub: 'Re-practice mistakes' },
  { icon: '📊', label: 'Track', sub: 'Weekly & lifetime progress' },
];

const About: React.FC = () => {
  const navigate = useNavigate();
  const [totalQuestions, setTotalQuestions] = useState<number>(0);

  useEffect(() => {
    fetchQuestionsCount().then(setTotalQuestions).catch(() => {});
  }, []);

  const stats = [
    { value: totalQuestions > 0 ? `${totalQuestions.toLocaleString()}+` : '—', label: 'Questions' },
    { value: '10', label: 'Categories' },
    { value: '∞', label: 'Practice' },
  ];

  return (
    <motion.div
      className="w-full mx-auto pt-4 pb-8"
      style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}
      variants={prefersReducedMotion() ? undefined : pageVariants}
      initial="initial"
      animate="animate"
    >
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section
        className="rounded-2xl overflow-hidden"
        style={{ background: 'linear-gradient(135deg, hsl(160 30% 14%), hsl(142 35% 18%))' }}
      >
        <div className="relative" style={{ padding: '1.75rem' }}>
          <div className="absolute top-0 right-0 w-72 h-72 -translate-y-1/3 translate-x-1/4 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, hsl(var(--moss-600) / 0.10), transparent 70%)' }} aria-hidden="true" />
          <div className="absolute bottom-0 left-0 w-56 h-56 translate-y-1/3 -translate-x-1/4 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, hsl(142 40% 40% / 0.08), transparent 70%)' }} aria-hidden="true" />

          <div className="about-hero">
            <div className="text-center">
              <div className="mx-auto mb-4 flex justify-center">
                <ForestryLogo size={84} />
              </div>
              <h1
                className="text-[1.75rem] font-bold leading-tight mb-2"
                style={{ fontFamily: 'var(--font-display)', color: 'hsl(90 40% 97%)', letterSpacing: '-0.01em' }}
              >
                Forestry PSC Preparation
              </h1>
              <p className="text-[0.875rem] leading-relaxed mb-6" style={{ color: 'hsl(100 18% 72%)', fontFamily: 'var(--font-sans)' }}>
                A focused MCQ practice platform for forestry, biodiversity, wildlife management, and related competitive examination preparation.
              </p>
              <div
                className="inline-flex gap-8 p-3.5 rounded-xl"
                style={{ background: 'hsl(0 0% 100% / 0.06)', border: '1px solid hsl(0 0% 100% / 0.08)' }}
              >
                {stats.map((s) => (
                  <div key={s.label}>
                    <p className="text-xl font-bold" style={{ color: 'hsl(90 40% 97%)', fontFamily: 'var(--font-display)' }}>{s.value}</p>
                    <p className="text-[0.7rem] mt-0.5 uppercase tracking-widest" style={{ color: 'hsl(0 0% 100% / 0.72)', fontFamily: 'var(--font-sans)', fontWeight: 600, letterSpacing: '0.05em' }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl p-4 text-left shadow-md" style={{ background: 'hsl(0 0% 100% / 0.12)', border: '1px solid hsl(0 0% 100% / 0.18)', backdropFilter: 'blur(10px) saturate(130%)' }}>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-[0.7rem] font-bold uppercase tracking-widest mb-2.5" style={{ color: 'hsl(0 0% 100% / 0.95)', fontFamily: 'var(--font-display)', letterSpacing: '0.08em', textShadow: '0 1px 2px hsl(0 0% 0% / 0.2)' }}>Platform</p>
                  <nav className="flex flex-col gap-1.5">
                    {[{ to: '/', label: 'Home' }, { to: '/quiz', label: 'Practice' }, { to: '/questions', label: 'Questions' }, { to: '/progress', label: 'Progress' }].map((item) => (
                      <Link key={item.to} to={item.to} className="text-[0.8rem] hover:text-white transition-colors" style={{ color: 'hsl(0 0% 100% / 0.92)', fontFamily: 'var(--font-sans)', fontWeight: 600, letterSpacing: '0.01em', textShadow: '0 1px 1px hsl(0 0% 0% / 0.15)' }}>{item.label}</Link>
                    ))}
                  </nav>
                </div>
                <div>
                  <p className="text-[0.7rem] font-bold uppercase tracking-widest mb-2.5" style={{ color: 'hsl(0 0% 100% / 0.95)', fontFamily: 'var(--font-display)', letterSpacing: '0.08em', textShadow: '0 1px 2px hsl(0 0% 0% / 0.2)' }}>Resources</p>
                  <nav className="flex flex-col gap-1.5">
                    {[{ to: '/about', label: 'About' }, { to: '/results', label: 'Results' }].map((item) => (
                      <Link key={item.to} to={item.to} className="text-[0.8rem] hover:text-white transition-colors" style={{ color: 'hsl(0 0% 100% / 0.92)', fontFamily: 'var(--font-sans)', fontWeight: 600, letterSpacing: '0.01em', textShadow: '0 1px 1px hsl(0 0% 0% / 0.15)' }}>{item.label}</Link>
                    ))}
                  </nav>
                </div>
              </div>
              <div>
                <p className="text-[0.7rem] font-bold uppercase tracking-widest mb-2.5" style={{ color: 'hsl(0 0% 100% / 0.95)', fontFamily: 'var(--font-display)', letterSpacing: '0.08em', textShadow: '0 1px 2px hsl(0 0% 0% / 0.2)' }}>Connect</p>
                <div className="flex items-center gap-1.5 mb-3">
                  {socialLinks.map((s) => (
                    <a key={s.label} href={s.href} aria-label={s.label} onClick={(e) => { if (s.href === '#') e.preventDefault(); }} className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-105" style={{ background: 'hsl(0 0% 100% / 0.07)', border: '1px solid hsl(0 0% 100% / 0.1)', color: 'hsl(90 40% 97%)' }}>
                      <SocialIconSm type={s.icon} />
                    </a>
                  ))}
                </div>
                <div className="space-y-1">
                  <a href="mailto:forestrypscpreparation@gmail.com" className="block text-[0.78rem] hover:text-white transition-colors break-all" style={{ color: 'hsl(0 0% 100% / 0.92)', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>forestrypscpreparation@gmail.com</a>
                  <a href="https://ravikafle.com.np" target="_blank" rel="noopener noreferrer" className="block text-[0.78rem] hover:text-white transition-colors break-all" style={{ color: 'hsl(0 0% 100% / 0.92)', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>ravikafle.com.np</a>
                  <p className="text-[0.78rem]" style={{ color: 'hsl(0 0% 100% / 0.75)', fontFamily: 'var(--font-sans)', fontStyle: 'italic', fontWeight: 500 }}>Kathmandu, Nepal</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── What we do ───────────────────────────────────────── */}
      <section>
        <Card>
          <CardContent style={{ padding: '1.5rem' }}>
            <div className="text-center mb-5">
              <h2
                className="text-xl font-semibold text-foreground mb-1"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Built for serious preparation
              </h2>
              <p className="text-sm text-muted-foreground">
                Practice with purpose, improve with every attempt.
              </p>
            </div>

            <motion.div
              className="grid grid-cols-2 gap-2.5 mb-3"
              style={{ overflow: 'visible', padding: '2px', margin: '-2px' }}
              variants={prefersReducedMotion() ? undefined : staggerContainer}
              initial="initial"
              animate="animate"
            >
              {whatWeDo.map((item) => (
                <motion.div
                  key={item.label}
                  variants={prefersReducedMotion() ? undefined : fadeUp}
                  className="flex items-center gap-3 p-4 rounded-xl border transition-all hover:shadow-sm"
                  style={{ background: 'hsl(var(--muted))', borderColor: 'hsl(var(--border))' }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <span className="text-xl flex-shrink-0">{item.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.sub}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            <p className="text-sm text-muted-foreground leading-relaxed text-center">
              Your practice history stays connected to your user ID, so you can pick up where you left off on any device.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ── Platform Features ────────────────────────────────── */}
      <section>
        <Card>
          <CardContent style={{ padding: '1.5rem' }}>
            <h2
              className="text-xl font-semibold text-foreground mb-5 text-center"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Platform Features
            </h2>

            <motion.div
              className="grid grid-cols-3 gap-3"
              style={{ overflow: 'visible', padding: '2px', margin: '-2px' }}
              variants={prefersReducedMotion() ? undefined : staggerContainer}
              initial="initial"
              animate="animate"
            >
              {features.map((f, i) => (
                <motion.div key={i} variants={prefersReducedMotion() ? undefined : fadeUp} className="flex items-start gap-3">
                  <span
                    className="text-xl flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg"
                    style={{ background: 'hsl(var(--muted))' }}
                  >
                    {f.icon}
                  </span>
                  <div className="min-w-0">
                    <h3 style={{ fontSize: '0.85rem' }} className="font-semibold text-foreground mb-0.5">{f.title}</h3>
                    <p className="text-[0.8rem] text-muted-foreground leading-relaxed">{f.getDesc(totalQuestions)}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </CardContent>
        </Card>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section>
        <Card>
          <CardContent style={{ padding: '1.5rem' }}>
            <h2
              className="text-xl font-semibold text-foreground mb-6 text-center"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              How it works
            </h2>

            <div className="flex items-start justify-center gap-3.5 max-w-2xl mx-auto" style={{ overflow: 'visible', padding: '2px', margin: '-2px' }}>
              {steps.map((s, i) => (
                <div key={i} className="flex-1 flex flex-col items-center text-center relative">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-white shadow-md mb-3"
                    style={{ background: 'hsl(var(--moss-600))' }}
                  >
                    {s.step}
                  </div>
                  {i < steps.length - 1 && (
                    <div
                      className="absolute"
                      style={{
                        top: '1.5rem',
                        left: 'calc(50% + 1.5rem)',
                        width: 'calc(100% - 3rem)',
                        height: '2px',
                        background: 'hsl(var(--moss-600) / 0.15)',
                      }}
                      aria-hidden="true"
                    />
                  )}
                  <h3 className="text-sm font-semibold text-foreground mb-1">{s.title}</h3>
                  <p className="text-[0.8rem] text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="flex justify-center" style={{ padding: '1.5rem' }}>
        <motion.div
          className="w-full max-w-sm"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
        >
          <Button onClick={() => navigate('/')} variant="primary" size="lg" className="w-full">
            Start practicing
          </Button>
        </motion.div>
      </section>
    </motion.div>
  );
};

export default About;
