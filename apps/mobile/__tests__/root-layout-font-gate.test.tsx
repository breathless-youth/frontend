import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AppState } from "react-native";
import type * as ReactNative from "react-native";

import RootLayout from "../app/_layout";
import { __resetNativeAnalyticsForTests, attachNativeAnalyticsSink } from "../lib/nativeAnalytics";

/**
 * 라우트 컨텍스트 격리 이유는 `permission-denied.test.tsx` 상단 주석 참고 — `app/` 밖(`__tests__/`)에 둔다.
 *
 * `useFonts`(expo-font)는 `[loaded, error]`를 돌려준다. 로드 **실패**해도 `loaded`는 계속
 * `false`고 `error`만 채워지는데, `error`를 버리고 `!fontsLoaded`만 렌더 게이트로 쓰면 실패
 * 시 스플래시가 영영 안 걷히고 화면도 영원히 null이 된다 — 이 계약(로딩/성공/실패 세 갈래)을
 * 고정한다.
 */

jest.mock("../global.css", () => ({}), { virtual: true });

// 네이티브 SafeAreaProvider 없이 렌더한다. Provider는 View로 감싼다: 통과 경로에서 Stack·Screen mock이
// 전부 null을 돌려줘도 "무언가를 그렸다"는 판정(toJSON() !== null)이 유지되게 하기 위해서다.
jest.mock("react-native-safe-area-context", () => {
  const { View: MockView } = jest.requireActual<typeof ReactNative>("react-native");
  return {
    SafeAreaProvider: ({ children }: { children?: ReactNode }) => (
      <MockView testID="safe-area-provider">{children}</MockView>
    ),
  };
});

jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  wrap: (component: unknown) => component,
}));

const mockUseFonts = jest.fn();
jest.mock("expo-font", () => ({
  useFonts: () => mockUseFonts() as [boolean, Error | undefined],
}));

const mockHideAsync = jest.fn();
jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: () => mockHideAsync(),
}));

// 실제 expo-router의 useRouter는 안정된 객체를 돌려준다 — 렌더마다 새 객체를 주면 [router] 의존 effect가
// 매 렌더 재실행돼 시작/해제 횟수 단언이 깨진다.
const mockRouter = { push: jest.fn() };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  Stack: Object.assign(({ children }: { children?: ReactNode }) => children, {
    Screen: () => null,
  }),
}));

// 이 테스트의 관심사는 폰트/스플래시 게이팅뿐이다 — 유저 등록·딥링크·방향 잠금은 각자
// 전용 테스트(`lib/__tests__/*`)가 있으므로 여기서는 부작용 없이 넘어가게만 둔다.
jest.mock("../lib/installReferrerInvite", () => ({
  consumePendingInviteRoute: jest.fn(() => Promise.resolve(null)),
}));
jest.mock("../lib/orientation", () => ({
  lockPortrait: jest.fn(),
  unlockForSession: jest.fn(),
}));
jest.mock("../lib/userApi", () => ({
  ensureUserRegistered: jest.fn(() => Promise.resolve(null)),
}));
// 푸시 배선(BY-586)은 네이티브 모듈을 끌어오므로 시작/해제 호출만 기록한다(동작은 `lib/__tests__/pushBootstrap.test.ts`).
const mockStopPush = jest.fn();
const mockStartPush = jest.fn((_options: { navigate: (route: string) => void }) => mockStopPush);
jest.mock("../lib/pushBootstrap", () => ({
  startPushMessaging: (options: { navigate: (route: string) => void }) => mockStartPush(options),
}));
// 강제 업데이트 게이트(BY-586) — 기본은 통과. 개별 테스트에서 forced로 바꾼다.
const mockResolveForceUpdate = jest.fn();
jest.mock("../lib/forceUpdate", () => ({
  resolveForceUpdate: () =>
    mockResolveForceUpdate() as Promise<{
      forced: boolean;
      recommended: boolean;
      latestVersion: string | null;
    }>,
}));
// 권장 알림창 — 호출 여부만 본다(동작은 `lib/__tests__/recommendedUpdateAlert.test.ts`).
const mockMaybeShow = jest.fn((_version: string) => Promise.resolve(true));
jest.mock("../lib/recommendedUpdateAlert", () => ({
  recommendedUpdateAlert: { maybeShow: (v: string) => mockMaybeShow(v) },
}));
// 강제 업데이트 알림창 — 실제 Alert 대신 시작/해제/재표시 호출만 기록한다(동작은 `lib/__tests__/forceUpdateAlert.test.ts`).
const mockAlertStop = jest.fn();
const mockAlertStart = jest.fn(() => mockAlertStop);
const mockAlertReshow = jest.fn();
jest.mock("../lib/forceUpdateAlert", () => ({
  FORCE_UPDATE_TITLE: "업데이트가 필요해요",
  forceUpdateAlert: {
    start: () => mockAlertStart() as () => void,
    reshow: () => mockAlertReshow(),
  },
}));

