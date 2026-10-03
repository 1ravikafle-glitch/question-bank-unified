import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { fetchQuestionsCount, fetchCategories } from '../services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ForestryLogo } from '@/components/ForestryLogo';
import { SocialIcons, SocialList, CONTACT_EMAIL } from '@/components/SocialLinks';
import { motion, type Variants } from 'framer-motion';

// Real profile URLs go here — empty string renders the icon without a link.
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const pageVariants: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] } },
};

const staggerContainer: Variants = {
  animate: { transition: { staggerChildren: 0.06 } },
};

const fadeUp: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] } },
};

const features = [
  {
    icon: '📝',
    title: 'Question Bank',
    getDesc: (count: number, cats: number) =>
      count > 0 && cats > 0
        ? `${count.toLocaleString()}+ forestry MCQs across ${cats} categories, searchable and filterable.`
        : 'A growing forestry MCQ bank across every category, searchable and filterable.',
  },
  { icon: '⏱️', title: 'Timed Practice', getDesc: () => '2-minute timer per question with instant right/wrong feedback.' },
  { icon: '📊', title: 'Progress Tracking', getDesc: () => 'Weekly and lifetime accuracy by category with visual analytics.' },
  { icon: '🎯', title: 'Mistake Re-practice', getDesc: () => 'Wrong questions auto-queue for focused re-practice sessions.' },
  { icon: '🔍', title: 'Question Library', getDesc: () => 'Browse, search, and filter the complete question bank with answers shown.' },
  { icon: '📱', title: 'Cross-Device', getDesc: () => 'Works on desktop, tablet, and mobile. Progress syncs by user ID.' },
];

const steps = [
  { step: '1', title: 'Create account', desc: 'Pick a username and password once. Sign-in never creates accounts. It only opens ones that already exist.' },
  { step: '2', title: 'Practice', desc: 'Take timed quizzes filtered by category with a 2-minute timer.' },
  { step: '3', title: 'Review', desc: 'See instant feedback. Wrong questions go to your re-practice queue.' },
  { step: '4', title: 'Improve', desc: 'Track weekly and lifetime progress. Re-practice past mistakes.' },
];

/* The full user guide. Every entry is a real screen: `where` names where the
   control lives so the guide stays navigable when the sidebar is collapsed. */
