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
import { rulesQualityOverrideTranslations } from './rules_quality_override';
import { interfacePolishTranslations } from './interface_polish';
import { localeCleanupTranslations } from './locale_cleanup';
import { accessGateTranslations } from './access_gate';

export { SUPPORTED_LANGUAGES, type Locale } from './types';

const dictionaries = {
  en: { ...en, ...featureTranslations.en, ...policyTranslations.en, ...policyOverrideTranslations.en, ...statusOverrideTranslations.en, ...qualityOverrideTranslations.en, ...rulesQualityOverrideTranslations.en, ...interfacePolishTranslations.en, ...localeCleanupTranslations.en, ...accessGateTranslations.en },
  es: { ...es, ...featureTranslations.es, ...policyTranslations.es, ...policyOverrideTranslations.es, ...statusOverrideTranslations.es, ...qualityOverrideTranslations.es, ...rulesQualityOverrideTranslations.es, ...interfacePolishTranslations.es, ...localeCleanupTranslations.es, ...accessGateTranslations.es },
  fil: { ...fil, ...featureTranslations.fil, ...policyTranslations.fil, ...policyOverrideTranslations.fil, ...statusOverrideTranslations.fil, ...qualityOverrideTranslations.fil, ...rulesQualityOverrideTranslations.fil, ...interfacePolishTranslations.fil, ...localeCleanupTranslations.fil, ...accessGateTranslations.fil },
  hi: { ...hi, ...featureTranslations.hi, ...policyTranslations.hi, ...policyOverrideTranslations.hi, ...statusOverrideTranslations.hi, ...qualityOverrideTranslations.hi, ...rulesQualityOverrideTranslations.hi, ...interfacePolishTranslations.hi, ...localeCleanupTranslations.hi, ...accessGateTranslations.hi },
  pt: { ...pt, ...featureTranslations.pt, ...policyTranslations.pt, ...policyOverrideTranslations.pt, ...statusOverrideTranslations.pt, ...qualityOverrideTranslations.pt, ...rulesQualityOverrideTranslations.pt, ...interfacePolishTranslations.pt, ...localeCleanupTranslations.pt, ...accessGateTranslations.pt },
  id: { ...id, ...featureTranslations.id, ...policyTranslations.id, ...policyOverrideTranslations.id, ...statusOverrideTranslations.id, ...qualityOverrideTranslations.id, ...rulesQualityOverrideTranslations.id, ...interfacePolishTranslations.id, ...localeCleanupTranslations.id, ...accessGateTranslations.id },
  vi: { ...vi, ...featureTranslations.vi, ...policyTranslations.vi, ...policyOverrideTranslations.vi, ...statusOverrideTranslations.vi, ...qualityOverrideTranslations.vi, ...rulesQualityOverrideTranslations.vi, ...interfacePolishTranslations.vi, ...localeCleanupTranslations.vi, ...accessGateTranslations.vi },
  fr: { ...fr, ...featureTranslations.fr, ...policyTranslations.fr, ...policyOverrideTranslations.fr, ...statusOverrideTranslations.fr, ...qualityOverrideTranslations.fr, ...rulesQualityOverrideTranslations.fr, ...interfacePolishTranslations.fr, ...localeCleanupTranslations.fr, ...accessGateTranslations.fr },
  de: { ...de, ...featureTranslations.de, ...policyTranslations.de, ...policyOverrideTranslations.de, ...statusOverrideTranslations.de, ...qualityOverrideTranslations.de, ...rulesQualityOverrideTranslations.de, ...interfacePolishTranslations.de, ...localeCleanupTranslations.de, ...accessGateTranslations.de },
  ru: { ...ru, ...featureTranslations.ru, ...policyTranslations.ru, ...policyOverrideTranslations.ru, ...statusOverrideTranslations.ru, ...qualityOverrideTranslations.ru, ...rulesQualityOverrideTranslations.ru, ...interfacePolishTranslations.ru, ...localeCleanupTranslations.ru, ...accessGateTranslations.ru },
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
