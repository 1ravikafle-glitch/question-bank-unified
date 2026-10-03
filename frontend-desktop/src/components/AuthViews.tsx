import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  authRegister,
  authConfirmEmail,
  authSendVerification,
  authForgotPasswordOtp,
  authVerifyResetCode,
  authResetPasswordWithToken,
} from '../services/api';
import { toast } from 'react-hot-toast';
import GoogleSignInButton from '@/components/GoogleSignInButton';

const label: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: 'hsl(var(--foreground))',
  marginBottom: '0.45rem',
};
const input: React.CSSProperties = {
  width: '100%',
  height: '52px',
  padding: '0 1rem',
  borderRadius: '14px',
  border: '1.5px solid hsl(var(--border))',
  background: 'hsl(var(--card))',
  color: 'hsl(var(--foreground))',
  fontSize: '1rem',
  fontFamily: 'var(--font-sans)',
  outline: 'none',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease',
};
const inputFocus: React.CSSProperties = {
  borderColor: 'hsl(var(--primary))',
  boxShadow: '0 0 0 4px hsl(var(--primary) / 0.12)',
};
const btn: React.CSSProperties = {
  width: '100%',
  height: '52px',
  borderRadius: '14px',
  fontSize: '1rem',
  fontWeight: 600,
};
const note: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'hsl(var(--muted-foreground))',
  lineHeight: 1.5,
};


/* ── Shared Apple auth primitives ──────────────────────────────
   Transform/opacity motion only (60fps, compositor-driven). Respects
   prefers-reduced-motion via the app-level MotionConfig. No hardcoded
   colors: every value is a design token. */

export const AInput: React.FC<{
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  required?: boolean;
  maxLength?: number;
  mono?: boolean;
  trailing?: React.ReactNode;
  onEnter?: () => void;
}> = ({ id, label, type = 'text', value, onChange, placeholder, autoComplete, autoFocus, required, maxLength, mono, trailing, onEnter }) => {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label
        htmlFor={id}
        style={{
          display: 'block', fontSize: '0.8125rem', fontWeight: 600,
          color: 'hsl(var(--foreground))', marginBottom: '0.45rem',
        }}
      >
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <motion.input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter(); }}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          maxLength={maxLength}
          whileFocus={{ scale: 1.005 }}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          style={{
            width: '100%', height: '52px', padding: trailing ? '0 52px 0 1rem' : '0 1rem',
            borderRadius: '14px', border: '1.5px solid hsl(var(--border))',
            background: 'hsl(var(--card))', color: 'hsl(var(--foreground))',
            fontSize: '1rem', fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
            letterSpacing: mono ? '0.2em' : undefined,
            textTransform: mono ? 'uppercase' : undefined,
            outline: 'none',
            ...(focused ? inputFocus : null),
          }}
        />
        {trailing && (
          <div style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}>
            {trailing}
          </div>
        )}
      </div>
    </div>
  );
};

export const AButton: React.FC<{
  children: React.ReactNode;
  onClick?: (e: React.FormEvent) => void;
  type?: 'submit' | 'button';
  disabled?: boolean;
  loading?: boolean;
  secondary?: boolean;
}> = ({ children, onClick, type = 'button', disabled, loading, secondary }) => (
  <motion.button
    type={type}
    onClick={onClick}
    disabled={disabled || loading}
    whileTap={disabled || loading ? undefined : { scale: 0.97 }}
    transition={{ type: 'spring', stiffness: 600, damping: 30 }}
    className={secondary ? 'btn' : 'btn btn-primary'}
    style={{
      ...btn,
      opacity: disabled ? 0.5 : 1,
      cursor: disabled || loading ? 'default' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
    }}
  >
    {loading && (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}>
        <path d="M21 12a9 9 0 11-6.219-8.56" />
      </svg>
    )}
    {children}
  </motion.button>
);

