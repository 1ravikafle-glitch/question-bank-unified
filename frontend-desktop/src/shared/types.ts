export interface Question {
  id: number;
  question_number: number;
  question_text: string;
  options: Record<string, string>;
  correct_answer: string;
  category?: string;
  difficulty?: string;
  created_at?: string;
  updated_at?: string;
}

export interface QuestionCreate {
  question_number: number;
  question_text: string;
  options: Record<string, string>;
  correct_answer: string;
  category?: string;
  difficulty?: string;
}

export interface QuizSubmission {
  answers: Record<number, string>;
  username?: string;
}

export interface QuizResult {
  score: number;
  total_questions: number;
  percentage: number;
  correct_answers: Record<number, boolean>;
  incorrect_questions: number[];
  raw_score?: number;
  negative_marking?: number;
  skipped_questions?: number[];
}

/** Mock-exam configuration passed via router state into /quiz. */
export interface ExamConfig {
  title: string;
  count: number;
  minutes: number;
  negative: number;
  category?: string;
}

export interface UserProgress {
  id: number;
  user_identifier?: string;
  question_id: number;
  is_correct: boolean;
  attempted_at?: string;
  reviewed_at?: string;
}

export interface QuizAttempt {
  id: number;
  user_identifier?: string;
  score: number;
  total_questions: number;
  percentage: number;
  answers: Record<number, string>;
  completed_at?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}

export interface QuestionsFilterParams {
  category?: string;
  difficulty?: string;
  skip?: number;
  limit?: number;
}

export interface QuizParams {
  count?: number;
  category?: string;
  difficulty?: string;
}

/**
 * Attempts with fewer questions never surface in Results history or
 * Progress activity (too small to mean anything). Saving/tracking still
 * happens — this is display-level only.
 */
export const MIN_QUESTIONS_FOR_HISTORY = 5;