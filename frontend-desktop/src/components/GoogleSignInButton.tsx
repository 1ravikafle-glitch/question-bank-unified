import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string;
            callback: (r: { credential: string }) => void;
            use_fedcm_for_prompt?: boolean;
            error_callback?: (e: unknown) => void;
          }) => void;
          renderButton: (parent: HTMLElement, cfg: Record<string, unknown>) => void;
        };
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;

/** Load Google Identity Services once per page. Free, needs no client secret,
 *  and it hands us an ID token directly so the backend never sees a Google
 *  password. */
function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.dataset.gsi = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google sign-in failed to load'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Real Google sign-in via Google Identity Services.
 *
 * Renders nothing when VITE_GOOGLE_CLIENT_ID is not set, so a deployment
 * without Google simply does not show the button. `onCredential` normally
 * POSTs the token to /auth/google.
 */
const GoogleSignInButton: React.FC<{
  clientId?: string;
  onCredential: (credential: string) => void;
}> = ({ clientId, onCredential }) => {
  const holder = useRef<HTMLDivElement | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [, setRetryN] = useState(0);

  const id =
    clientId ??
    ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GOOGLE_CLIENT_ID ?? '');

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !holder.current) return;
    let cancelled = false;
    setLoadError(null);
    loadGsi()
      .then(() => {
        if (cancelled || !holder.current || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: id,
          callback: (r) => onCredential(r.credential),
          // FedCM migration flag: harmless for the button popup flow, required
          // if Google ever routes through One Tap. Without it newer Chrome
          // silently drops the credential and the user sees nothing happen.
          use_fedcm_for_prompt: true,
          // Surface popup/origin failures instead of dying silently. The most
          // common one is an unauthorized origin: the Render domain must be
          // listed in the OAuth client's authorized JavaScript origins, or
          // Google refuses before any token exists.
          error_callback: (e: unknown) => {
            if (cancelled) return;
            const msg = typeof e === 'string' ? e : (e as { message?: string })?.message || '';
            setLoadError(
              /origin|redirect_uri|not allowed/i.test(msg)
                ? 'This site is not authorized in Google Cloud Console for this sign-in. The site owner must add its domain to the OAuth client\'s authorized origins.'
                : 'Google could not start sign-in. Check popups are allowed and try again.'
            );
          },
        });
        // Full card width (GSI caps at 400): a narrow floating button reads
        // broken. Measure the holder so it fills whatever card it sits in.
        const w = Math.min(400, Math.max(280, Math.round(holder.current.clientWidth || 320)));
        window.google.accounts.id.renderButton(holder.current, {
          theme: document.documentElement.classList.contains('dark') ? 'filled_black' : 'outline_black',
          size: 'large',
          width: w,
          text: 'continue_with',
          shape: 'pill',
          // Google localizes the button from the browser; pin English so it
          // matches the app instead of following IP geolocation.
          locale: 'en',
        });
      })
      .catch(() => {
        // Offline, ad-blocked, or CSP-blocked. Hide rather than show a dead button.
        if (!cancelled) setUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id, onCredential]);

  const retry = () => {
    setUnavailable(false);
    setLoadError(null);
    scriptPromise = null;
    // Re-run by toggling holder content: simplest is a state bump.
    setRetryN((n) => n + 1);
  };

  if (!id || unavailable) return null;
  if (loadError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <p role="alert" style={{ fontSize: '0.8125rem', color: 'hsl(var(--wrong-600))', textAlign: 'center', maxWidth: 300 }}>{loadError}</p>
        <button type="button" onClick={retry} className="btn btn-outline btn-sm" style={{ padding: '6px 14px' }}>
          Try again
        </button>
      </div>
    );
  }

  return <div ref={holder} style={{ display: 'flex', justifyContent: 'center', width: '100%', minHeight: '44px' }} />;
};

export default GoogleSignInButton;
