/**
 * 기기 지역
 *
 * 기기 첫 언어 태그(`zh-Hant-TW`, `ko-KR`)의 지역을 ISO 3166-1 두 글자로 돌려준다.
 * 광고 나라별 분석에 쓰여서 지역이 없는 태그(`ja`)는 언어로 나라를 추측하지 않고 null로 둔다.
 * `es-419` 같은 숫자 지역도 나라가 아니라 null이다.
 */
export function deviceRegion(): string | null {
  const tag = navigator.languages?.[0] ?? navigator.language;
  if (!tag) return null;
  let region: string | undefined;
  try {
    region = new Intl.Locale(tag).region;
  } catch {
    return null;
  }
  return region !== undefined && /^[A-Z]{2}$/.test(region) ? region : null;
}
