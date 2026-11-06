import { type AppLocale, negotiateLocale } from "@focusmakers/types";

export type { AppLocale };

/**
 * 앱 표시 언어 결정
 *
 * 셸이 웹뷰 첫 URL에만 `?lang`을 붙이므로 문서를 새로 여는 이동에서는 저장값을 본다.
 * Android 앱별 언어가 시스템 언어와 다르면 웹뷰의 navigator.languages가 시스템 언어를 돌려줄 수 있어 저장값을 그보다 먼저 본다.
 * 카탈로그가 있는 언어만 SUPPORTED_LOCALES에 넣으므로 결과는 늘 이 목록 안이다.
 * index.html 인라인 스크립트가 같은 규칙을 따로 구현하고, indexHtml.test.ts가 둘이 같은지 확인한다.
 */
export const SUPPORTED_LOCALES: readonly AppLocale[] = ["ko", "en", "ja", "zh-Hant"];

export const LOCALE_STORAGE_KEY = "fm.locale";

export function resolveLocale(
  search: string,
  languages: readonly string[],
  stored?: string | null,
): AppLocale {
  const requested = new URLSearchParams(search).get("lang");
  if (requested) return negotiateLocale([requested], SUPPORTED_LOCALES);
  const storedLocale = SUPPORTED_LOCALES.find((locale) => locale === stored);
  if (storedLocale) return storedLocale;
  return negotiateLocale(languages, SUPPORTED_LOCALES);
}
