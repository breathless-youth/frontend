import Constants from "expo-constants";

/**
 * 원격 웹(`apps/web`) 베이스 URL — `app.json`의 `expo.extra.webBaseUrl`에서 읽는다.
 *
 * **BY-332a(배포·도메인 확정)가 아직 끝나지 않아 지금은 빈 문자열이다.** 값이 채워지면
 * 이 함수는 코드 수정 없이 그대로 동작한다 — 설정값 하나만 바뀐다. 빈 값으로 웹뷰를 띄우면
 * 흰 화면만 뜨고 원인을 알 수 없으므로, 여기서 명확하게 실패시킨다.
 * `lib/statsApi.ts`의 `apiBaseUrl()`과 같은 패턴이다.
 */
export function getWebBaseUrl(): string {
  const url = Constants.expoConfig?.extra?.webBaseUrl as string | undefined;
  if (!url) {
    throw new Error("app.json extra.webBaseUrl이 설정되지 않았습니다 (BY-332a 대기)");
  }
  return url;
}
