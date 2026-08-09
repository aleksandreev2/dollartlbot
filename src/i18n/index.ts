import { SUPPORTED_LANGUAGES, type Locale } from './types';
import { en } from './en';
import { es } from './es';
import { fil } from './fil';
import { hi } from './hi';
import { pt } from './pt';
import { id } from './id';
import { vi } from './vi';
import { fr } from './fr';
import { de } from './de';
import { ru } from './ru';

export { SUPPORTED_LANGUAGES, type Locale } from './types';
export type TranslationKey = keyof typeof en;

type Dictionary = Partial<Record<TranslationKey, string>>;
const dictionaries: Record<Locale, Dictionary> = { en, es, fil, hi, pt, id, vi, fr, de, ru };

export function normalizeLocale(value: string | null | undefined): Locale {
  if (value && value in dictionaries) return value as Locale;
  return 'en';
}

export function t(locale: Locale, key: TranslationKey): string {
  return dictionaries[locale]?.[key] ?? en[key];
}
