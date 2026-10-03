import { useState } from 'react';
import { motion } from 'framer-motion';
import { authGoogleComplete } from '../services/api/auth';
import { AInput, AButton, AError } from '@/components/AuthViews';
import { toast } from 'react-hot-toast';

/* First-time Google signup, step 2 of 2.
   
   Google verified the mailbox; now the human picks a userid (and optionally a
   password that auto-connects password sign-in to the same account). Mirrors
   every normal site: verify first, profile second, app third. */

const errText = (e: unknown, fallback: string) => {
  const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof d === 'string' ? d : fallback;
};

const GoogleSetup: React.FC<{
  setupToken: string;
  email: string;
  suggested: string;
  onDone: (handle: string, token: string) => void;
  onBack: () => void;
}> = ({ setupToken, email, suggested, onDone, onBack }) => {
  const [username, setUsername] = useState(suggested || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const name = username.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(name)) {
      setError('Username must be 3-32 characters: letters, numbers, dot, dash or underscore.');
      return;
    }
    if (password && password.length < 8) {
      setError('Password must be at least 8 characters, or leave it empty for Google-only sign-in.');
      return;
    }
    setBusy(true);
    try {
      const r = await authGoogleComplete({
        setup_token: setupToken,
        username: name,
        password: password || undefined,
      });
      if (!r.session_token) {
        setError('Account created but no session came back. Try signing in with Google again.');
        return;
      }
      toast.success(`Welcome, ${r.user_identifier}!`);
      onDone(r.user_identifier, r.session_token);
    } catch (e) {
      setError(errText(e, 'Could not create the account.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.form
      onSubmit={submit}
      aria-label="Choose your userid"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 34 }}
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
    >
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 0.4rem', fontSize: '1.35rem', fontWeight: 700, fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
          Choose your userid
        </h2>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.6 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            fontWeight: 600, color: 'hsl(var(--success))',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            {email}
          </span>
          <br />
          Google verified this address. Pick how the app knows you.
        </p>
      </div>

      <AInput
        id="gsetup-user"
        label="Userid"
        value={username}
        onChange={(v) => { setUsername(v); setError(''); }}
        placeholder="e.g. ravi.kafle"
        autoComplete="username"
        required
        autoFocus
      />

      <div>
        <AInput
          id="gsetup-pw"
          label="Password (optional)"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(v) => { setPassword(v); setError(''); }}
          placeholder="Leave empty for Google-only"
          autoComplete="new-password"
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={{
                width: '36px', height: '36px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer',
                color: 'hsl(var(--muted-foreground))', borderRadius: '10px', padding: 0,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {showPassword ? (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </>
                ) : (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
            </button>
          }
        />
        <p style={{ margin: '0.45rem 0 0', fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))' }}>
          Set one to also sign in without Google. Empty means Google-only.
        </p>
      </div>

      {error && <AError message={error} />}

      <AButton type="submit" loading={busy} disabled={!username.trim()}>
        {busy ? 'Creating…' : 'Create my account'}
      </AButton>
      <AButton secondary onClick={onBack} disabled={busy}>
        Back to sign in
      </AButton>
    </motion.form>
  );
};

export default GoogleSetup;
