import { api, SESSION_TOKEN_KEY, SSO_TOKEN_KEY } from './client';
export const authLogin = async (username: string, password: string) => {
  const response = await api.post<{
    user_identifier: string;
    is_new: boolean;
    sso_token?: string | null;
    session_token?: string | null;
  }>('/auth/login', {
    username,
    password,
  });
  const data = response.data;
  try {
    if (data.session_token) localStorage.setItem(SESSION_TOKEN_KEY, data.session_token);
    if (data.sso_token) localStorage.setItem(SSO_TOKEN_KEY, data.sso_token);
  } catch {
    /* private mode — tokens stay in memory only */
  }
  return data;
};

// Fetch per-category question counts (small response — use this instead
// of downloading the whole bank to count categories).

export const authRegister = async (body: {
  username: string;
  password: string;
  /** The Gmail address this account belongs to. Verified by code afterwards. */
  email?: string | null;
  /** Legacy field name; the server accepts either. */
  gmail?: string | null;
  user_id?: string;
}) => {
  const response = await api.post<{
    ok: boolean;
    /** Null until the address is verified - that is what earns the ID. */
    user_id: string | null;
    message: string;
    // Minted at signup so the app can sign the new account straight in.
    session_token?: string | null;
    next_step: string;
    email_verified: boolean;
    /** Whether the verification mail actually went out. The UI must not show
     *  "check your inbox" when this is false. */
    email_delivery: boolean;
    delivery_failed: boolean;
  }>('/auth/register', body);
  return response.data;
};

/** The signed-in account's own profile. `email` is decrypted server-side. */

export const authMe = async (): Promise<{
  username: string;
  user_id: string | null;
  email: string | null;
  email_verified: boolean;
  is_admin: boolean;
}> => {
  const response = await api.get('/auth/me');
  return response.data;
};

/** Add / change the address from Settings. Doing so drops `email_verified`
 *  back to false, so the new address has to be proven too. */

export const authUpdateEmail = async (email: string) => {
  const response = await api.put<{
    ok: boolean;
    email: string | null;
    email_verified: boolean;
    user_id: string | null;
  }>('/auth/email', { email });
  return response.data;
};

/** Re-send a verification code to the signed-in account. */

export const authSendVerification = async (username: string) => {
  const response = await api.post<{
    ok: boolean;
    sent: boolean;
    delivery_failed?: boolean;
    message: string;
  }>('/auth/send-verification', { username });
  return response.data;
};

/** Exchange a verification code for `email_verified` and a member ID. */

export const authConfirmEmail = async (username: string, code: string) => {
  const response = await api.post<{
    ok: boolean;
    already_verified: boolean;
    message?: string;
    user_id: string | null;
    email_verified: boolean;
  }>('/auth/confirm-email', { username, code });
  return response.data;
};

/** Ask for a reset code. The reply is deliberately the same whether or not the
 *  account exists, so it cannot be used to discover who has one - but it DOES
 *  say when the mail server could not be reached, because that is our problem
 *  rather than a fact about the account. */

export const authForgotPasswordOtp = async (identifier: string) => {
  const response = await api.post<{
    message: string;
    email_delivery: boolean;
    delivery_failed?: boolean;
  }>('/auth/forgot-password-otp', { identifier });
  return response.data;
};

/** Exchange a correct code for a high-entropy reset token. Only that token can
 *  change the password, so a short typed code is never what authorises it. */

export const authVerifyResetCode = async (identifier: string, code: string) => {
  const response = await api.post<{ reset_token: string; expires_in_minutes: number }>(
    '/auth/verify-reset-code',
    { identifier, code }
  );
  return response.data;
};


export const authResetPasswordWithToken = async (resetToken: string, newPassword: string) => {
  const response = await api.post<{ ok: boolean; message: string }>(
    '/auth/reset-password-with-token',
    { reset_token: resetToken, new_password: newPassword }
  );
  return response.data;
};

/** Which sign-in methods this deployment has enabled. */

export const authProviders = async () => {
  const response = await api.get<{
    password: boolean;
    google: boolean;
    /** OAuth client ID (public). When present, the Google button initializes
     *  from it at runtime - no build-time env var needed. */
    google_client_id?: string | null;
    email_delivery: boolean;
  }>('/auth/providers');
  return response.data;
};

/** Exchange a Google ID token for a session. */

export const authGoogle = async (credential: string) => {
  const response = await api.post<{
    user_identifier: string;
    is_new: boolean;
    sso_token?: string | null;
    session_token?: string | null;
  }>('/auth/google', { credential });
  return response.data;
};

/** Delete one of the caller's own quiz attempts. */
