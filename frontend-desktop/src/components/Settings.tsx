import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AuthContext } from '@/context/AuthContext';
import { useTheme, type ThemeMode } from '@/context/ThemeContext';
import { useSound } from '@/context/SoundContext';
import { useSfx } from '@/hooks/useSfx';
import { useLang, type Lang } from '@/context/LanguageContext';
import { useQuizPrefs } from '@/quizPrefs';
import { staggerParent, sectionRise, useReducedMotion } from '@/motion';

const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  padding: '14px 16px',
  borderRadius: 12,
  border: '1px solid hsl(var(--border))',
  background: 'hsl(var(--card))',
};

function Toggle({
  on,
  onFlip,
  label,
}: {
  on: boolean;
  onFlip: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onFlip}
      style={{
        width: 46,
        height: 27,
        borderRadius: 999,
        background: on ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
        border: `1px solid ${on ? 'transparent' : 'hsl(var(--border))'}`,
        transition: 'background 0.25s cubic-bezier(.22,1,.36,1)',
        cursor: 'pointer',
        padding: 0,
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 23 : 3,
          width: 21,
          height: 21,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.25s cubic-bezier(.22,1,.36,1)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        }}
      />
    </button>
  );
}

const Settings: React.FC = () => {
  const { userId, logout } = useContext(AuthContext);
  const { mode, setMode } = useTheme();
  const { enabled: sfxEnabled, toggle: toggleSfx } = useSound();
  const { sfxClick } = useSfx();
  const [quizPrefs, setQuizPrefs] = useQuizPrefs();
  const navigate = useNavigate();
  const reduced = useReducedMotion();

  const themes: { value: ThemeMode; label: string; hint: string }[] = [
    { value: 'light', label: 'Light', hint: 'Bright paper surfaces' },
    { value: 'dark', label: 'Dark', hint: 'Easy on the eyes at night' },
    { value: 'auto', label: 'Auto', hint: 'Follows sunrise/sunset' },
  ];

  const card: React.CSSProperties = {
    background: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 18,
    padding: 8,
  };

  return (
    <motion.div
      variants={reduced ? undefined : staggerParent}
      initial="initial"
      animate="animate"
      style={{ maxWidth: 640, margin: '0 auto', paddingBottom: 48 }}
    >
      <motion.div variants={reduced ? undefined : sectionRise} style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
          Settings
        </h1>
        <p style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))', margin: '4px 0 0' }}>
          Appearance, sound, quiz behavior and your account.
        </p>
      </motion.div>

      {/* Appearance */}
      <motion.section variants={reduced ? undefined : sectionRise} style={{ marginBottom: 16 }} aria-label="Appearance">
        <h2 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'hsl(var(--muted-foreground))', margin: '0 0 8px 4px' }}>
          Appearance
        </h2>
        <div style={card}>
          {themes.map((t, i) => (
            <button
              key={t.value}
              type="button"
              onClick={() => { sfxClick(); setMode(t.value); }}
              aria-pressed={mode === t.value}
              style={{
                ...row,
                border: 'none',
                borderRadius: i === 0 ? '12px 12px 0 0' : i === themes.length - 1 ? '0 0 12px 12px' : 0,
                background: mode === t.value ? 'hsl(var(--primary) / 0.10)' : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  border: `2px solid ${mode === t.value ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {mode === t.value && (
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'hsl(var(--primary))' }} />
                )}
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{t.label}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'hsl(var(--muted-foreground))' }}>{t.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </motion.section>

      {/* Language */}
      <LanguageSection />
      {/* Sound */}
      <motion.section variants={reduced ? undefined : sectionRise} style={{ marginBottom: 16 }} aria-label="Sound">
        <h2 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'hsl(var(--muted-foreground))', margin: '0 0 8px 4px' }}>
          Sound
        </h2>
        <div style={card}>
          <div style={{ ...row, border: 'none' }}>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>Sound effects</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'hsl(var(--muted-foreground))' }}>
                Clicks, correct and wrong answer cues
              </span>
            </span>
            <Toggle on={sfxEnabled} onFlip={toggleSfx} label="Sound effects" />
          </div>
        </div>
      </motion.section>

      {/* Quiz */}
      <motion.section variants={reduced ? undefined : sectionRise} style={{ marginBottom: 16 }} aria-label="Quiz">
        <h2 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'hsl(var(--muted-foreground))', margin: '0 0 8px 4px' }}>
          Quiz
        </h2>
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ ...row, border: 'none' }}>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>Question timer</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'hsl(var(--muted-foreground))' }}>
                Countdown per question with auto-advance
              </span>
            </span>
            <Toggle on={quizPrefs.timer} onFlip={() => setQuizPrefs({ timer: !quizPrefs.timer })} label="Question timer" />
          </div>
          <div style={{ ...row, border: 'none' }}>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>Resume interrupted quizzes</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'hsl(var(--muted-foreground))' }}>
                Offer Continue when a quiz was left mid-way
              </span>
            </span>
            <Toggle on={quizPrefs.resume} onFlip={() => setQuizPrefs({ resume: !quizPrefs.resume })} label="Resume interrupted quizzes" />
          </div>
        </div>
      </motion.section>

      {/* Account */}
      <motion.section variants={reduced ? undefined : sectionRise} aria-label="Account">
        <h2 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'hsl(var(--muted-foreground))', margin: '0 0 8px 4px' }}>
          Account
        </h2>
        <div style={card}>
          <div style={{ ...row, border: 'none' }}>
            <span
              aria-hidden="true"
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'hsl(var(--primary) / 0.15)',
                color: 'hsl(var(--primary))',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 15,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {(userId || '?').charAt(0).toUpperCase()}
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{userId || 'Not signed in'}</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'hsl(var(--muted-foreground))' }}>
                Forestry PSC Preparation
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => { logout(); navigate('/login'); }}
            style={{
              ...row,
              border: 'none',
              cursor: 'pointer',
              color: 'hsl(var(--destructive))',
              fontSize: 15,
              fontWeight: 600,
              justifyContent: 'center',
              marginTop: 4,
            }}
          >
            Log out
          </button>
        </div>
      </motion.section>
    </motion.div>
  );
};

export default Settings;

function LanguageSection() {
  const { lang, setLang, t } = useLang();
  const { sfxClick } = useSfx();
  const opts: { value: Lang; label: string }[] = [
    { value: 'en', label: 'English' },
    { value: 'ne', label: 'नेपाली' },
  ];
  return (
    <div style={{ marginBottom: 16 }} aria-label={t('language')}>
      <h2 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'hsl(var(--muted-foreground))', margin: '0 0 8px 4px' }}>
        {t('language')}
      </h2>
      <div style={{ display: 'flex', background: 'hsl(var(--muted))', borderRadius: 12, padding: 3, gap: 2 }}>
        {opts.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => { sfxClick(); setLang(o.value); }}
            aria-pressed={lang === o.value}
            style={{
              flex: 1, padding: '8px 4px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: lang === o.value ? 700 : 500,
              color: lang === o.value ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
              background: lang === o.value ? 'hsl(var(--card))' : 'transparent',
              boxShadow: lang === o.value ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', margin: '6px 4px 0' }}>
        {t('language.hint')}
      </p>
    </div>
  );
}
