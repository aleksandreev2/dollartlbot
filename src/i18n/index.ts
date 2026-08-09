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
import { qualityOverrideTranslations } from './quality_override';

export { SUPPORTED_LANGUAGES, type Locale } from './types';

const dictionaries = {
  en: { ...en, ...featureTranslations.en, ...policyTranslations.en, ...policyOverrideTranslations.en, ...statusOverrideTranslations.en, ...qualityOverrideTranslations.en },
  es: { ...es, ...featureTranslations.es, ...policyTranslations.es, ...policyOverrideTranslations.es, ...statusOverrideTranslations.es, ...qualityOverrideTranslations.es },
  fil: { ...fil, ...featureTranslations.fil, ...policyTranslations.fil, ...policyOverrideTranslations.fil, ...statusOverrideTranslations.fil, ...qualityOverrideTranslations.fil },
  hi: { ...hi, ...featureTranslations.hi, ...policyTranslations.hi, ...policyOverrideTranslations.hi, ...statusOverrideTranslations.hi, ...qualityOverrideTranslations.hi },
  pt: { ...pt, ...featureTranslations.pt, ...policyTranslations.pt, ...policyOverrideTranslations.pt, ...statusOverrideTranslations.pt, ...qualityOverrideTranslations.pt },
  id: { ...id, ...featureTranslations.id, ...policyTranslations.id, ...policyOverrideTranslations.id, ...statusOverrideTranslations.id, ...qualityOverrideTranslations.id },
  vi: { ...vi, ...featureTranslations.vi, ...policyTranslations.vi, ...policyOverrideTranslations.vi, ...statusOverrideTranslations.vi, ...qualityOverrideTranslations.vi },
  fr: { ...fr, ...featureTranslations.fr, ...policyTranslations.fr, ...policyOverrideTranslations.fr, ...statusOverrideTranslations.fr, ...qualityOverrideTranslations.fr },
  de: { ...de, ...featureTranslations.de, ...policyTranslations.de, ...policyOverrideTranslations.de, ...statusOverrideTranslations.de, ...qualityOverrideTranslations.de },
  ru: { ...ru, ...featureTranslations.ru, ...policyTranslations.ru, ...policyOverrideTranslations.ru, ...statusOverrideTranslations.ru, ...qualityOverrideTranslations.ru },
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
