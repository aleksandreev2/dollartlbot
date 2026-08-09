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
import { featureTranslations } from './features';

export { SUPPORTED_LANGUAGES, type Locale } from './types';

const dictionaries = {
  en: { ...en, ...featureTranslations.en },
  es: { ...es, ...featureTranslations.es },
  fil: { ...fil, ...featureTranslations.fil },
  hi: { ...hi, ...featureTranslations.hi },
  pt: { ...pt, ...featureTranslations.pt },
  id: { ...id, ...featureTranslations.id },
  vi: { ...vi, ...featureTranslations.vi },
  fr: { ...fr, ...featureTranslations.fr },
  de: { ...de, ...featureTranslations.de },
  ru: { ...ru, ...featureTranslations.ru },
} as const;

export type TranslationKey = keyof typeof dictionaries.en;
type Dictionary = Partial<Record<TranslationKey, string>>;

export function normalizeLocale(value: string | null | undefined): Locale {
  if (value && value in dictionaries) return value as Locale;
  return 'en';
}

export function t(locale: Locale, key: TranslationKey): string {
  const dictionary = dictionaries[locale] as Dictionary;
  return dictionary[key] ?? dictionaries.en[key];
}
