import { translations, LanguageCode, TranslationDict } from "./translations";

export type { LanguageCode, TranslationDict };
export { translations };

export function getTranslation(key: keyof TranslationDict, lang: LanguageCode = "en"): string {
  const dict = translations[lang] || translations.en;
  return dict[key] || translations.en[key] || key;
}

export function formatLocalizedDate(timestamp: number, lang: LanguageCode = "en"): string {
  try {
    const date = new Date(timestamp);
    const localeMap: Record<LanguageCode, string> = {
      en: "en-US",
      de: "de-DE",
      fr: "fr-FR",
      es: "es-ES",
      ja: "ja-JP",
      hi: "hi-IN",
    };
    return new Intl.DateTimeFormat(localeMap[lang] || "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

export function formatLocalizedFileSize(bytes: number, lang: LanguageCode = "en"): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const num = parseFloat((bytes / Math.pow(k, i)).toFixed(1));

  const localeMap: Record<LanguageCode, string> = {
    en: "en-US",
    de: "de-DE",
    fr: "fr-FR",
    es: "es-ES",
    ja: "ja-JP",
    hi: "hi-IN",
  };

  try {
    const formattedNum = new Intl.NumberFormat(localeMap[lang] || "en-US", {
      maximumFractionDigits: 1,
    }).format(num);
    return `${formattedNum} ${sizes[i]}`;
  } catch {
    return `${num} ${sizes[i]}`;
  }
}
