/**
 * Admin gate.
 *
 * The authoritative signal is the `a` (admin) claim inside the signed session
 * token, which the backend mints from ADMIN_USERNAME. That keeps the frontend
 * correct no matter what ADMIN_USERNAME is set to in the environment.
 *
 * The hardcoded list below is only a fallback for the brief window before a
 * token exists. It used to be the ONLY check, which silently broke /admin
 * whenever ADMIN_USERNAME was set to anything other than "elfak".
 */
export const ADMIN_USERNAMES = ['elfak'];

const SESSION_KEY = 'fpsc-session';

/** Read the admin flag out of the signed session token. Null if unavailable. */
function adminClaimFromToken(): boolean | null {
  try {
    const token = localStorage.getItem(SESSION_KEY);
    if (!token) return null;
    const payload = token.split('.')[0];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json);
    if (typeof claims?.a === 'number') return claims.a === 1;
    return null;
  } catch {
    return null;
  }
}

export const isAdmin = (userId: string): boolean => {
  // Token claim wins — it reflects the server's real ADMIN_USERNAME.
  const claim = adminClaimFromToken();
  if (claim !== null) return claim;
  if (!userId) return false;
  return ADMIN_USERNAMES.includes(userId.toLowerCase().trim());
};
