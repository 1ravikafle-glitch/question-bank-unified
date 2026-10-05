import type { Question, QuestionCreate, QuizSubmission, QuizResult, UserProgress, QuizAttempt, PaginatedResponse, QuestionsFilterParams, QuizParams } from '@/shared/types';
import { api } from './client';
import type { ReferenceItem, ContributorItem } from './questions';


export const uploadQuestionBankDocx = async (files: File[], category?: string) => {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  if (category) {
    formData.append('category', category);
  }
  const response = await api.post('/admin/upload-docx', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};


export const updateQuestion = async (
  id: number,
  updates: Partial<{
    question_number: number;
    question_text: string;
    options: Record<string, string>;
    correct_answer: string;
    category: string;
    difficulty: string | null;
  }>
) => {
  const response = await api.put(`/admin/questions/${id}`, updates);
  return response.data;
};

// Fetch detailed analysis of a past quiz attempt

export const fetchAdminCategories = async (): Promise<{ name: string; count: number }[]> => {
  const response = await api.get('/admin/categories');
  return response.data;
};

// Rename a category

export const renameCategory = async (oldName: string, newName: string) => {
  const response = await api.put('/admin/categories/rename', { old_name: oldName, new_name: newName });
  return response.data;
};

// Delete a category and all its questions

export const deleteCategory = async (categoryName: string) => {
  const response = await api.delete(`/admin/categories/${encodeURIComponent(categoryName)}`);
  return response.data;
};

// Public: admin-assigned category emoji map

export const fetchCategoryMeta = async (): Promise<Record<string, string>> => {
  const response = await api.get<{ emoji: Record<string, string> }>('/questions/category-meta');
  return response.data.emoji || {};
};

// Admin: set/clear a category emoji

export const setCategoryEmoji = async (category: string, emoji: string) => {
  const response = await api.put('/admin/category-meta', { category, emoji });
  return response.data;
};


export const fetchAdminReferences = async (): Promise<{ references: ReferenceItem[] }> => {
  const response = await api.get('/admin/references');
  return response.data;
};


export const addReference = async (r: { title: string; author: string; detail: string; url: string; position: number }) => {
  const response = await api.post('/admin/references', r);
  return response.data;
};


export const updateReference = async (id: number, r: { title: string; author: string; detail: string; url: string; position: number }) => {
  const response = await api.put(`/admin/references/${id}`, r);
  return response.data;
};


export const deleteReference = async (id: number) => {
  const response = await api.delete(`/admin/references/${id}`);
  return response.data;
};

// Admin: list all users

export const fetchAdminUsers = async (): Promise<{ id: number; username: string; created_at: string }[]> => {
  const response = await api.get('/auth/users');
  return response.data.users;
};

// Admin: get a user's progress

export const fetchAdminUserProgress = async (username: string) => {
  const response = await api.get(`/auth/users/${encodeURIComponent(username)}/progress`);
  return response.data;
};

// Admin: delete a user

export const deleteAdminUser = async (username: string) => {
  const response = await api.delete(`/auth/users/${encodeURIComponent(username)}`);
  return response.data;
};

// ── Bookmarks (offline-ready) ────────────────────────────────────
// Outbox holds qids toggled while offline, replayed in order on reconnect
// (toggle-twice collapses to zero — order makes it exact).




export const fetchPastPapers = async (): Promise<{
  papers: Array<{
    id: number;
    filename: string;
    category?: string;
    kind: 'past_paper' | 'questions';
    question_count: number;
    with_answer: number;
    approved_at?: string | null;
    payload: any;
  }>;
}> => {
  const response = await api.get('/uploads/past-papers');
  return response.data;
};

/** Download a past paper as DOCX. */

export const downloadPastPaper = async (paperId: number): Promise<Blob> => {
  const response = await api.get(`/uploads/past-papers/${paperId}/download`, {
    responseType: 'blob',
  });
  return response.data;
};


export const fetchAdminContributors = async (): Promise<{ contributors: ContributorItem[] }> => {
  const response = await api.get('/admin/contributors');
  return response.data;
};

export const addContributor = async (c: { name: string; role: string; position: number }) => {
  const response = await api.post('/admin/contributors', c);
  return response.data;
};

export const updateContributor = async (id: number, c: { name: string; role: string; position: number }) => {
  const response = await api.put(`/admin/contributors/${id}`, c);
  return response.data;
};

export const deleteContributor = async (id: number) => {
  const response = await api.delete(`/admin/contributors/${id}`);
  return response.data;
};
