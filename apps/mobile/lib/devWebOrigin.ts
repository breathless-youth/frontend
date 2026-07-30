import Constants from "expo-constants";

/**
 * `apps/web`을 **Vite dev 서버에서 직접** 불러오기 위한 개발용 오리진.
 *
 * ## 왜 필요한가
 *
 * 평소 세션 WebView는 앱에 동봉된 `assets/web-dist`를 로컬 정적 서버로 서빙한다(ADR 0005).
 * 그 구조의 대가는 **`apps/web`을 한 줄만 고쳐도 네이티브 재빌드**라는 것이다 —
 * 웹 빌드 → `sync-web` → prebuild → gradle/xcodebuild → 설치. 2026-07-30 실측으로
 * Android가 약 12분, iOS 실기기가 약 25분이었다. 세션 화면·Vision·프리뷰는 전부
 * `apps/web`에 있으므로 이 비용이 모든 반복에 붙는다.
 *
 * 이 값을 주면 정적 서버를 **아예 띄우지 않고** dev 서버 주소를 그대로 WebView에 넘긴다.
 * 그러면 웹 수정이 HMR로 즉시 반영되고 재빌드가 사라진다.
 *
 * ## secure context 제약 — 아무 주소나 되지 않는다
 *
 * `getUserMedia`는 secure context에서만 카메라를 연다. `http://`는 **`localhost`일 때만**
 * secure context로 인정되므로, 기기에서 Mac의 dev 서버에 닿는 방법이 플랫폼마다 다르다.
 *
 * - **Android**: `adb reverse tcp:5173 tcp:5173`으로 기기의 `localhost:5173`을 Mac으로
 *   넘긴다. 그래서 `http://localhost:5173`이 그대로 통한다.
 * - **iOS 실기기**: `adb reverse`에 해당하는 것이 없다. LAN IP(`http://192.168.x.x:5173`)는
 *   secure context가 아니라 **카메라가 막힌다**. `mkcert`로 dev 서버에 HTTPS를 붙이고
 *   기기에 루트 인증서를 신뢰시켜 `https://192.168.x.x:5173`으로 접속해야 한다.
 *
 * 설정 절차는 `apps/mobile/CLAUDE.md`의 "웹 dev 서버로 세션 화면 띄우기" 참고.
 *
 * ## 주입 수단
 *
 * `app.json extra.*` → `Constants.expoConfig?.extra?.*` 패턴을 따른다 —
 * `lib/updateNotice.ts`가 정한 "새 주입 수단을 만들지 않는다"는 규칙 그대로다.
 * Dev Client에서는 이 값이 Metro가 서빙하는 매니페스트로 오므로 **Metro만 재시작하면**
 * 반영된다(네이티브 재빌드 불필요).
 *
 * ⚠️ **값을 커밋하지 말 것.** iOS는 LAN IP가 기기·네트워크마다 다르고, 값이 남은 채
 * 배포되면 릴리스 앱이 존재하지 않는 dev 서버를 보게 된다. 커밋된 기본값은 빈 문자열이다.
 */
export const WEB_DEV_URL_KEY = "webDevUrl";

/**
 * 개발용 웹 오리진, 없으면 `null`.
 *
 * `null`이면 호출부는 평소대로 동봉 자산 + 로컬 정적 서버 경로를 탄다.
 *
 * **프로덕션에서는 값이 있어도 무시한다.** 실수로 값이 남은 채 배포돼도 릴리스 앱이
 * 개발 기기를 향하지 않게 하는 방어선이다 — 그런 앱은 세션이 통째로 열리지 않으므로
 * 조용한 실패가 아니라 전면 장애가 된다.
 */
export function resolveDevWebOrigin(): string | null {
  if (!__DEV__) {
    return null;
  }
  const raw: unknown = Constants.expoConfig?.extra?.[WEB_DEV_URL_KEY];
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  // 빈 문자열이 "꺼짐"이다 — 키를 지우지 않고 값만 비우면 되도록.
  if (trimmed === "") {
    return null;
  }
  // http/https만 받는다. 오타로 `192.168.0.19:5173`처럼 스킴이 빠지면 WebView가
  // 상대 경로로 해석해 원인을 짚기 어려운 실패가 된다.
  if (!/^https?:\/\//.test(trimmed)) {
    console.warn(`[room] extra.${WEB_DEV_URL_KEY}에 스킴이 없습니다 — 무시합니다: ${trimmed}`);
    return null;
  }
  return trimmed.replace(/\/$/, "");
}
