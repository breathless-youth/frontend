import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AppState } from "react-native";
import type * as ReactNative from "react-native";

import RootLayout from "../app/_layout";
import { cleanupOnLaunch } from "../lib/appLock/appLock";
import { installMetaAdsSdk } from "../lib/metaAdsSdk";
import { __resetNativeAnalyticsForTests, attachNativeAnalyticsSink } from "../lib/nativeAnalytics";
import { setSessionInviteHandler } from "../lib/sessionInvite";
import { __resetSessionPresenceForTests, markSessionOpen } from "../lib/sessionPresence";
import { RECONNECT_AFTER_BACKGROUND_MS } from "../lib/updateOnConnect";

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
  useFonts: (fontMap: unknown) => mockUseFonts(fontMap) as [boolean, Error | undefined],
}));

const mockHideAsync = jest.fn();
jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: () => mockHideAsync(),
}));

// 실제 expo-router의 useRouter는 안정된 객체를 돌려준다 — 렌더마다 새 객체를 주면 [router] 의존 effect가
// 매 렌더 재실행돼 시작/해제 횟수 단언이 깨진다.
const mockRouter = { push: jest.fn() };
// 라우트별 화면 옵션을 확인하려고 Stack.Screen에 넘어온 props를 남긴다.
const mockScreenProps: { name: string; options?: Record<string, unknown> }[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  Stack: Object.assign(({ children }: { children?: ReactNode }) => children, {
    Screen: (props: { name: string; options?: Record<string, unknown> }) => {
      mockScreenProps.push(props);
      return null;
    },
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
// 지난 실행이 남긴 영상 사본 정리는 호출 여부만 본다(동작은 `lib/__tests__/videoTransfer.test.ts`).
const mockRemoveLeftoverVideoFiles = jest.fn();
jest.mock("../lib/videoTransfer", () => ({
  removeLeftoverVideoFiles: () => mockRemoveLeftoverVideoFiles(),
}));
// 푸시 배선(BY-586)은 네이티브 모듈을 끌어오므로 시작/해제·권한 요청 호출만 기록한다(동작은 `lib/__tests__/pushBootstrap.test.ts`).
const mockStopPush = jest.fn();
const mockStartPush = jest.fn((_options: { navigate: (route: string) => void }) => mockStopPush);
const mockEnsurePushPermission = jest.fn(() => Promise.resolve());
jest.mock("../lib/pushBootstrap", () => ({
  startPushMessaging: (options: { navigate: (route: string) => void }) => mockStartPush(options),
  ensurePushPermission: () => mockEnsurePushPermission(),
}));
// Meta SDK — 어댑터 설치·초기화(ATT)는 호출만 기록한다(동작은 `lib/__tests__/metaAds.test.ts`).
// SDK 모듈은 네이티브 없이 로드조차 안 되므로 반드시 mock한다. `installMetaAdsSdk`는 `_layout`이 **모듈
// 스코프**에서 부르므로(import 시점) 바깥 `const` jest.fn을 참조하면 아직 초기화 전이다 — factory 안에서 만든다.
jest.mock("../lib/metaAdsSdk", () => ({
  installMetaAdsSdk: jest.fn(),
}));
// 방해 앱 잠금 정리는 모듈 스코프에서 부르므로 factory 안에서 만든다(동작은 `lib/appLock/__tests__/appLock.test.ts`).
jest.mock("../lib/appLock/appLock", () => ({
  cleanupOnLaunch: jest.fn(() => Promise.resolve()),
}));
// Firebase Analytics 어댑터 설치도 호출만 기록한다(동작은 `lib/__tests__/firebaseAnalytics.test.ts`).
jest.mock("../lib/firebaseAnalyticsSdk", () => ({
  installFirebaseAnalyticsSdk: jest.fn(),
}));
const mockInitMetaAds = jest.fn(() => Promise.resolve());
jest.mock("../lib/metaAds", () => ({
  initMetaAds: () => mockInitMetaAds() as Promise<void>,
}));
// 강제 업데이트 게이트(BY-586) — 기본은 통과. 개별 테스트에서 forced로 바꾼다.
// 접속 재판정(`refreshForceUpdate`)도 기본은 통과 — 부팅 판정과 같은 결과를 돌려주면 화면이 바뀌지 않는다.
type Decision = { forced: boolean; recommended: boolean; latestVersion: string | null };
// 앱을 켤 때의 판정은 기본으로 "새 값이 상한을 넘김" 경로를 흉내 낸다: 지난 값(`mockResolveForceUpdate`)으로
// 첫 판정을 하고 새 값(`mockRefreshForceUpdate`)은 늦게 온다. 상한 안에 온 경로는 개별 테스트에서 바꾼다.
const mockResolveForceUpdate = jest.fn();
const mockRefreshForceUpdate = jest.fn();
const mockResolveOnLaunch = jest.fn();
jest.mock("../lib/forceUpdate", () => ({
  resolveForceUpdateOnLaunch: () =>
    mockResolveOnLaunch() as Promise<{ decision: Decision; late: Promise<Decision> | null }>,
  refreshForceUpdate: (trigger: string) => mockRefreshForceUpdate(trigger) as Promise<Decision>,
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
  // 새 값은 기본으로 지난 값과 같다. 서버 값이 바뀌는 경우는 개별 테스트에서 바꾼다.
  mockRefreshForceUpdate.mockReset().mockImplementation(() => mockResolveForceUpdate());
  mockResolveOnLaunch.mockReset().mockImplementation(async () => ({
    decision: (await mockResolveForceUpdate()) as Decision,
    late: mockRefreshForceUpdate("cold_start") as Promise<Decision>,
  }));
  __resetSessionPresenceForTests();
  mockMaybeShow.mockClear();
  mockAlertStart.mockClear();
  mockAlertStop.mockClear();
  mockAlertReshow.mockClear();
  mockStartPush.mockClear();
  mockStopPush.mockClear();
  mockRemoveLeftoverVideoFiles.mockClear();
  mockInitMetaAds.mockReset().mockImplementation(() => Promise.resolve());
  mockEnsurePushPermission.mockReset().mockImplementation(() => Promise.resolve());
});

describe("RootLayout 폰트 로드 게이팅", () => {
  it("로딩 중([false, undefined])에는 아무것도 그리지 않고 스플래시도 걷지 않는다", async () => {
    mockUseFonts.mockReturnValue([false, undefined]);

    const { toJSON } = render(<RootLayout />);
    await waitFor(() => expect(mockResolveForceUpdate).toHaveBeenCalled());

    expect(toJSON()).toBeNull();
    expect(mockHideAsync).not.toHaveBeenCalled();
  });

  // tailwind의 font-sans·font-sans-bold는 패밀리 이름으로만 폰트를 찾는다. 등록 키와 이름이
  // 어긋나면 오류 없이 시스템 폰트로 그려지므로, tailwind가 쓰는 이름이 전부 등록됐는지 여기서 맞춰 본다.
  // 네이티브 탭 바 라벨처럼 tailwind 밖에서만 쓰는 굵기는 더 등록돼 있어도 된다.
  it("tailwind가 쓰는 폰트 패밀리 이름으로 폰트를 등록한다", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);

    render(<RootLayout />);
    await waitFor(() => expect(mockUseFonts).toHaveBeenCalled());

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tailwindConfig = require("../tailwind.config.js") as {
      theme: { extend: { fontFamily: Record<string, string[]> } };
    };
    const families = Object.values(tailwindConfig.theme.extend.fontFamily).flat();
    const fontMap = mockUseFonts.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(Object.keys(fontMap)).toEqual(expect.arrayContaining(families));
  });

  it("성공([true, undefined])하면 앱 콘텐츠를 그리고 스플래시를 걷는다", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);

    const { toJSON } = render(<RootLayout />);

    await waitFor(() => expect(toJSON()).not.toBeNull());
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
  });

  it("마운트 때 지난 실행이 남긴 영상 사본을 지운다", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);

    const { toJSON } = render(<RootLayout />);
    await waitFor(() => expect(toJSON()).not.toBeNull());

    expect(mockRemoveLeftoverVideoFiles).toHaveBeenCalledTimes(1);
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

  it("세션 화면이 받은 초대 푸시는 화면을 쌓지 않고, 세션이 없으면 평소대로 연다", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);
    mockRouter.push.mockClear();
    const handler = jest.fn();
    const release = setSessionInviteHandler(handler);

    const { toJSON } = render(<RootLayout />);
    await waitFor(() => expect(toJSON()).not.toBeNull());
    const { navigate } = mockStartPush.mock.calls[0][0];

    navigate("/social/join?code=4680");
    expect(handler).toHaveBeenCalledWith("4680");
    expect(mockRouter.push).not.toHaveBeenCalled();

    release();
    navigate("/social/join?code=4680");
    expect(mockRouter.push).toHaveBeenCalledWith("/social/join?code=4680");
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
    const forced = { forced: true, recommended: false, latestVersion: "1.0.4" };
    mockResolveForceUpdate.mockResolvedValue(forced);
    mockRefreshForceUpdate.mockResolvedValue(forced);

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

describe("RootLayout 접속 시 업데이트 재판정", () => {
  /** react-native `AppState.addEventListener` mock에 들어간 리스너를 직접 부른다. */
  function emitAppState(state: string) {
    const calls = (AppState.addEventListener as unknown as jest.Mock).mock.calls as [
      string,
      (state: string) => void,
    ][];
    act(() => {
      for (const [, listener] of calls) listener(state);
    });
  }

  beforeEach(() => {
    (AppState.addEventListener as unknown as jest.Mock).mockClear();
  });

  it("새 값이 상한을 넘겨 늦게 오면 지난 값으로 홈을 그린 뒤 다시 판정하고, 강제면 홈 위에서 막는다", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);
    let finishRefresh: (decision: Decision) => void = () => {};
    mockRefreshForceUpdate.mockReturnValue(
      new Promise<Decision>((resolve) => {
        finishRefresh = resolve;
      }),
    );

    render(<RootLayout />);
    await waitFor(() => expect(screen.getByTestId("safe-area-provider")).toBeTruthy());
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockRefreshForceUpdate).toHaveBeenCalledWith("cold_start"));

    await act(async () => {
      finishRefresh({ forced: true, recommended: false, latestVersion: "1.0.4" });
    });

    await screen.findByTestId("force-update-backdrop");
    expect(screen.queryByTestId("safe-area-provider")).toBeNull();
    expect(mockAlertStart).toHaveBeenCalledTimes(1);
  });

  it("앱을 켤 때 새 값이 상한 안에 와서 강제면 홈을 그리지 않고 바로 막는다", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);
    mockResolveOnLaunch.mockResolvedValue({
      decision: { forced: true, recommended: false, latestVersion: "1.0.4" },
      late: null,
    });
    render(<RootLayout />);
    await screen.findByTestId("force-update-backdrop");

    expect(screen.queryByTestId("safe-area-provider")).toBeNull();
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    expect(mockInitMetaAds).not.toHaveBeenCalled();
    expect(mockRefreshForceUpdate).not.toHaveBeenCalled();
  });

  it("재판정으로 권장이 되면 권한 창들 뒤에 권장 알림창을 띄운다", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);
    mockRefreshForceUpdate.mockResolvedValue({
      forced: false,
      recommended: true,
      latestVersion: "1.0.3",
    });

    const { toJSON } = render(<RootLayout />);

    await waitFor(() => expect(toJSON()).not.toBeNull());
    await waitFor(() => expect(mockMaybeShow).toHaveBeenCalledWith("1.0.3"));
    expect(mockMaybeShow).toHaveBeenCalledTimes(1);
  });

  it("30분 이상 백그라운드에 있다 돌아오면 다시 판정하고, 그보다 짧으면 하지 않는다", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);
    const nowSpy = jest.spyOn(Date, "now");
    let now = 1_000_000;
    nowSpy.mockImplementation(() => now);

    const { toJSON } = render(<RootLayout />);
    await waitFor(() => expect(toJSON()).not.toBeNull());
    await waitFor(() => expect(mockRefreshForceUpdate).toHaveBeenCalledTimes(1));

    emitAppState("background");
    now += RECONNECT_AFTER_BACKGROUND_MS - 1;
    emitAppState("active");
    expect(mockRefreshForceUpdate).toHaveBeenCalledTimes(1);

    emitAppState("background");
    now += RECONNECT_AFTER_BACKGROUND_MS;
    emitAppState("active");
    await waitFor(() => expect(mockRefreshForceUpdate).toHaveBeenCalledTimes(2));
    expect(mockRefreshForceUpdate).toHaveBeenLastCalledWith("resume");

    nowSpy.mockRestore();
  });

  it("세션 화면이 떠 있으면 재판정 결과를 세션이 끝난 뒤에 적용한다", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);
    const closeSession = markSessionOpen();
    mockRefreshForceUpdate.mockResolvedValue({
      forced: true,
      recommended: false,
      latestVersion: "1.0.4",
    });

    render(<RootLayout />);
    await waitFor(() => expect(screen.getByTestId("safe-area-provider")).toBeTruthy());
    await waitFor(() => expect(mockRefreshForceUpdate).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(screen.queryByTestId("force-update-backdrop")).toBeNull();

    act(() => {
      closeSession();
    });

    await screen.findByTestId("force-update-backdrop");
    expect(mockAlertStart).toHaveBeenCalledTimes(1);
  });
});

