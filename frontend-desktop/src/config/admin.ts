/**
 * Admin configuration.
 * Only the username(s) listed here can access the Upload/Admin page.
 * Change this to your own username.
 */
export const ADMIN_USERNAMES = ['elfak'];

export const isAdmin = (userId: string): boolean => {
  return ADMIN_USERNAMES.includes(userId.toLowerCase().trim());
};
// redeploy
