import { useState } from 'react';
import { authRegister, authForgotPasswordOtp, authVerifyResetCode, authResetPasswordWithToken } from '../services/api';
import { toast } from 'react-hot-toast';

const label: React.CSSProperties = {
  display: 'block',
  fontSize: '0.6875rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'hsl(var(--muted-foreground))',
  marginBottom: '0.4rem',
};
const input: React.CSSProperties = {
  width: '100%',
  padding: '0.625rem 0.75rem',
  borderRadius: 'var(--apple-radius-md)',
  border: '1px solid hsl(var(--border))',
  background: 'hsl(var(--card))',
  color: 'hsl(var(--foreground))',
  fontSize: '0.875rem',
  fontFamily: 'var(--font-sans)',
};
const btn: React.CSSProperties = {
  width: '100%',
  padding: '0.6875rem',
  borderRadius: 'var(--apple-radius-md)',
  fontSize: '0.875rem',
  fontWeight: 600,
};
const note: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'hsl(var(--muted-foreground))',
  lineHeight: 1.5,
};

const errText = (e: unknown, fallback: string) => {
  const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof d === 'string' ? d : fallback;
};

/* Create an account: username, optional member ID, password, email.
   The email is stored but never verified - it is only used later to deliver a
   password-reset code. Say so on the form rather than hiding it. */
export const RegisterView: React.FC<{ onDone: () => void; onSwitchToLogin: () => void }> = ({
  onDone,
  onSwitchToLogin,
}) => {
  const [username, setUsername] = useState('');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [gmail, setGmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      const r = await authRegister({
        username: username.trim().toLowerCase(),
        password,
        gmail: gmail.trim().toLowerCase(),
        user_id: userId.trim() || undefined,
      });
      toast.success(`Account created. Your member ID is ${r.user_id}`);
      onDone();
    } catch (e) {
      setError(errText(e, 'Could not create the account.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} aria-label="Register form" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      <div>
        <label style={label} htmlFor="reg-user">Username</label>
        <input id="reg-user" style={input} value={username} onChange={(e) => setUsername(e.target.value)}
          autoComplete="username" placeholder="e.g. ravi.kafle" required />
      </div>
      <div>
        <label style={label} htmlFor="reg-id">Member ID <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
        <input id="reg-id" style={input} value={userId} onChange={(e) => setUserId(e.target.value)}
          placeholder="Leave blank and we assign one" />
      </div>
      <div>
        <label style={label} htmlFor="reg-pw">Password</label>
        <input id="reg-pw" style={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password" placeholder="At least 8 characters" required minLength={8} />
      </div>
      <div>
        <label style={label} htmlFor="reg-mail">Email</label>
        <input id="reg-mail" style={input} type="email" value={gmail} onChange={(e) => setGmail(e.target.value)}
          autoComplete="email" placeholder="you@gmail.com" required />
        <p style={{ ...note, margin: '0.35rem 0 0' }}>
          Used only to send a password-reset code. We do not verify it.
        </p>
      </div>

      {error && <p role="alert" style={{ ...note, color: 'hsl(var(--destructive))', margin: 0 }}>{error}</p>}

      <button type="submit" className="btn btn-primary" style={btn} disabled={busy}>
        {busy ? 'Creating…' : 'Create account'}
      </button>
      <button type="button" className="btn" style={btn} onClick={onSwitchToLogin} disabled={busy}>
        I already have an account
      </button>
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
      setMailWorks(r.email_delivery);
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
            Enter your username, member ID, or the email you registered with.
          </p>
          <div>
            <label style={label} htmlFor="fp-id">Username, member ID or email</label>
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
              ? <>We sent a reset code to the address on <strong>{identifier.trim()}</strong>. Enter it below.</>
              : <>Email delivery is not configured on this server, so the code is in the server log.</>}
          </p>
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
