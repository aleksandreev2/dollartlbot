export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: '🇬🇧 English' },
  { code: 'es', label: '🇪🇸 Español' },
  { code: 'fil', label: '🇵🇭 Filipino' },
  { code: 'hi', label: '🇮🇳 हिन्दी' },
  { code: 'pt', label: '🇧🇷 Português' },
  { code: 'id', label: '🇮🇩 Bahasa Indonesia' },
  { code: 'vi', label: '🇻🇳 Tiếng Việt' },
  { code: 'fr', label: '🇫🇷 Français' },
  { code: 'de', label: '🇩🇪 Deutsch' },
  { code: 'ru', label: '🇷🇺 Русский' },
  { code: 'ur', label: '🇵🇰 اردو' },
] as const;

export type Locale = (typeof SUPPORTED_LANGUAGES)[number]['code'];
