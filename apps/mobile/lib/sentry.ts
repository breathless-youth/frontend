import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

/**
 * 앱(네이티브 셸)의 에러 모니터링 초기화 — `app/_layout.tsx`가 렌더 전에 부른다.
 *
 * Sentry 프로젝트는 웹(`focusmakers-web`)·백엔드(`focusmakers-api`)와 **분리된**
 * `focusmakers-app`이다. 같은 세션이라도 웹뷰 안에서 난 에러는 웹 프로젝트로, 셸에서 난
 * 에러는 이쪽으로 간다 — 스택트레이스도 소스맵도 완전히 다른 산출물이라 한 통에 섞으면
 * 어느 쪽 릴리즈인지 구분이 안 된다.
 *
 * DSN은 `app.json`의 `extra.sentryDsn`에서 읽는다.
 */
export function initSentry(): void {
  const dsn = Constants.expoConfig?.extra?.sentryDsn as string | undefined;
  if (!dsn) {
    // 웹(`apps/web/src/lib/sentry.ts`)과 같은 계약 — 미설정이면 조용히 건너뛴다.
    return;
  }

  Sentry.init({
    dsn,

    /**
     * **개발 빌드에서는 보내지 않는다.** 켜 두면 Fast Refresh 중에 나는 일시적 에러가
     * 그대로 쌓여, 실사용자 에러를 찾을 때 걸러내야 할 잡음이 된다. 릴리즈 빌드
     * (EAS `preview`/`production` 프로필)에서만 `__DEV__`가 false라 자동으로 켜진다.
     *
     * 그래서 **로컬·Expo Go에서는 동작을 확인할 수 없다.** 검증은 릴리즈 빌드로 한다
     * (`CLAUDE.md`의 "동작 확인" 절).
     */
    enabled: !__DEV__,

    /**
     * 위 `enabled` 때문에 실제로 보고하는 빌드는 릴리즈뿐이라 상수로 둔다.
     *
     * ponytail: EAS `preview`와 `production`이 둘 다 여기로 들어온다 — 지금은 배포 경로가
     * TestFlight 하나뿐이라 구분할 실익이 없다. 별도 preview 채널이 생기면 `app.json`을
     * `app.config.ts`로 바꾸고 빌드 타임의 `EAS_BUILD_PROFILE`을 주입해 나눈다
     * (웹이 `VERCEL_ENV`로 하는 것과 같은 방식).
     */
    environment: "production",

    /**
     * **끄는 것이 기본값과 다르다 — 되돌리지 말 것.** Sentry 공식 예제는
     * `sendDefaultPii: true`지만, 이 앱은 익명 기기 계정으로만 동작하고 사용자를 식별할
     * 이유가 없다. 켜면 IP 주소가 이벤트에 붙는다.
     */
    sendDefaultPii: false,

    /**
     * **Session Replay를 추가하지 말 것**(`mobileReplayIntegration`). 전 화면이 WebView 셸이라
     * RN 리플레이의 기본 WebView 마스킹 때문에 켜도 마스킹된 사각형만 남아 실익이 없고,
     * 마스킹을 풀면 카메라 프리뷰가 녹화돼 "카메라 영상은 단말을 벗어나지 않는다"는
     * 루트 `CLAUDE.md`의 개인정보 원칙과 정면으로 충돌한다. 웹은 BY-407로 2026-08-20부터
     * 카메라 차단 조건으로 켰고, 이 금지는 앱에만 남았다.
     *
     * 성능 추적(`tracesSampleRate`)도 켜지 않았다 — 이 앱은 모든 화면이 웹뷰인 셸이라
     * 네이티브 쪽에 잴 구간이 사실상 없고, 화면 로딩 성능은 웹 프로젝트가 이미 본다.
     * 앱 시작 시간처럼 네이티브만 알 수 있는 지표가 필요해지면 그때 켠다.
     *
     * 둘 다 "옵션을 넣지 않는 것"으로 꺼진다 — `integrations: []`로 명시하지 않는 이유는
     * 그 배열이 기본 integration을 지우는 게 아니라 **더하는** 자리라, 아무 효과 없이
     * "뭔가 껐다"는 오해만 남기기 때문이다.
     */
  });
}

/**
 * 루트 컴포넌트를 감싸 렌더 에러와 터치 breadcrumb을 잡는다.
 *
 * `initSentry()`와 짝이다 — 이것만 있고 init이 없으면 아무것도 전송되지 않고, init만 있고
 * 이것이 없으면 React 렌더 트리에서 난 에러를 놓친다.
 */
export const wrapRoot = Sentry.wrap;