export const AError: React.FC<{ message: string }> = ({ message }) => (
  <motion.p
    role="alert"
    initial={{ opacity: 0, y: -4 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
    style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(var(--wrong-600))', margin: 0 }}
  >
    {message}
  </motion.p>
);

/* Eight OTP boxes: auto-advance, backspace nav, full-code paste. One hidden
   truth (the joined string); boxes are purely presentational. */
export const OtpBoxes: React.FC<{
  length?: number;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}> = ({ length = 8, value, onChange, autoFocus }) => {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const chars = Array.from({ length }, (_, i) => value[i] || '');
  const setAt = (i: number, ch: string) => {
    const next = value.split('');
    while (next.length < length) next.push('');
    next[i] = (ch || '').slice(-1).toUpperCase().replace(/[^A-Z0-9]/g, '');
    onChange(next.join('').slice(0, length));
  };
  return (
    <div style={{ display: 'flex', gap: '0.45rem', justifyContent: 'center' }} role="group" aria-label="Verification code">
      {chars.map((ch, i) => (
        <motion.input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          value={ch}
          onChange={(e) => {
            // Paste of the whole code fills every box.
            const pasted = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            if (pasted.length > 1) {
              onChange(pasted.slice(0, length));
              refs.current[Math.min(pasted.length, length - 1)]?.focus();
              return;
            }
            setAt(i, e.target.value);
            if (e.target.value && i < length - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !chars[i] && i > 0) refs.current[i - 1]?.focus();
          }}
          onFocus={(e) => e.target.select()}
          autoFocus={autoFocus && i === 0}
          aria-label={`Digit ${i + 1}`}
          inputMode="text"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={i === 0 ? length : 1}
          whileFocus={{ scale: 1.06 }}
          transition={{ type: 'spring', stiffness: 550, damping: 28 }}
          style={{
            width: '100%', maxWidth: '2.6rem', aspectRatio: '0.86',
            textAlign: 'center', fontSize: '1.15rem', fontWeight: 700,
            fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
            borderRadius: '12px', border: ch ? '1.5px solid hsl(var(--primary))' : '1.5px solid hsl(var(--border))',
            background: ch ? 'hsl(var(--primary) / 0.07)' : 'hsl(var(--card))',
            color: 'hsl(var(--foreground))', outline: 'none',
          }}
        />
      ))}
    </div>
  );
};

const errText = (e: unknown, fallback: string) => {
  const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof d === 'string' ? d : fallback;
};

/* Create an account, then prove the address.
 *
 * Two steps because the address is the identity: signup creates the row and
 * emails a code, and entering the code is what marks it verified and issues the
 * member ID. Previously the address was optional and never checked, and the form
 * displayed "your member ID is ..." for an account nobody had proven anything
 * about.
 *
 * The form leads with the Gmail address because that is what a reader
 * recognises; a display name is still asked for. */
export const RegisterView: React.FC<{
  onDone: () => void;
  onSwitchToLogin: () => void;
  // The handle the app stores locally: the username, not the member ID. The ID
  // does not exist until the address is verified, and the server resolves a
  // session by either.
  onAuthenticated?: (handle: string, token: string) => void;
  // Google bypass on the verify screen: one click proves the mailbox when
  // emailed codes cannot arrive (dead relay). Server links + verifies.
  onGoogle?: (credential: string) => Promise<void>;
  googleClientId?: string | null;
}> = ({
  onDone,
  onSwitchToLogin,
  onAuthenticated,
  onGoogle,
  googleClientId,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [gmail, setGmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Verification step, entered after a successful signup.
  const [stage, setStage] = useState<'form' | 'verify'>('form');
  const [code, setCode] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [mailOk, setMailOk] = useState(true);

  const passwordStrength = (() => {
    if (!password) return { score: 0, label: '', color: '' };
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    if (score <= 2) return { score, label: 'Weak', color: 'hsl(var(--destructive))' };
    if (score <= 3) return { score, label: 'Fair', color: 'hsl(var(--warning, #f59e0b))' };
    if (score <= 4) return { score, label: 'Good', color: 'hsl(var(--primary))' };
    return { score, label: 'Strong', color: 'hsl(var(--success))' };
  })();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!gmail.trim()) {
      setError('Enter your Gmail address - it is how you sign in and recover your account.');
      return;
    }
    setBusy(true);
    try {
      const r = await authRegister({
        username: username.trim().toLowerCase(),
        password,
        email: gmail.trim().toLowerCase(),
      });
      // The server mints a session at signup, so a new account goes straight
      // in. Previously signup returned no token and dropped the user back on
      // the login form to type the password they had just chosen.
      if (r.session_token && onAuthenticated) {
        onAuthenticated(username.trim().toLowerCase(), r.session_token);
      }
      if (r.user_id) {
        toast.success(`Account created. Your member ID is ${r.user_id}`);
        onDone();
        return;
      }
      // If the relay refused the message, say so on the code screen instead of
      // telling the reader to check an inbox that will stay empty. They can
      // retry, and the account is usable by username meanwhile.
      setMailOk(!r.delivery_failed);
      setStage('verify');
    } catch (e) {
      setError(errText(e, 'Could not create the account.'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!code.trim()) return;
    setBusy(true);
    try {
      const r = await authConfirmEmail(username.trim().toLowerCase(), code.trim().toUpperCase());
      setMemberId(r.user_id);
      setCode('');
      toast.success(r.already_verified ? 'Already verified.' : `Address verified. Your member ID is ${r.user_id}`);
    } catch (e) {
      setError(errText(e, 'That code is not correct.'));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError('');
    setBusy(true);
    try {
      const r = await authSendVerification(username.trim().toLowerCase());
      setMailOk(r.sent);
      if (!r.sent) setError('The mail server is not reachable right now, so no code was sent. Try again shortly.');
    } catch (e) {
      setError(errText(e, 'Could not send a new code.'));
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'verify') {
    return (
      <form onSubmit={verify} aria-label="Verify email" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 0.4rem', fontSize: '1.35rem', fontWeight: 700, fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
            Check your Gmail
          </h2>
          <p style={{ ...note, margin: 0, fontSize: '0.875rem' }}>
            We sent a code to <strong style={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>{gmail.trim().toLowerCase()}</strong>.
            Enter it to get your member ID.
          </p>
        </div>
        <OtpBoxes value={code} onChange={setCode} autoFocus />
        {memberId && (
          <p style={{ ...note, margin: 0, padding: '0.75rem', borderRadius: 'var(--apple-radius-md)', background: 'hsl(var(--success) / 0.1)', color: 'hsl(var(--success))' }}>
            Verified. Your member ID is <strong style={{ fontWeight: 700 }}>{memberId}</strong>.
          </p>
        )}
        {error && <AError message={error} />}
        {!mailOk && !memberId && (
          <p style={{ ...note, margin: 0, color: 'hsl(var(--destructive))' }}>
            Email delivery is not working on this server, so no code was sent.
          </p>
        )}
        <AButton type="submit" loading={busy} disabled={!!memberId || code.trim().length < 8}>
          {memberId ? 'Verified' : 'Verify and get my ID'}
        </AButton>
        {!memberId && (
          <AButton secondary onClick={resend} disabled={busy}>
            Send a new code
          </AButton>
        )}
        {onGoogle && googleClientId && !memberId && (
          <>
            <GoogleSignInButton clientId={googleClientId} onCredential={(c) => { setBusy(true); onGoogle(c).finally(() => setBusy(false)); }} />
            <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', textAlign: 'center', margin: 0 }}>
              No code arriving? One Google click verifies this same address instantly.
            </p>
          </>
        )}
        <AButton secondary onClick={onDone} disabled={busy}>
          {memberId ? 'Continue to the app' : 'Skip for now'}
        </AButton>
      </form>
    );
  }

  const EyeToggle = (
    <button type="button" onClick={() => setShowPassword(!showPassword)}
      aria-label={showPassword ? 'Hide password' : 'Show password'}
      style={{
        width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))', borderRadius: '10px', padding: 0,
      }}>
      {showPassword ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );

  return (
    <form onSubmit={submit} aria-label="Register form" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <AInput id="reg-mail" label="Gmail address" type="email" value={gmail} onChange={setGmail}
          autoComplete="email" placeholder="you@gmail.com" required autoFocus />
        <p style={{ ...note, margin: '0.45rem 0 0', fontSize: '0.8125rem' }}>
          How you sign in and recover your account. We email a code to confirm it is yours.
        </p>
      </div>
      <AInput id="reg-user" label="Display name" value={username} onChange={setUsername}
        autoComplete="username" placeholder="e.g. ravi.kafle" required />
      <div>
        <AInput id="reg-pw" label="Password" type={showPassword ? 'text' : 'password'}
          value={password} onChange={setPassword}
          autoComplete="new-password" placeholder="At least 8 characters" required trailing={EyeToggle} />
        {password && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
            <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: 'hsl(var(--muted))', overflow: 'hidden' }}>
              <div style={{
                width: `${(passwordStrength.score / 5) * 100}%`, height: '100%', borderRadius: '2px',
                background: passwordStrength.color, transition: 'width 300ms ease, background 300ms ease',
              }} />
            </div>
            <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: passwordStrength.color }}>
              {passwordStrength.label}
            </span>
          </div>
        )}
      </div>
      {error && <AError message={error} />}

      <AButton type="submit" loading={busy}>
        Create account
      </AButton>
      <AButton secondary onClick={onSwitchToLogin} disabled={busy}>
        I already have an account
      </AButton>
    </form>
  );
};

/* Forgot password in three steps: identify -> type the emailed code -> new
   password. The code is only exchanged for a real reset token, so the short
   typed value never authorises the password change on its own. */
export const ResetPasswordView: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mailWorks, setMailWorks] = useState(true);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await authForgotPasswordOtp(identifier.trim());
      setMailWorks(r.email_delivery && !r.delivery_failed);
      if (r.delivery_failed) {
        // The server tried and could not reach the relay. Advancing to the code
        // box here is what produced "it just shows enter OTP": the screen
        // promised a mail that was never sent, so the code could never arrive.
        // Say what happened and stay on this step so a retry is one tap.
        setError(r.message);
        return;
      }
      setStep(2);
    } catch (e) {
      setError(errText(e, 'Could not send a code. Try again shortly.'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await authVerifyResetCode(identifier.trim(), code.trim().toUpperCase());
      setResetToken(r.reset_token);
      setStep(3);
    } catch (e) {
      setError(errText(e, 'That code is not valid.'));
    } finally {
      setBusy(false);
    }
  };

  const setNew = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await authResetPasswordWithToken(resetToken, password);
      toast.success('Password updated. Sign in with it.');
      onDone();
    } catch (e) {
      setError(errText(e, 'Could not update the password.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      {step === 1 && (
        <form onSubmit={requestCode} aria-label="Forgot password" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <p style={{ ...note, margin: 0 }}>
            Enter the Gmail you registered with, or your username or member ID.
            We will only send a code if it matches an account here.
          </p>
          <div>
            <label style={label} htmlFor="fp-id">Gmail, username or member ID</label>
            <input id="fp-id" style={input} value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoFocus />
          </div>
          {error && <p role="alert" style={{ ...note, color: 'hsl(var(--destructive))', margin: 0 }}>{error}</p>}
          <button type="submit" className="btn btn-primary" style={btn} disabled={busy || !identifier.trim()}>
            {busy ? 'Sending…' : 'Send reset code'}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={verify} aria-label="Enter reset code" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <p style={{ ...note, margin: 0 }}>
            {mailWorks
              ? <>If that account exists, a reset code is on its way. Enter it below.</>
              : <>This server cannot send mail, so the code was written to its log instead.</>}
          </p>
          {!mailWorks && (
            <p role="status" style={{ ...note, margin: 0, color: 'hsl(var(--destructive))' }}>
              No code reached your inbox. If nothing arrives, the address on this
              account may not match - try your username or member ID instead.
            </p>
          )}
          <div>
            <label style={label} htmlFor="fp-code">Reset code</label>
            <input id="fp-code" style={{ ...input, letterSpacing: '0.3em', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
              value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} required autoFocus
              placeholder="8 characters" />
          </div>
          {error && <p role="alert" style={{ ...note, color: 'hsl(var(--destructive))', margin: 0 }}>{error}</p>}
          <button type="submit" className="btn btn-primary" style={btn} disabled={busy || code.trim().length !== 8}>
            {busy ? 'Checking…' : 'Verify code'}
          </button>
          <button type="button" className="btn" style={btn} onClick={() => { setStep(1); setError(''); }} disabled={busy}>
            Use a different account
          </button>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={setNew} aria-label="Set new password" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <p style={{ ...note, margin: 0 }}>Code accepted. Choose a new password.</p>
          <div>
            <label style={label} htmlFor="fp-pw">New password</label>
            <input id="fp-pw" style={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password" minLength={8} required autoFocus placeholder="At least 8 characters" />
          </div>
          {error && <p role="alert" style={{ ...note, color: 'hsl(var(--destructive))', margin: 0 }}>{error}</p>}
          <button type="submit" className="btn btn-primary" style={btn} disabled={busy}>
            {busy ? 'Saving…' : 'Set new password'}
          </button>
        </form>
      )}
    </div>
  );
};
