import { useCallback } from "react";
import { useApp } from "@/app/store";
import { translations } from "./translations";

/**
 * Hook that returns a translation function `t(key)` for the current language.
 * Falls back to English if a key is missing in the selected language.
 */
export function useTranslation() {
  const { language } = useApp();

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = translations[language] ?? translations.en;
      let text = dict[key as keyof typeof dict] ?? translations.en[key as keyof typeof translations.en] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replace(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [language]
  );

  return { t, language };
}