describe("RootLayout 권장 알림창 시점", () => {
  /** 알림 권한 요청을 붙잡아 두고, 풀어 주는 함수를 돌려준다. */
  function holdPushPermission() {
    let finish: () => void = () => {};
    mockEnsurePushPermission.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    return () => finish();
  }

  it("권한 요청을 기다리는 사이 세션 화면이 열리면 권장 알림창은 세션이 끝난 뒤에 뜬다", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);
    mockResolveForceUpdate.mockResolvedValue({
      forced: false,
      recommended: true,
      latestVersion: "1.0.3",
    });
    const finishPermission = holdPushPermission();

    const { toJSON } = render(<RootLayout />);
    await waitFor(() => expect(toJSON()).not.toBeNull());
    await waitFor(() => expect(mockEnsurePushPermission).toHaveBeenCalled());
    const closeSession = markSessionOpen();

    await act(async () => {
      finishPermission();
    });
    expect(mockMaybeShow).not.toHaveBeenCalled();

    act(() => {
      closeSession();
    });
    await waitFor(() => expect(mockMaybeShow).toHaveBeenCalledWith("1.0.3"));
  });

  it("늦게 온 새 판정이 권장을 철회하면 앞선 권장 알림창을 띄우지 않는다", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);
    mockResolveForceUpdate.mockResolvedValue({
      forced: false,
      recommended: true,
      latestVersion: "1.0.3",
    });
    mockRefreshForceUpdate.mockResolvedValue({
      forced: false,
      recommended: false,
      latestVersion: "0.0.0",
    });
    const finishPermission = holdPushPermission();

    const { toJSON } = render(<RootLayout />);
    await waitFor(() => expect(toJSON()).not.toBeNull());
    await waitFor(() => expect(mockEnsurePushPermission).toHaveBeenCalled());
    await act(async () => {});

    await act(async () => {
      finishPermission();
    });

    expect(mockMaybeShow).not.toHaveBeenCalled();
  });
});

