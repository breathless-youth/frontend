/**
 * 앱 표시 언어 결정
 *
 * 셸이 웹뷰 첫 URL에만 `?lang`을 붙이므로 문서를 새로 여는 이동에서는 저장값을 본다.
 * Android 앱별 언어가 시스템 언어와 다르면 웹뷰의 navigator.language가 시스템 언어를 돌려줄 수 있어 저장값을 그보다 먼저 본다.
 * index.html 인라인 스크립트가 같은 규칙을 따로 구현하고, indexHtml.test.ts가 둘이 같은지 확인한다.
 */
export type AppLocale = "ko" | "en";

export const SUPPORTED_LOCALES: readonly AppLocale[] = ["ko", "en"];

export const LOCALE_STORAGE_KEY = "fm.locale";

function toAppLocale(tag: string): AppLocale {
  return tag.toLowerCase().startsWith("ko") ? "ko" : "en";
}

export function resolveLocale(
  search: string,
  navigatorLanguage: string | undefined,
  stored?: string | null,
): AppLocale {
  const requested = new URLSearchParams(search).get("lang");
  if (requested) return toAppLocale(requested);
  if (stored === "ko" || stored === "en") return stored;
  return toAppLocale(navigatorLanguage ?? "");
}