beforeEach(() => {
  mockUseFonts.mockReset();
  mockHideAsync.mockClear();
  mockResolveForceUpdate
    .mockReset()
    .mockResolvedValue({ forced: false, recommended: false, latestVersion: null });
  mockMaybeShow.mockClear();
  mockAlertStart.mockClear();
  mockAlertStop.mockClear();
  mockAlertReshow.mockClear();
  mockStartPush.mockClear();
  mockStopPush.mockClear();
});

describe("RootLayout 폰트 로드 게이팅", () => {
  it("로딩 중([false, undefined])에는 아무것도 그리지 않고 스플래시도 걷지 않는다", async () => {
    mockUseFonts.mockReturnValue([false, undefined]);

    const { toJSON } = render(<RootLayout />);
    await waitFor(() => expect(mockResolveForceUpdate).toHaveBeenCalled());

    expect(toJSON()).toBeNull();
    expect(mockHideAsync).not.toHaveBeenCalled();
  });

  it("성공([true, undefined])하면 앱 콘텐츠를 그리고 스플래시를 걷는다", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);

    const { toJSON } = render(<RootLayout />);

    await waitFor(() => expect(toJSON()).not.toBeNull());
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
  });

  it("마운트 때 푸시 배선을 시작하고 언마운트 때 해제한다", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);

    const { toJSON, unmount } = render(<RootLayout />);
    await waitFor(() => expect(toJSON()).not.toBeNull());

    expect(mockStartPush).toHaveBeenCalledTimes(1);
    expect(mockStartPush).toHaveBeenCalledWith({ navigate: expect.any(Function) });
    unmount();
    expect(mockStopPush).toHaveBeenCalledTimes(1);
  });

  it("실패([false, Error])해도 시스템 폰트로 그리고 스플래시를 걷는다 — 벽돌 방지", async () => {
    mockUseFonts.mockReturnValue([false, new Error("font load failed")]);

    const { toJSON } = render(<RootLayout />);

    await waitFor(() => expect(toJSON()).not.toBeNull());
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
  });
});