const guideSections: { title: string; icon: string; items: { where: string; what: string }[] }[] = [
  {
    title: 'Study modes: what each one is for',
    icon: '🎯',
    items: [
      {
        where: 'Practice',
        what: 'Short, low-pressure drilling. Pick categories, a question count and a 2-minute countdown per set. Answers are marked as you go, so you learn the topic instead of just being scored.',
      },
      {
        where: 'Mock Exam',
        what: 'Full exam simulation: the whole paper at once, one shared wall-clock deadline (shown at the top and refreshed whenever you switch tabs), negative marking, and a review-your-answers screen before you submit. This is what you use to rehearse the real test.',
      },
      {
        where: 'Questions',
        what: 'The full question bank, browsable without a timer. Open any question to read its explanation, bookmark it, or attach a note.',
      },
      {
        where: 'Wrong Questions',
        what: 'Your personal re-practice queue. Everything you have answered incorrectly lands here automatically. Clearing it means you have genuinely mastered those questions.',
      },
    ],
  },
  {
    title: 'Review tools: how to actually use them',
    icon: '🔁',
    items: [
      {
        where: 'Results',
        what: 'Every past attempt, with the score broken down (correct, wrong, skipped, and the exact penalty formula). Reopen any attempt to see each question, or delete an attempt to clear it from your history.',
      },
      {
        where: 'Bookmarks',
        what: 'Star a question anywhere (the paper, the bank, or a result), and it is kept here. The sidebar shows a live count so you can see how many you have saved.',
      },
      {
        where: 'My Notes',
        what: 'Write your own explanation next to any question. Notes and bookmarks are independent: keep a question without a note, or a note without bookmarking it. Delete a single note or clear them all from this page. The sidebar shows a live count here too.',
      },
      {
        where: 'Progress',
        what: 'Weekly and lifetime accuracy, category strengths, and where you are trending. Use this to decide which categories to practise next.',
      },
    ],
  },
  {
    title: 'Answering: what the controls do',
    icon: '✍️',
    items: [
      {
        where: 'Mock exam → the paper',
        what: 'Tap an option to select it; tapping a different one replaces your choice. A question never holds two answers. Hovering a question lights up its own A/B/C/D bubbles in the answer sheet, so you can answer from either side. Your answers are marked immediately.',
      },
      {
        where: 'Mock exam → answer sheet',
        what: 'A compact A/B/C/D grid for every question. Clicking a number jumps you to that question; clicking a letter answers it. Colours show answered, unanswered, flagged and current.',
      },
      {
        where: 'Mock exam → review before submit',
        what: 'The exam lets you review and change any answer first. Nothing is scored until you press submit.',
      },
    ],
  },
  {
    title: 'Account & settings',
    icon: '⚙️',
    items: [
      {
        where: 'Create account (sign-in screen)',
        what: 'Username, password, and optionally an email. The email is optional. You can sign up with none and add one later.',
      },
      {
        where: 'Settings → Email',
        what: 'Add, change or clear the email on your account at any time. Password-reset links go there, so adding one is worth doing.',
      },
      {
        where: 'Settings',
        what: 'Change your password, toggle sound and motion, and switch language. On mobile the panel slides up from the bottom and can be dismissed with the ✕ or by tapping outside it.',
      },
      {
        where: 'Offline',
        what: 'Bookmarks, notes and answers made without a connection are queued on your device and sync automatically the next time you are online.',
      },
    ],
  },
  {
    title: 'Contributing: past question papers',
    icon: '📤',
    items: [
      {
        where: 'Past Papers',
        what: 'A public library of every approved submission. Open one to read it in the browser, or download it as a DOCX. No account is needed to read or download.',
      },
      {
        where: 'Past Papers → Contribute',
        what: 'Upload your own PDF or DOCX. Say whether it is a complete past question paper or a loose set of questions. Both go through exactly the same admin review before anything reaches the question bank. You can keep up to five uploads waiting for review, and any rejection tells you why.',
      },
    ],
  },
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
  const [totalCategories, setTotalCategories] = useState<number>(0);

  useEffect(() => {
    fetchQuestionsCount().then((r) => setTotalQuestions(r.count)).catch(() => {});
    fetchCategories().then((c) => setTotalCategories(c.length)).catch(() => {});
  }, []);

  const stats = [
    { value: totalQuestions > 0 ? `${totalQuestions.toLocaleString()}+` : '—', label: 'Questions' },
    { value: totalCategories > 0 ? `${totalCategories}` : '—', label: 'Categories' },
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
      {/* Hero banner is a fixed dark surface by design: it carries its own
          light text and white-alpha glass cards, so it is the one block that
          intentionally does not follow --background. */}
      <section
        className="rounded-2xl overflow-hidden"
        style={{ background: 'linear-gradient(135deg, hsl(160 30% 14%), hsl(142 35% 18%))' }}
      >
        <div className="relative" style={{ padding: '1.75rem' }}>
          <div className="absolute top-0 right-0 w-72 h-72 -translate-y-1/3 translate-x-1/4 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, hsl(var(--moss-600) / 0.10), transparent 70%)' }} aria-hidden="true" />
          <div className="absolute bottom-0 left-0 w-56 h-56 translate-y-1/3 -translate-x-1/4 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.08), transparent 70%)' }} aria-hidden="true" />

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
                  {/* Reuses the shared row rather than repeating the markup:
                      a copied loop drifts, and it was already missing Gmail and
                      gave every glyph the same colour. The shared version also
                      drops target="_blank" on the mailto: link. */}
                  <SocialIcons tone="dark" />
                </div>
                <div className="space-y-1">
                  <SocialList />
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="block text-[0.78rem] hover:text-white transition-colors break-all"
                    style={{ color: 'hsl(0 0% 100% / 0.92)', fontFamily: 'var(--font-sans)', fontWeight: 600 }}
                  >
                    {CONTACT_EMAIL}
                  </a>
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
                    <p className="text-[0.8rem] text-muted-foreground leading-relaxed">{f.getDesc(totalQuestions, totalCategories)}</p>
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

      {/* ── Full guide ──────────────────────────────────────── */}
      <section>
        <Card>
          <CardContent style={{ padding: '1.5rem' }}>
            <h2
              className="text-xl font-semibold text-foreground mb-1 text-center"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              How to use this app
            </h2>
            <p className="text-sm text-muted-foreground mb-6 text-center leading-relaxed">
              A complete walkthrough of every mode, what it is for, and where its controls live.
            </p>

            <motion.div
              className="flex flex-col gap-5"
              variants={prefersReducedMotion() ? undefined : staggerContainer}
              initial="initial"
              animate="animate"
            >
              {guideSections.map((section) => (
                <div
                  key={section.title}
                  className="rounded-xl border"
                  style={{ background: 'hsl(var(--muted))', borderColor: 'hsl(var(--border))', padding: '1rem 1.1rem' }}
                >
                  <h3
                    className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    <span aria-hidden="true">{section.icon}</span>
                    {section.title}
                  </h3>

                  <dl className="flex flex-col gap-2.5">
                    {section.items.map((item) => (
                      <motion.div
                        key={item.where}
                        variants={prefersReducedMotion() ? undefined : fadeUp}
                        className="flex flex-col gap-0.5 sm:flex-row sm:gap-3"
                      >
                        <dt
                          className="text-xs font-semibold text-foreground shrink-0 sm:w-48"
                          style={{ lineHeight: 1.5 }}
                        >
                          {item.where}
                        </dt>
                        <dd className="text-[0.8rem] text-muted-foreground leading-relaxed m-0">
                          {item.what}
                        </dd>
                      </motion.div>
                    ))}
                  </dl>
                </div>
              ))}
            </motion.div>

            <p className="text-xs text-muted-foreground text-center mt-5 leading-relaxed">
              Everything above works the same on desktop and mobile. Only the navigation differs:
              the sidebar on desktop, the bottom bar and menu on mobile.
            </p>
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
