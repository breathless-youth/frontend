/**
 * 앱 표시 언어
 *
 * 웹과 앱 셸이 같은 규칙으로 언어를 정해야 웹뷰 첫 화면과 셸 문구가 어긋나지 않아 여기서 함께 쓴다.
 */
export type AppLocale = "ko" | "en" | "ja" | "zh-Hant";

export const APP_LOCALES: readonly AppLocale[] = ["ko", "en", "ja", "zh-Hant"];

const ZH_HANT_REGIONS = ["tw", "hk", "mo"];

function mapTag(tag: string): AppLocale | null {
  const [language, second] = tag.toLowerCase().replace(/_/g, "-").split("-");
  if (language === "ko" || language === "ja" || language === "en") return language;
  if (language !== "zh") return null;
  // 문자 체계가 적혀 있으면 지역보다 그것을 따른다(zh-Hans-HK는 간체다).
  if (second === "hant") return "zh-Hant";
  return second !== undefined && ZH_HANT_REGIONS.includes(second) ? "zh-Hant" : null;
}

/**
 * 기기 선호 언어 목록에서 표시 언어 고르기
 *
 * 첫 언어만 보면 프랑스어·일본어 순으로 둔 사용자가 영어를 보게 되어 목록을 위에서부터 훑는다.
 * 간체 중국어처럼 지원하지 않는 언어는 건너뛰고, 끝까지 없으면 영어다.
 * Hermes에 Intl.Locale이 없어 태그를 직접 나눈다.
 */
export function negotiateLocale(
  preferred: readonly string[],
  supported: readonly AppLocale[],
): AppLocale {
  for (const tag of preferred) {
    const locale = mapTag(tag);
    if (locale && supported.includes(locale)) return locale;
  }
  return "en";
}
