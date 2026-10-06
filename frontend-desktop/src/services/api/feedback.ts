import { api } from './client';
export interface FeedbackThread {
  id: number;
  message: string;
  status: string;
  admin_reply?: string | null;
  created_at?: string | null;
  replied_at?: string | null;
}

/** Author's own threads (authenticated, caller-scoped server-side). */

export const fetchMyFeedback = async (): Promise<{ feedback: FeedbackThread[] }> => {
  const response = await api.get('/feedback/mine');
  return response.data;
};

/** Submit a suggestion. Server enforces 2 per rolling 24h per account (429 beyond). */

export const sendFeedback = async (message: string) => {
  const response = await api.post('/feedback', { message });
  return response.data;
};

// Admin: anonymous inbox (no author identity in responses, by construction).

export const fetchAdminFeedback = async (): Promise<{ feedback: FeedbackThread[]; pending: number }> => {
  const response = await api.get('/feedback/admin/all');
  return response.data;
};


export const replyFeedback = async (id: number, reply: string, status: string) => {
  const response = await api.post(`/feedback/admin/${id}/reply`, { reply, status });
  return response.data;
};

// Admin: manage the About-page credits.
