import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void }) => void;
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

  const id =
    clientId ??
    ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GOOGLE_CLIENT_ID ?? '');

  useEffect(() => {
    if (!id || !holder.current) return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !holder.current || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: id,
          callback: (r) => onCredential(r.credential),
        });
        window.google.accounts.id.renderButton(holder.current, {
          theme: document.documentElement.classList.contains('dark') ? 'filled_black' : 'outline_black',
          size: 'large',
          width: 320,
          text: 'continue_with',
          shape: 'rectangular',
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

  if (!id || unavailable) return null;

  return <div ref={holder} style={{ display: 'flex', justifyContent: 'center' }} />;
};

export default GoogleSignInButton;
