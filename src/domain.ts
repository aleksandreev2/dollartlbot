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
};

export type SubscriptionState = {
  subscriber: boolean;
  verificationError: boolean;
};

export const MAX_TITLE = 300;
export const MAX_SHORT = 120;
export const MAX_SOURCE = 500;
export const MAX_LONG = 450;
