import * as Sentry from "@sentry/react-native";

import appConfig from "../../app.json";
import { initSentry } from "../sentry";

/**
 * Sentry 설정 가드.
 *
 * 여기서 막는 실패는 전부 **조용하다** — 앱은 정상으로 보이고 빌드도 성공하는데, 개인정보가
 * 새거나(Replay·PII) 에러가 엉뚱한 프로젝트로 간다. 눈으로 봐서는 틀린 걸 알 수 없어서
 * 테스트로 못 박는다. 배경은 `lib/sentry.ts`와 `CLAUDE.md`의 "에러 모니터링" 절.
 */
jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  wrap: (component: unknown) => component,
}));

// 런타임에 Expo가 `app.json`을 그대로 실어 주는 것과 같은 모양으로 흉내낸다 — 값을 손으로
// 넣으면 "app.json에서 읽는다"는 계약을 검증하지 못하고 테스트가 자기 자신을 확인하게 된다.
jest.mock("expo-constants", () => ({
  __esModule: true,
  // 팩토리는 바깥 스코프를 볼 수 없어(jest 제약) 여기서 다시 읽는다.
  default: { expoConfig: { extra: require("../../app.json").expo.extra } },
}));

function initOptions(): Record<string, unknown> {
  const init = Sentry.init as unknown as jest.Mock;
  init.mockClear();
  initSentry();
  expect(init).toHaveBeenCalledTimes(1);
  return init.mock.calls[0][0] as Record<string, unknown>;
}

describe("app.json Sentry 설정", () => {
  it("네이티브 소스맵을 올리려면 expo config plugin이 있어야 한다", () => {
    const entry = appConfig.expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === "@sentry/react-native/expo",
    );
    // 플러그인이 빠지면 빌드는 그대로 성공하고 스택트레이스만 압축된 채로 남는다.
    expect(entry).toBeDefined();
    expect((entry as [string, Record<string, string>])[1]).toEqual({
      organization: "breathless-youth",
      project: "focusmakers-app",
    });
  });

  /**
   * 웹(`focusmakers-web`)과 **다른 프로젝트**여야 한다. DSN을 복사해 오면 앱 에러가 웹
   * 프로젝트로 섞여 들어가는데, 둘은 소스맵도 릴리즈도 달라서 어느 쪽 스택인지 구분할 수 없다.
   * DSN 끝의 숫자가 프로젝트 ID다.
   */
  it("DSN이 앱 전용 프로젝트를 가리킨다", () => {
    expect(appConfig.expo.extra.sentryDsn).toMatch(/\/4511861049589760$/);
  });
});

describe("initSentry 개인정보 계약", () => {
  it("PII(IP 주소 등)를 보내지 않는다 — Sentry 공식 예제의 기본값과 반대다", () => {
    expect(initOptions().sendDefaultPii).toBe(false);
  });

  /**
   * 전 화면이 WebView 셸이라 리플레이를 켜도 마스킹된 사각형만 남아 실익이 없고, WebView
   * 마스킹을 풀면 카메라 프리뷰가 녹화돼 "카메라 영상은 단말을 벗어나지 않는다"는 루트
   * `CLAUDE.md`의 원칙이 깨진다. 웹은 BY-407로 2026-08-20부터 카메라 차단 조건으로 켰고,
   * 이 금지는 앱에만 남았다.
   */
  it("Session Replay를 켜지 않는다", () => {
    const options = initOptions();
    expect(options.replaysSessionSampleRate).toBeUndefined();
    expect(options.replaysOnErrorSampleRate).toBeUndefined();

    const names = ((options.integrations ?? []) as { name?: string }[]).map((i) => i.name ?? "");
    expect(names.filter((name) => /replay/i.test(name))).toEqual([]);
  });

  it("개발 빌드에서는 전송하지 않는다 — Fast Refresh 잡음이 실사용자 에러를 덮는다", () => {
    // jest는 `__DEV__`가 true다. 릴리즈 빌드에서만 켜진다는 계약을 여기서 확인한다.
    expect(initOptions().enabled).toBe(false);
  });

  it("DSN을 하드코딩하지 않고 app.json에서 읽는다", () => {
    expect(initOptions().dsn).toBe(appConfig.expo.extra.sentryDsn);
  });
});
