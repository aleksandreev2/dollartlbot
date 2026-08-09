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
import { policyTranslations } from './policy';
import { policyOverrideTranslations } from './policy_override';
import { statusOverrideTranslations } from './status_override';

export { SUPPORTED_LANGUAGES, type Locale } from './types';

const dictionaries = {
  en: { ...en, ...featureTranslations.en, ...policyTranslations.en, ...policyOverrideTranslations.en, ...statusOverrideTranslations.en },
  es: { ...es, ...featureTranslations.es, ...policyTranslations.es, ...policyOverrideTranslations.es, ...statusOverrideTranslations.es },
  fil: { ...fil, ...featureTranslations.fil, ...policyTranslations.fil, ...policyOverrideTranslations.fil, ...statusOverrideTranslations.fil },
  hi: { ...hi, ...featureTranslations.hi, ...policyTranslations.hi, ...policyOverrideTranslations.hi, ...statusOverrideTranslations.hi },
  pt: { ...pt, ...featureTranslations.pt, ...policyTranslations.pt, ...policyOverrideTranslations.pt, ...statusOverrideTranslations.pt },
  id: { ...id, ...featureTranslations.id, ...policyTranslations.id, ...policyOverrideTranslations.id, ...statusOverrideTranslations.id },
  vi: { ...vi, ...featureTranslations.vi, ...policyTranslations.vi, ...policyOverrideTranslations.vi, ...statusOverrideTranslations.vi },
  fr: { ...fr, ...featureTranslations.fr, ...policyTranslations.fr, ...policyOverrideTranslations.fr, ...statusOverrideTranslations.fr },
  de: { ...de, ...featureTranslations.de, ...policyTranslations.de, ...policyOverrideTranslations.de, ...statusOverrideTranslations.de },
  ru: { ...ru, ...featureTranslations.ru, ...policyTranslations.ru, ...policyOverrideTranslations.ru, ...statusOverrideTranslations.ru },
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