describe("RootLayout 강제 업데이트 게이트 (BY-586)", () => {
  it("판정이 끝나기 전에는 폰트가 준비돼도 그리지 않고 스플래시도 걷지 않는다 — 웹뷰 깜빡임 방지", () => {
    mockUseFonts.mockReturnValue([true, undefined]);
    mockResolveForceUpdate.mockReturnValue(new Promise(() => {}));

    const { toJSON } = render(<RootLayout />);

    expect(toJSON()).toBeNull();
    expect(mockHideAsync).not.toHaveBeenCalled();
  });

  it("forced면 라우터 스택 대신 빈 배경만 그리고 알림창을 시작하며, 배경을 탭하면 다시 띄운다", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);
    mockResolveForceUpdate.mockResolvedValue({
      forced: true,
      recommended: false,
      latestVersion: "1.0.4",
    });

    const { unmount } = render(<RootLayout />);

    const backdrop = await screen.findByTestId("force-update-backdrop");
    expect(screen.queryByTestId("safe-area-provider")).toBeNull();
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    expect(mockAlertStart).toHaveBeenCalledTimes(1);

    fireEvent.press(backdrop);
    expect(mockAlertReshow).toHaveBeenCalledTimes(1);

    unmount();
    expect(mockAlertStop).toHaveBeenCalledTimes(1);
    expect(mockMaybeShow).not.toHaveBeenCalled();
  });

  it("통과했고 권장 판정이면 홈을 그린 뒤 권장 알림창에 최신 버전을 넘긴다", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);
    mockResolveForceUpdate.mockResolvedValue({
      forced: false,
      recommended: true,
      latestVersion: "1.0.3",
    });

    const { toJSON } = render(<RootLayout />);

    await waitFor(() => expect(toJSON()).not.toBeNull());
    await waitFor(() => expect(mockMaybeShow).toHaveBeenCalledWith("1.0.3"));
    expect(mockMaybeShow).toHaveBeenCalledTimes(1);
    expect(mockAlertStart).not.toHaveBeenCalled();
  });

  it("권장 판정이어도 폰트가 준비되기 전에는 띄우지 않는다 — 스플래시 위에 뜨지 않게", async () => {
    mockUseFonts.mockReturnValue([false, undefined]);
    mockResolveForceUpdate.mockResolvedValue({
      forced: false,
      recommended: true,
      latestVersion: "1.0.3",
    });

    render(<RootLayout />);
    await waitFor(() => expect(mockResolveForceUpdate).toHaveBeenCalled());

    expect(mockMaybeShow).not.toHaveBeenCalled();
  });

  it("통과(pass)면 알림창을 시작하지 않는다", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);

    const { toJSON } = render(<RootLayout />);

    await waitFor(() => expect(toJSON()).not.toBeNull());
    expect(mockAlertStart).not.toHaveBeenCalled();
    expect(mockMaybeShow).not.toHaveBeenCalled();
  });

  it("판정이 거부(reject)돼도 통과시켜 앱을 그린다 — fail-open", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);
    mockResolveForceUpdate.mockRejectedValue(new Error("boom"));

    const { toJSON } = render(<RootLayout />);

    await waitFor(() => expect(toJSON()).not.toBeNull());
    expect(screen.queryByTestId("force-update-backdrop")).toBeNull();
    expect(mockAlertStart).not.toHaveBeenCalled();
  });
});

/** 포/백그라운드 계측 배선 — 판정 로직은 `lib/__tests__/appStateAnalytics.test.ts`가 고정한다. */
describe("RootLayout 앱 상태 계측", () => {
  it("AppState 전환을 네이티브 사용자 이벤트로 남긴다", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);
    const spy = jest.spyOn(AppState, "addEventListener");
    // jest-expo의 AppState는 이미 mock이라 spyOn이 앞선 테스트의 호출 기록까지 물려받는다 —
    // 이 렌더가 등록한 리스너만 고른다(이전 렌더의 리스너는 해제됐어도 기록에 남아 있다).
    const registeredBefore = spy.mock.calls.length;
    __resetNativeAnalyticsForTests();
    const received: string[] = [];
    attachNativeAnalyticsSink((event) => received.push(event.name));

    render(<RootLayout />);
    await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThan(registeredBefore));
    const listeners = spy.mock.calls
      .slice(registeredBefore)
      .filter(([event]) => event === "change")
      .map(([, listener]) => listener as (state: string) => void);
    act(() => {
      for (const listener of listeners) listener("background");
      for (const listener of listeners) listener("active");
    });

    expect(received).toEqual(["app_backgrounded", "app_foregrounded"]);
    spy.mockRestore();
    __resetNativeAnalyticsForTests();
  });
});
