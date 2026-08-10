export type FormStep =
  | 'rules'
  | 'title'
  | 'original_language'
  | 'chapter_count'
  | 'publication_status'
  | 'source_url'
  | 'raw_file'
  | 'genres_tags'
  | 'sexual_content'
  | 'sensitive_content'
  | 'notes'
  | 'confirm';

export type PublicationStatus = 'ongoing' | 'completed';
export type QueueStatus = 'queued' | 'in_progress' | 'completed';

export type SubmissionDraft = {
  title?: string;
  original_language?: string;
  chapter_count?: number;
  publication_status?: PublicationStatus;
  source_url?: string;
  raw_file_id?: string;
  raw_file_name?: string;
  raw_file_mime?: string;
  genres_tags?: string;
  sexual_content?: string;
  sensitive_content?: string;
  notes?: string;
};

export type UserRow = {
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  language: string;
  language_selected: number;
  created_at?: string | null;
  updated_at?: string | null;
  activated_at?: string | null;
  activated_via?: 'legacy' | 'bot' | 'miniapp' | null;
  last_seen_at?: string | null;
  last_limit_reset_notified_month?: string | null;
  last_promo_at?: string | null;
  promo_opt_out?: number;
  miniapp_onboarded_at?: string | null;
  adult_confirmed_at?: string | null;
};

export type SessionRow = {
  step: FormStep;
  data: string;
};

export type SubmissionRow = {
  id: number;
  user_id: number;
  language: string;
  title: string;
  original_language: string;
  chapter_count: number;
  publication_status: PublicationStatus;
  source_url: string | null;
  raw_file_id: string;
  raw_file_name: string | null;
  raw_file_mime: string | null;
  genres_tags: string;
  sexual_content: string;
  sensitive_content: string;
  notes: string | null;
  plan: 'free' | 'subscriber';
  status: string;
  slot_returned: number;
  admin_summary_sent: number;
  admin_file_sent: number;
  queue_status: QueueStatus | null;
  queue_position: number | null;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  current_chapter: number | null;
  progress_updated_at: string | null;
};

export type SubscriptionState = {
  subscriber: boolean;
  verificationError: boolean;
};

export const MAX_TITLE = 300;
export const MAX_SHORT = 120;
export const MAX_SOURCE = 500;
export const MAX_LONG = 450;

export const FREE_MONTHLY_REQUEST_LIMIT = 1;
export const SUBSCRIBER_MONTHLY_REQUEST_LIMIT = 5;
export const REGULAR_MAX_CHAPTERS = 250;
export const MAX_REASONABLE_CHAPTERS = 10_000_000;

export const MINI_APP_MAX_UPLOAD_BYTES = 45 * 1024 * 1024;
export const MINI_APP_ALLOWED_FILE_EXTENSIONS = ['txt', 'epub'] as const;