describe("RootLayout 방해 앱 잠금 정리", () => {
  it("프로세스가 시작될 때 한 번 남은 잠금을 정리하고 다시 그려도 부르지 않는다", () => {
    mockUseFonts.mockReturnValue([true, undefined]);
    render(<RootLayout />);
    expect(cleanupOnLaunch).toHaveBeenCalledTimes(1);
  });
});

describe("RootLayout 방해 앱 잠금 시트", () => {
  it("권한 안내와 배터리 안내는 내용 높이에 맞춘 시스템 시트로 띄운다", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);
    mockScreenProps.length = 0;
    const { toJSON } = render(<RootLayout />);
    await waitFor(() => expect(toJSON()).not.toBeNull());

    for (const name of ["app-lock-consent", "app-lock-battery"]) {
      expect(mockScreenProps.find((props) => props.name === name)?.options).toMatchObject({
        presentation: "formSheet",
        sheetAllowedDetents: "fitToContents",
        sheetCornerRadius: 20,
      });
    }
  });
});

describe("RootLayout Meta SDK 초기화", () => {
  it("모듈 로드 시점에 어댑터를 설치한다 — 첫 실행의 가입 완료보다 먼저 통로가 있어야 한다", () => {
    expect(installMetaAdsSdk).toHaveBeenCalled();
  });

  it("통과했고 홈이 그려지면 초기화(ATT 프롬프트)를 부른다", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);

    const { toJSON } = render(<RootLayout />);

    await waitFor(() => expect(toJSON()).not.toBeNull());
    await waitFor(() => expect(mockInitMetaAds).toHaveBeenCalled());
  });

  it("폰트가 준비되기 전에는 부르지 않는다 — 스플래시 위에서는 OS가 프롬프트를 띄우지 않는다", async () => {
    mockUseFonts.mockReturnValue([false, undefined]);

    render(<RootLayout />);
    await waitFor(() => expect(mockResolveForceUpdate).toHaveBeenCalled());

    expect(mockInitMetaAds).not.toHaveBeenCalled();
  });

  it("forced면 부르지 않는다 — 막힌 실행에서 추적 동의를 물을 이유가 없다", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);
    const forced = { forced: true, recommended: false, latestVersion: "1.0.4" };
    mockResolveForceUpdate.mockResolvedValue(forced);
    mockRefreshForceUpdate.mockResolvedValue(forced);

    render(<RootLayout />);
    await screen.findByTestId("force-update-backdrop");

    expect(mockInitMetaAds).not.toHaveBeenCalled();
    expect(mockEnsurePushPermission).not.toHaveBeenCalled();
  });

  it("알림 권한은 초기화(ATT) 뒤, 권장 알림창 앞에 한 번 묻는다", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);
    mockResolveForceUpdate.mockResolvedValue({
      forced: false,
      recommended: true,
      latestVersion: "1.0.3",
    });
    let finishInit: () => void = () => {};
    mockInitMetaAds.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishInit = resolve;
        }),
    );
    let finishPermission: () => void = () => {};
    mockEnsurePushPermission.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishPermission = resolve;
        }),
    );

    const { toJSON } = render(<RootLayout />);
    await waitFor(() => expect(toJSON()).not.toBeNull());
    await waitFor(() => expect(mockInitMetaAds).toHaveBeenCalled());
    expect(mockEnsurePushPermission).not.toHaveBeenCalled();

    await act(async () => {
      finishInit();
    });
    await waitFor(() => expect(mockEnsurePushPermission).toHaveBeenCalledTimes(1));
    expect(mockMaybeShow).not.toHaveBeenCalled();

    await act(async () => {
      finishPermission();
    });
    await waitFor(() => expect(mockMaybeShow).toHaveBeenCalledWith("1.0.3"));
  });

  it("권장 알림창은 초기화(ATT)가 끝난 뒤에 뜬다 — OS 알림창 두 개가 겹치지 않게", async () => {
    mockUseFonts.mockReturnValue([true, undefined]);
    mockResolveForceUpdate.mockResolvedValue({
      forced: false,
      recommended: true,
      latestVersion: "1.0.3",
    });
    let finishInit: () => void = () => {};
    mockInitMetaAds.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishInit = resolve;
        }),
    );

    const { toJSON } = render(<RootLayout />);
    await waitFor(() => expect(toJSON()).not.toBeNull());
    await waitFor(() => expect(mockInitMetaAds).toHaveBeenCalled());
    expect(mockMaybeShow).not.toHaveBeenCalled();

    await act(async () => {
      finishInit();
    });

    await waitFor(() => expect(mockMaybeShow).toHaveBeenCalledWith("1.0.3"));
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
