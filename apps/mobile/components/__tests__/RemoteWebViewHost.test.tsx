import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Appearance, AppState, Platform } from "react-native";
import type { ToNativeMessage, ToWebMessage } from "@focusmakers/types";

import { consumeAppLaunchSignal } from "../../lib/appLaunch";
import {
  __resetNativeAnalyticsForTests,
  attachNativeAnalyticsSink,
  trackNativeEvent,
} from "../../lib/nativeAnalytics";
import { lockPortrait, unlockForSession } from "../../lib/orientation";
import { emitTabReset } from "../../lib/tabReset";
import {
  RemoteWebViewHost,
  buildRemoteWebViewUrl,
  originOf,
  requestGlobalWebViewRecovery,
} from "../RemoteWebViewHost";

jest.mock("../../lib/orientation", () => ({
  lockPortrait: jest.fn(),
  unlockForSession: jest.fn(),
}));

/** 실제와 같은 1회 의미를 갖는 mock. 순수 로직 자체는 lib/__tests__/appLaunch.test.ts가 본다. */
let mockAppLaunchPending = false;

jest.mock("../../lib/appLaunch", () => ({
  consumeAppLaunchSignal: jest.fn(() => {
    if (!mockAppLaunchPending) {
      return false;
    }
    mockAppLaunchPending = false;
    return true;
  }),
}));

/**
 * 원격 웹뷰 호스트(BY-333) — 세션 화면이 직접 띄우던 WebView를 승격한 공용 컴포넌트.
 *
 * 검증 범위: URL 조립(경로+쿼리), 브리지 메시지 파싱→콜백 전달, 로드 실패·설정 누락이
 * **같은 폴백**으로 떨어지는지(그리고 그때도 onLoadEnd가 불리는지), 재시도가 다시 로드를
 * 시도하는지, `onShouldStartLoadWithRequest`가 하위 프레임(iframe)은 항상 허용하고 최상위
 * 프레임은 우리 오리진일 때만 허용하는지, 그리고 `isTopFrame` 필드 자체가 없는 요청
 * (Android — `RNCWebViewClient.java`가 이 필드를 보내지 않는다)도 최상위 프레임으로 취급해
 * 오리진 검사를 거치는지(BY-333 리뷰 — `!isTopFrame`이면 `undefined`도 참이라 Android에서
 * 오리진 검사가 통째로 빠지는 Critical 보안 구멍이었다).
 */

let mockWebBaseUrl: string | undefined = "https://web.test";

/** 웹으로 되돌려 보내는 통로(`injectJavaScript`)의 관찰점 — reply 배선 검증에 쓴다. */
const mockInjectJavaScript = jest.fn();

/** iOS 프로세스 종료 복구(`reload`)의 관찰점 — BY-374 검증에 쓴다. */
const mockReload = jest.fn();

/** WebView 마운트 횟수 관찰점 — Android 렌더러 사망 시 재마운트(BY-374) 검증에 쓴다. */
const mockWebViewMounted = jest.fn();

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { webBaseUrl: mockWebBaseUrl } };
    },
  },
}));

jest.mock("react-native-webview", () => {
  /*
    eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports --
    `jest.mock` 팩토리는 상단 import보다 먼저 호이스팅돼 평가되므로 import 바인딩을 참조할 수 없다
    (`babel-plugin-jest-hoist`가 out-of-scope 변수 참조를 막는다).
  */
  const ReactModule = require("react") as typeof import("react");
  const { View } = require("react-native") as typeof import("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports */

  return {
    WebView: ReactModule.forwardRef(function MockWebView(
      props: Record<string, unknown>,
      ref: React.Ref<{ reload: () => void }>,
    ) {
      ReactModule.useImperativeHandle(ref, () => ({
        reload: mockReload,
        injectJavaScript: mockInjectJavaScript,
      }));
      // 마운트 1회당 1호출 — `key` 교체로 인스턴스가 새로 만들어졌는지를 세는 관찰점.
      ReactModule.useEffect(() => {
        mockWebViewMounted();
      }, []);
      return ReactModule.createElement(View, props);
    }),
  };
});

/** 웹 홈이 구독을 걸고 보내는 준비 신호를 흉내 낸다. */
function fireHomeReady() {
  const onMessage = screen.getByTestId("host").props.onMessage as (e: unknown) => void;
  act(() => {
    onMessage({ nativeEvent: { data: '{"type":"home-ready","atMs":1}' } });
  });
}

/** 웹으로 실제 나간 앱 실행 알림만 골라 센다. */
function sentAppLaunched() {
  return mockInjectJavaScript.mock.calls.filter((call) => String(call[0]).includes("app-launched"));
}

/** WebView 콜백을 실제 로드 없이 흉내 낸다. */
function fireWebViewEvent(name: "onError" | "onHttpError", value?: unknown) {
  const handler = screen.getByTestId("host").props[name] as (v?: unknown) => void;
  act(() => {
    handler(value);
  });
}

beforeEach(() => {
  mockWebBaseUrl = "https://web.test";
  mockReload.mockClear();
  mockWebViewMounted.mockClear();
  mockInjectJavaScript.mockClear();
  (lockPortrait as jest.Mock).mockClear();
  (unlockForSession as jest.Mock).mockClear();
  (consumeAppLaunchSignal as jest.Mock).mockClear();
  mockAppLaunchPending = false;
});

// spyOn·replaceProperty(Platform.OS, Appearance)를 원상 복구한다 — 남으면 다음 테스트의
// 플랫폼 분기가 이전 테스트의 값에 오염된다.
afterEach(() => {
  jest.restoreAllMocks();
});

describe("buildRemoteWebViewUrl", () => {
  it("경로만 있으면 쿼리 없이 붙인다", () => {
    expect(buildRemoteWebViewUrl("https://web.test", "/home")).toBe("https://web.test/home");
  });

  it("베이스 URL 끝의 슬래시를 정리한다", () => {
    expect(buildRemoteWebViewUrl("https://web.test/", "/home")).toBe("https://web.test/home");
  });

  it("쿼리 파라미터를 인코딩해 붙인다", () => {
    expect(buildRemoteWebViewUrl("https://web.test", "/room/1", { userId: 7 })).toBe(
      "https://web.test/room/1?userId=7",
    );
  });

  it("빈 쿼리 객체는 쿼리 없이 연다", () => {
    expect(buildRemoteWebViewUrl("https://web.test", "/home", {})).toBe("https://web.test/home");
  });
});

describe("originOf", () => {
  it("스킴+호스트만 떼어낸다", () => {
    expect(originOf("https://web.test/room/1?userId=7")).toBe("https://web.test");
  });

  it("URL 형태가 아니면 원본을 그대로 돌려준다", () => {
    expect(originOf("not-a-url")).toBe("not-a-url");
  });
});

describe("RemoteWebViewHost", () => {
  it("경로와 쿼리로 조립한 URL을 WebView에 넘긴다", () => {
    render(<RemoteWebViewHost path="/room/1" query={{ userId: 7 }} testID="host" />);

    expect(screen.getByTestId("host").props.source).toEqual({
      uri: "https://web.test/room/1?userId=7",
    });
  });

  it("originWhitelist를 우리 오리진으로 좁히지 않는다 — 라이브러리 기본값(모든 http/https)을 그대로 둔다", () => {
    // originWhitelist를 좁히면 react-native-webview가 우리 콜백을 부르기도 전에 whitelist
    // 미통과 요청(iframe 포함)을 시스템 브라우저로 열어버린다. 오리진 제한은
    // onShouldStartLoadWithRequest 쪽에서 건다(아래 describe).
    render(<RemoteWebViewHost path="/home" testID="host" />);

    expect(screen.getByTestId("host").props.originWhitelist).toBeUndefined();
  });

  it("세션 카메라에 필요한 미디어 설정을 유지한다", () => {
    render(<RemoteWebViewHost path="/room/1" testID="host" />);

    const props = screen.getByTestId("host").props;
    expect(props.allowsInlineMediaPlayback).toBe(true);
    expect(props.mediaPlaybackRequiresUserAction).toBe(false);
    expect(props.mediaCapturePermissionGrantType).toBe("grant");
  });

  it("웹이 보낸 브리지 메시지를 파싱해 콜백으로 넘긴다", () => {
    const onBridgeMessage = jest.fn();
    render(<RemoteWebViewHost path="/room/1" testID="host" onBridgeMessage={onBridgeMessage} />);

    const onMessage = screen.getByTestId("host").props.onMessage as (e: unknown) => void;
    act(() => {
      onMessage({ nativeEvent: { data: '{"type":"navigate-home","atMs":5}' } });
    });

    expect(onBridgeMessage).toHaveBeenCalledWith<[ToNativeMessage, () => void]>(
      { type: "navigate-home", atMs: 5 },
      expect.any(Function),
    );
  });

  /**
   * 응답 통로는 이 컴포넌트만 가질 수 있다(`webViewRef.injectJavaScript`) — 핸들러에 넘기지
   * 않으면 세션 제출 결과가 웹으로 돌아가지 못하고 웹이 "저장 중..."에 갇힌다.
   */
  it("reply로 응답을 웹에 주입한다", () => {
    const onBridgeMessage = jest.fn();
    render(<RemoteWebViewHost path="/room/1" testID="host" onBridgeMessage={onBridgeMessage} />);

    const onMessage = screen.getByTestId("host").props.onMessage as (e: unknown) => void;
    act(() => {
      onMessage({ nativeEvent: { data: '{"type":"navigate-home","atMs":5}' } });
    });
    const reply = onBridgeMessage.mock.calls[0]![1] as (m: ToWebMessage) => void;
    act(() => {
      reply({ type: "app-state", state: "active", atMs: 6 });
    });

    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('\\"type\\":\\"app-state\\"'),
    );
  });

  it("알 수 없는 메시지는 콜백을 부르지 않는다", () => {
    const onBridgeMessage = jest.fn();
    render(<RemoteWebViewHost path="/room/1" testID="host" onBridgeMessage={onBridgeMessage} />);

    const onMessage = screen.getByTestId("host").props.onMessage as (e: unknown) => void;
    act(() => {
      onMessage({ nativeEvent: { data: '{"type":"future","atMs":5}' } });
    });

    expect(onBridgeMessage).not.toHaveBeenCalled();
  });

  it("set-back-gesture는 여기서 소비한다 — 제스처 prop을 토글하고 콜백에 넘기지 않는다", () => {
    const onBridgeMessage = jest.fn();
    render(<RemoteWebViewHost path="/home" testID="host" onBridgeMessage={onBridgeMessage} />);

    expect(screen.getByTestId("host").props.allowsBackForwardNavigationGestures).toBe(true);

    const onMessage = screen.getByTestId("host").props.onMessage as (e: unknown) => void;
    act(() => {
      onMessage({ nativeEvent: { data: '{"type":"set-back-gesture","enabled":false,"atMs":5}' } });
    });

    expect(screen.getByTestId("host").props.allowsBackForwardNavigationGestures).toBe(false);
    expect(onBridgeMessage).not.toHaveBeenCalled();

    act(() => {
      onMessage({ nativeEvent: { data: '{"type":"set-back-gesture","enabled":true,"atMs":6}' } });
    });

    expect(screen.getByTestId("host").props.allowsBackForwardNavigationGestures).toBe(true);
  });

  it("문서가 다시 로드되면 꺼 둔 제스처가 기본값(켜짐)으로 돌아간다 — 렌더러 재생성 대비", () => {
    render(<RemoteWebViewHost path="/home" testID="host" />);
    const onMessage = screen.getByTestId("host").props.onMessage as (e: unknown) => void;
    act(() => {
      onMessage({ nativeEvent: { data: '{"type":"set-back-gesture","enabled":false,"atMs":5}' } });
    });
    expect(screen.getByTestId("host").props.allowsBackForwardNavigationGestures).toBe(false);

    // 렌더러 크래시 등으로 새 문서가 로드되면 — 새 문서는 끈 적이 없다
    const onLoadEnd = screen.getByTestId("host").props.onLoadEnd as () => void;
    act(() => {
      onLoadEnd();
    });

    expect(screen.getByTestId("host").props.allowsBackForwardNavigationGestures).toBe(true);
  });

  it("앱을 새로 켰으면 홈 웹뷰의 준비 신호에 app-launched로 응답한다", () => {
    mockAppLaunchPending = true;
    render(<RemoteWebViewHost path="/home" testID="host" />);

    fireHomeReady();

    expect(sentAppLaunched()).toHaveLength(1);
  });

  it("전역 복구로 다시 선 문서가 준비 신호를 또 보내도 두 번 응답하지 않는다", () => {
    mockAppLaunchPending = true;
    render(<RemoteWebViewHost path="/home" testID="host" />);
    fireHomeReady();
    expect(sentAppLaunched()).toHaveLength(1);

    // 세션 웹뷰의 렌더러가 죽어 마운트된 웹뷰가 통째로 다시 서는 상황이다. 여기서 한 번 더
    // 응답하면 세션 화면이 복원하려던 기록을 홈이 지운다.
    act(() => {
      requestGlobalWebViewRecovery();
    });
    fireHomeReady();

    expect(sentAppLaunched()).toHaveLength(1);
  });

  it("로드 이벤트는 신호를 건드리지 않는다 — 실패한 첫 로드 뒤 재시도 성공에서 정확히 한 번 응답한다", () => {
    mockAppLaunchPending = true;
    render(<RemoteWebViewHost path="/home" testID="host" />);

    // Android는 로드가 실패해도 finish 이벤트를 합성해 onLoad까지 불러 준다. 그 순서를 그대로
    // 흉내 낸다: onLoad → onLoadEnd → onError → onLoadEnd. 어디에서도 신호가 타면 안 된다.
    const props = screen.getByTestId("host").props as {
      onLoad?: () => void;
      onLoadEnd: () => void;
    };
    act(() => {
      props.onLoad?.();
      props.onLoadEnd();
    });
    fireWebViewEvent("onError", { nativeEvent: { description: "net::ERR_CONNECTION_REFUSED" } });
    expect(consumeAppLaunchSignal).not.toHaveBeenCalled();
    expect(sentAppLaunched()).toHaveLength(0);

    // 실패 화면에서 다시 시도를 누르면 새 웹뷰가 선다. 성공하면 웹 JS가 돌고 그때에야
    // 준비 신호가 온다.
    fireEvent.press(screen.getByRole("button", { name: "다시 시도" }));
    fireHomeReady();

    expect(sentAppLaunched()).toHaveLength(1);
  });

  it("홈이 아닌 웹뷰의 준비 신호는 신호를 쓰지도 응답하지도 않는다 — 세션 화면이 받으면 복원할 세션을 지운다", () => {
    mockAppLaunchPending = true;
    render(<RemoteWebViewHost path="/room/1" testID="host" />);

    fireHomeReady();

    expect(consumeAppLaunchSignal).not.toHaveBeenCalled();
    expect(sentAppLaunched()).toHaveLength(0);
  });

  it("set-orientation을 소비해 잠금을 제어하고 콜백에 넘기지 않는다", () => {
    jest.replaceProperty(Platform, "OS", "android");
    const onBridgeMessage = jest.fn();
    render(<RemoteWebViewHost path="/social" testID="host" onBridgeMessage={onBridgeMessage} />);

    const onMessage = screen.getByTestId("host").props.onMessage as (e: unknown) => void;
    act(() => {
      onMessage({ nativeEvent: { data: '{"type":"set-orientation","unlocked":true,"atMs":1}' } });
    });
    expect(unlockForSession).toHaveBeenCalled();
    expect(onBridgeMessage).not.toHaveBeenCalled();

    act(() => {
      onMessage({ nativeEvent: { data: '{"type":"set-orientation","unlocked":false,"atMs":2}' } });
    });
    expect(lockPortrait).toHaveBeenCalled();
  });

  // 종전 "iOS 무시" 계약의 반전(BY-444) — iOS 소셜룸 가로는 루트 잠금이 우회되던 버그의
  // 부수효과였고, 잠금이 실동작하는 지금은 iOS도 이 브리지로 열어야 한다.
  it("iOS에서도 set-orientation을 소비한다", () => {
    jest.replaceProperty(Platform, "OS", "ios");
    render(<RemoteWebViewHost path="/social" testID="host" />);

    const onMessage = screen.getByTestId("host").props.onMessage as (e: unknown) => void;
    act(() => {
      onMessage({ nativeEvent: { data: '{"type":"set-orientation","unlocked":true,"atMs":1}' } });
    });
    expect(unlockForSession).toHaveBeenCalled();

    act(() => {
      onMessage({ nativeEvent: { data: '{"type":"set-orientation","unlocked":false,"atMs":2}' } });
    });
    expect(lockPortrait).toHaveBeenCalled();
  });

  it("웹 주도 해제 상태에서 복구가 시작되면 세로로 복원한다 — 해제를 요청한 문서가 사라졌다", () => {
    jest.replaceProperty(Platform, "OS", "android");
    render(<RemoteWebViewHost path="/social" testID="host" />);

    const onMessage = screen.getByTestId("host").props.onMessage as (e: unknown) => void;
    act(() => {
      onMessage({ nativeEvent: { data: '{"type":"set-orientation","unlocked":true,"atMs":1}' } });
    });
    expect(lockPortrait).not.toHaveBeenCalled();

    // iOS 콘텐츠 프로세스 사망 = 복구 진입. 문서가 새로 뜨므로 이전 해제를 되돌려야 한다.
    const onTerminate = screen.getByTestId("host").props.onContentProcessDidTerminate as () => void;
    act(() => {
      onTerminate();
    });

    expect(lockPortrait).toHaveBeenCalled();
  });

  /**
   * 회귀 가드. 복원을 WebView의 로드 이벤트에 걸면 안 된다 — Android는 SPA `pushState`에도
   * `onLoadStart`를 발화시켜(BY-436 실기기) 소셜 홈에서 룸으로 이동하는 그 순간 방금 연
   * 회전이 되잠기고, `onLoadEnd`에 걸면 같은 로드가 되잠근다(2026-08-25 채점 지적).
   * 문서 세대가 실제로 바뀌는 사건은 복구 진입뿐이다.
   */
  it("로드 이벤트는 방금 연 회전을 되잠그지 않는다", () => {
    jest.replaceProperty(Platform, "OS", "android");
    render(<RemoteWebViewHost path="/social" testID="host" />);

    const onMessage = screen.getByTestId("host").props.onMessage as (e: unknown) => void;
    act(() => {
      onMessage({ nativeEvent: { data: '{"type":"set-orientation","unlocked":true,"atMs":1}' } });
    });

    const onLoadEnd = screen.getByTestId("host").props.onLoadEnd as () => void;
    act(() => {
      onLoadEnd();
    });

    expect(unlockForSession).toHaveBeenCalled();
    expect(lockPortrait).not.toHaveBeenCalled();
    // 로드 시작 이벤트 자체를 구독하지 않는다(Android SPA 이동에 발화하므로).
    expect(screen.getByTestId("host").props.onLoadStart).toBeUndefined();
  });

  it("웹 주도 해제 없이 복구가 시작되면 잠금을 건드리지 않는다 — 솔로 세션의 해제를 덮어쓰면 안 된다", () => {
    jest.replaceProperty(Platform, "OS", "android");
    render(<RemoteWebViewHost path="/room/1" testID="host" />);

    const onTerminate = screen.getByTestId("host").props.onContentProcessDidTerminate as () => void;
    act(() => {
      onTerminate();
    });

    expect(lockPortrait).not.toHaveBeenCalled();
  });

  it("자기 경로의 탭 초기화 신호를 받으면 reset-route를 주입하고, 다른 경로 신호는 무시한다", () => {
    render(<RemoteWebViewHost path="/settings" testID="host" />);

    act(() => {
      emitTabReset("/settings");
    });
    expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
    const script = mockInjectJavaScript.mock.calls[0][0] as string;
    expect(script).toContain('\\"reset-route\\"');
    expect(script).toContain("/settings");

    mockInjectJavaScript.mockClear();
    act(() => {
      emitTabReset("/records");
    });
    expect(mockInjectJavaScript).not.toHaveBeenCalled();
  });

  it("Android에서 시스템 테마가 바뀌면 theme 메시지를 주입한다", () => {
    jest.replaceProperty(Platform, "OS", "android");
    let themeListener:
      ((preferences: { colorScheme: "light" | "dark" | null | undefined }) => void) | null = null;
    jest.spyOn(Appearance, "addChangeListener").mockImplementation((next) => {
      themeListener = next as typeof themeListener;
      return { remove: jest.fn() };
    });
    render(<RemoteWebViewHost path="/home" testID="host" />);

    act(() => {
      themeListener?.({ colorScheme: "dark" });
    });

    expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
    const script = mockInjectJavaScript.mock.calls[0][0] as string;
    expect(script).toContain('\\"theme\\"');
    expect(script).toContain('\\"dark\\"');
  });

  it("로드가 끝나면 현재 테마를 다시 실어 보낸다 — 캐시된 초기 쿼리가 낡았을 수 있다", () => {
    jest.replaceProperty(Platform, "OS", "android");
    jest.spyOn(Appearance, "getColorScheme").mockReturnValue("dark");
    render(<RemoteWebViewHost path="/home" testID="host" />);

    const onLoadEnd = screen.getByTestId("host").props.onLoadEnd as () => void;
    act(() => {
      onLoadEnd();
    });

    const script = mockInjectJavaScript.mock.calls.at(-1)?.[0] as string;
    expect(script).toContain('\\"theme\\"');
    expect(script).toContain('\\"dark\\"');
  });

  it("iOS에서는 로드가 끝나도 테마를 주입하지 않는다", () => {
    jest.replaceProperty(Platform, "OS", "ios");
    render(<RemoteWebViewHost path="/home" testID="host" />);

    const onLoadEnd = screen.getByTestId("host").props.onLoadEnd as () => void;
    act(() => {
      onLoadEnd();
    });

    expect(mockInjectJavaScript).not.toHaveBeenCalled();
  });

  it("iOS에서는 테마 변경을 구독하지 않는다", () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const spy = jest.spyOn(Appearance, "addChangeListener");
    render(<RemoteWebViewHost path="/home" testID="host" />);

    expect(spy).not.toHaveBeenCalled();
  });

  it.each(["onError", "onHttpError"] as const)(
    "%s가 나면 실패 폴백과 재시도 수단을 보여준다",
    (event) => {
      render(<RemoteWebViewHost path="/home" testID="host" />);
      fireWebViewEvent(event);

      expect(screen.getByText("화면을 불러오지 못했어요")).toBeTruthy();
      expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
    },
  );

  it("다시 시도를 누르면 WebView를 다시 보여준다", () => {
    render(<RemoteWebViewHost path="/home" testID="host" />);
    fireWebViewEvent("onError");

    fireEvent.press(screen.getByRole("button", { name: "다시 시도" }));

    expect(screen.queryByText("화면을 불러오지 못했어요")).toBeNull();
    expect(screen.getByTestId("host").props.source).toEqual({ uri: "https://web.test/home" });
  });

  it("베이스 URL이 설정되지 않았으면 같은 실패 폴백으로 떨어진다", () => {
    mockWebBaseUrl = "";

    render(<RemoteWebViewHost path="/home" testID="host" />);

    expect(screen.getByText("화면을 불러오지 못했어요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
    expect(screen.getByTestId("host").props.source).toBeUndefined();
  });

  it("개발 빌드에서는 베이스 URL 미설정 사유를 노출한다", () => {
    mockWebBaseUrl = "";

    render(<RemoteWebViewHost path="/home" testID="host" />);

    expect(screen.getByText(/WEB_BASE_URL 미설정/)).toBeTruthy();
  });

  it("로드 실패(설정은 있음)일 때는 개발 사유 문구를 보이지 않는다", () => {
    render(<RemoteWebViewHost path="/home" testID="host" />);
    fireWebViewEvent("onError");

    expect(screen.queryByText(/WEB_BASE_URL 미설정/)).toBeNull();
  });

  it.each(["onError", "onHttpError"] as const)(
    "%s로 실패 폴백이 뜨면 onLoadEnd도 호출한다 — 스플래시가 재시도 버튼을 가리지 않도록",
    (event) => {
      const onLoadEnd = jest.fn();
      render(<RemoteWebViewHost path="/home" testID="host" onLoadEnd={onLoadEnd} />);

      fireWebViewEvent(event);

      expect(onLoadEnd).toHaveBeenCalled();
    },
  );

  it("베이스 URL이 설정되지 않았을 때도 onLoadEnd를 호출한다", () => {
    mockWebBaseUrl = "";
    const onLoadEnd = jest.fn();

    render(<RemoteWebViewHost path="/home" testID="host" onLoadEnd={onLoadEnd} />);

    expect(onLoadEnd).toHaveBeenCalled();
  });
});

/**
 * OS가 메모리 회수로 웹 콘텐츠 프로세스를 죽였을 때의 자동 복구(BY-374) — 이 핸들러들이
 * 없으면 웹뷰가 빈 흰 화면으로 영구 방치된다. 이미 로드가 끝난 페이지라 `onError` 폴백도
 * 스플래시도 불리지 않는 별개 경로다(시뮬레이터 WebContent kill로 재현 확인).
 */
describe("프로세스 종료 자동 복구 (BY-374)", () => {
  it("iOS 콘텐츠 프로세스가 죽으면 reload로 복구한다", () => {
    render(<RemoteWebViewHost path="/home" testID="host" />);

    const onTerminate = screen.getByTestId("host").props.onContentProcessDidTerminate as () => void;
    act(() => {
      onTerminate();
    });

    expect(mockReload).toHaveBeenCalled();
  });

  it("Android 렌더 프로세스가 죽으면 웹뷰를 재마운트한다 — 죽은 인스턴스는 reload로 못 살린다", () => {
    render(<RemoteWebViewHost path="/home" testID="host" />);
    expect(mockWebViewMounted).toHaveBeenCalledTimes(1);

    const onGone = screen.getByTestId("host").props.onRenderProcessGone as () => void;
    act(() => {
      onGone();
    });

    expect(mockWebViewMounted).toHaveBeenCalledTimes(2);
    // 재마운트 후에도 같은 URL을 다시 연다.
    expect(screen.getByTestId("host").props.source).toEqual({ uri: "https://web.test/home" });
  });
});

describe("onShouldStartLoadWithRequest", () => {
  /** WebView에 전달된 onShouldStartLoadWithRequest 핸들러를 꺼낸다. */
  function getShouldStartHandler(): (request: { isTopFrame?: boolean; url: string }) => boolean {
    return screen.getByTestId("host").props.onShouldStartLoadWithRequest as (request: {
      isTopFrame?: boolean;
      url: string;
    }) => boolean;
  }

  it("하위 프레임(iframe)은 외부 오리진이어도 항상 허용한다", () => {
    render(<RemoteWebViewHost path="/contact" testID="host" />);

    const shouldStart = getShouldStartHandler();

    expect(shouldStart({ isTopFrame: false, url: "https://docs.google.com/forms/d/e/1" })).toBe(
      true,
    );
  });

  it("최상위 프레임이 외부 오리진으로 이동하려 하면 막는다", () => {
    render(<RemoteWebViewHost path="/contact" testID="host" />);

    const shouldStart = getShouldStartHandler();

    expect(shouldStart({ isTopFrame: true, url: "https://docs.google.com/forms/d/e/1" })).toBe(
      false,
    );
  });

  it("최상위 프레임이 우리 오리진으로 이동하는 것은 허용한다", () => {
    render(<RemoteWebViewHost path="/contact" testID="host" />);

    const shouldStart = getShouldStartHandler();

    expect(shouldStart({ isTopFrame: true, url: "https://web.test/settings" })).toBe(true);
  });

  it("isTopFrame 필드가 없는(Android) 요청은 최상위 프레임으로 취급해 외부 오리진을 막는다", () => {
    render(<RemoteWebViewHost path="/contact" testID="host" />);

    const shouldStart = getShouldStartHandler();

    expect(shouldStart({ url: "https://docs.google.com/forms/d/e/1" })).toBe(false);
  });

  it("isTopFrame 필드가 없는(Android) 요청도 우리 오리진이면 허용한다", () => {
    render(<RemoteWebViewHost path="/contact" testID="host" />);

    const shouldStart = getShouldStartHandler();

    expect(shouldStart({ url: "https://web.test/settings" })).toBe(true);
  });
});

describe("Android 렌더러 사망 전역 복구 (BY-436)", () => {
  /**
   * Android WebView는 렌더러 프로세스 하나를 앱의 모든 WebView가 공유하고, 죽은 렌더러는
   * 거기 붙어 있던 WebView를 전부 파괴해야 대체된다(플랫폼 계약). 사망 통보를 받은 호스트
   * 하나만 재마운트하면 새 WebView가 죽은 렌더러에 붙어 로드가 영영 시작되지 않는다
   * — 실기기에서 소셜 스켈레톤이 걷히지 않던 원인.
   */
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("한 호스트의 렌더러 사망 통보가 다른 호스트도 재마운트시킨다", () => {
    jest.replaceProperty(Platform, "OS", "android");
    render(
      <>
        <RemoteWebViewHost path="/social" testID="social-host" />
        <RemoteWebViewHost path="/home" testID="home-host" />
      </>,
    );
    expect(mockWebViewMounted).toHaveBeenCalledTimes(2);

    act(() => {
      (screen.getByTestId("social-host").props.onRenderProcessGone as () => void)();
    });

    // 렌더러는 공유라 둘 다 죽었다 — 둘 다 재마운트되어야 새 렌더러가 뜬다.
    expect(mockWebViewMounted).toHaveBeenCalledTimes(4);
  });

  it("iOS는 개별 reload로 남는다 — 프로세스가 웹뷰별 독립이라 이웃을 건드리지 않는다", () => {
    render(
      <>
        <RemoteWebViewHost path="/social" testID="social-host" />
        <RemoteWebViewHost path="/home" testID="home-host" />
      </>,
    );

    act(() => {
      (screen.getByTestId("social-host").props.onContentProcessDidTerminate as () => void)();
    });

    expect(mockReload).toHaveBeenCalled();
    expect(mockWebViewMounted).toHaveBeenCalledTimes(2); // 재마운트 없음
  });

  it("전역 복구는 복구 중인 호스트를 건너뛴다 — 로드 중 재마운트 반복 방지", () => {
    jest.replaceProperty(Platform, "OS", "android");
    render(<RemoteWebViewHost path="/social" testID="host" />);
    act(() => {
      (screen.getByTestId("host").props.onLoadEnd as () => void)();
    });

    // 통보로 이미 복구(재마운트)에 들어간 상태에서 —
    act(() => {
      (screen.getByTestId("host").props.onRenderProcessGone as () => void)();
    });
    expect(mockWebViewMounted).toHaveBeenCalledTimes(2);

    // 이웃의 전역 복구 요청이 겹쳐 도착해도 또 재마운트하지 않는다.
    act(() => {
      requestGlobalWebViewRecovery();
    });
    expect(mockWebViewMounted).toHaveBeenCalledTimes(2);
  });
});

describe("report-screen 복원 (BY-436)", () => {
  it("report-screen은 화면 콜백으로도 전달된다 — 스플래시 톤은 RemoteScreen 몫이다", () => {
    const onBridgeMessage = jest.fn();
    render(<RemoteWebViewHost path="/social" testID="host" onBridgeMessage={onBridgeMessage} />);

    const onMessage = screen.getByTestId("host").props.onMessage as (e: unknown) => void;
    act(() => {
      onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: "report-screen", path: "/profile", dark: false, atMs: 1 }),
        },
      });
    });

    expect(onBridgeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "report-screen", path: "/profile" }),
      expect.any(Function),
    );
  });

  it("렌더러 사망 재마운트는 보고된 경로·쿼리로 연다 — 소셜룸을 잃지 않는다", () => {
    render(<RemoteWebViewHost path="/social" query={{ userId: 7 }} testID="host" />);

    const onMessage = screen.getByTestId("host").props.onMessage as (e: unknown) => void;
    act(() => {
      onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: "report-screen",
            path: "/social/room/42",
            restoreQuery: { code: "0712" },
            dark: true,
            atMs: 1,
          }),
        },
      });
    });
    act(() => {
      (screen.getByTestId("host").props.onRenderProcessGone as () => void)();
    });

    const uri = (screen.getByTestId("host").props.source as { uri: string }).uri;
    expect(uri).toContain("/social/room/42");
    expect(uri).toContain("code=0712");
    expect(uri).toContain("userId=7");
    expect(mockWebViewMounted).toHaveBeenCalledTimes(2);
  });

  it("보고가 없으면 재마운트는 원래 경로다", () => {
    render(<RemoteWebViewHost path="/social" query={{ userId: 7 }} testID="host" />);

    act(() => {
      (screen.getByTestId("host").props.onRenderProcessGone as () => void)();
    });

    const uri = (screen.getByTestId("host").props.source as { uri: string }).uri;
    expect(uri).toContain("/social?");
    expect(uri).not.toContain("code=");
  });
});

describe("SPA 라우팅과 스플래시 (BY-436)", () => {
  it("WebView에 onLoadStart 이벤트를 배선하지 않는다 — Android는 pushState에도 발화해 스플래시가 영영 안 걷힌다", () => {
    // RNCWebViewClient.doUpdateVisitedHistory가 History API 내비게이션마다
    // TopLoadingStartEvent(onLoadStart)를 쏘는데 onLoadEnd 짝은 없다. 스플래시 복귀는
    // 문서 로드 감지가 아니라 복구 진입(enterRecovery)이 명시적으로 알린다.
    render(<RemoteWebViewHost path="/social" testID="host" onRecoveryStart={jest.fn()} />);

    expect(screen.getByTestId("host").props.onLoadStart).toBeUndefined();
  });
});

/**
 * 생존 확인 ping 제거(BY-443) — 복귀 직후 세션 화면은 카메라 재획득·Vision 재기동으로 JS
 * 스레드가 바빠 pong이 늦고, 그 무응답을 사망으로 판정해 살아 있는 세션을 재마운트하면
 * 진행 중이던 공부시간이 초기화된다(갤럭시 A10 실기기 확인). 복구는 사후 통보
 * (onContentProcessDidTerminate/onRenderProcessGone)에만 의존한다.
 */
describe("포그라운드 복귀 생존 확인 없음 (BY-443)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockInjectJavaScript.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("로드 완료 후 포그라운드로 복귀해도 ping을 주입하지 않고, 시간이 지나도 재마운트·재로드가 없다", () => {
    const appStateSpy = jest.spyOn(AppState, "addEventListener");
    const onRecoveryStart = jest.fn();
    render(<RemoteWebViewHost path="/social" testID="host" onRecoveryStart={onRecoveryStart} />);
    act(() => {
      (screen.getByTestId("host").props.onLoadEnd as () => void)();
    });

    act(() => {
      for (const [event, handler] of appStateSpy.mock.calls) {
        if (event === "change") {
          (handler as (s: string) => void)("active");
        }
      }
    });
    act(() => {
      jest.runAllTimers();
    });

    expect(mockInjectJavaScript).not.toHaveBeenCalledWith(
      expect.stringContaining('\\"type\\":\\"ping\\"'),
    );
    expect(mockReload).not.toHaveBeenCalled();
    expect(onRecoveryStart).not.toHaveBeenCalled();
    expect(mockWebViewMounted).toHaveBeenCalledTimes(1);
  });
});

describe("프로세스 종료 통보의 즉시 스플래시 (BY-436)", () => {
  it("iOS 콘텐츠 프로세스 종료 통보가 오면 재로드 전에 스플래시부터 되돌린다", () => {
    const onLoadStart = jest.fn();
    render(<RemoteWebViewHost path="/social" testID="host" onRecoveryStart={onLoadStart} />);

    act(() => {
      (screen.getByTestId("host").props.onContentProcessDidTerminate as () => void)();
    });

    expect(onLoadStart).toHaveBeenCalled();
    expect(mockReload).toHaveBeenCalled();
  });

  it("Android 렌더러 사망 통보도 스플래시부터 되돌린다", () => {
    const onLoadStart = jest.fn();
    render(<RemoteWebViewHost path="/social" testID="host" onRecoveryStart={onLoadStart} />);

    act(() => {
      (screen.getByTestId("host").props.onRenderProcessGone as () => void)();
    });

    expect(onLoadStart).toHaveBeenCalled();
    expect(mockWebViewMounted).toHaveBeenCalledTimes(2);
  });
});

/**
 * 네이티브 사용자 이벤트의 전달 대상(sink) 배선(`lib/nativeAnalytics.ts`). 호스트는 "포커스된
 * 화면 + 웹이 `analytics-ready`를 보낸 문서"일 때만 붙어야 한다 — 탭 4개 웹뷰가 동시에 살아
 * 있어 조건이 하나라도 빠지면 한 터치가 N번 찍히거나 구독자 없는 문서에 버려진다.
 */
describe("RemoteWebViewHost — 네이티브 사용자 이벤트 sink", () => {
  /** 웹으로 주입된 track-event 메시지만 골라 파싱한다(스크립트 안의 JSON 문자열 리터럴을 두 번 푼다). */
  function injectedTrackEvents() {
    return mockInjectJavaScript.mock.calls
      .map((call) => String(call[0]))
      .filter((script) => script.includes("track-event"))
      .map((script) => {
        const literal = /__focusonNativeMessage\((.*)\); \} true;$/s.exec(script)?.[1] ?? '""';
        return JSON.parse(JSON.parse(literal) as string) as {
          type: string;
          name: string;
          properties?: Record<string, unknown>;
          atMs: number;
        };
      });
  }

  function fireAnalyticsReady() {
    const onMessage = screen.getByTestId("host").props.onMessage as (e: unknown) => void;
    act(() => {
      onMessage({ nativeEvent: { data: '{"type":"analytics-ready","atMs":1}' } });
    });
  }

  beforeEach(() => {
    __resetNativeAnalyticsForTests();
    // 주입 시 개발용 Metro 로그(`[analytics] → 웹`)는 테스트 출력만 어지럽힌다.
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    __resetNativeAnalyticsForTests();
  });

  it("개발 빌드에서는 웹뷰 인스펙터를 켠다 — iOS 16.4+는 이 플래그 없이는 Safari가 붙지 않는다", () => {
    render(<RemoteWebViewHost path="/home" testID="host" />);

    expect(screen.getByTestId("host").props.webviewDebuggingEnabled).toBe(true);
  });

  it("포커스된 웹뷰가 준비 신호를 보내면 그 뒤의 이벤트를 track-event로 주입하고 콜백에는 넘기지 않는다", () => {
    const onBridgeMessage = jest.fn();
    render(<RemoteWebViewHost path="/home" testID="host" onBridgeMessage={onBridgeMessage} />);
    fireAnalyticsReady();

    trackNativeEvent("tab_pressed", { tab: "social", from_tab: "home", via: "tab_bar" });

    expect(injectedTrackEvents()).toEqual([
      expect.objectContaining({
        type: "track-event",
        name: "tab_pressed",
        properties: { tab: "social", from_tab: "home", via: "tab_bar" },
      }),
    ]);
    expect(onBridgeMessage).not.toHaveBeenCalled();
  });

  it("준비 신호 전에 기록된 이벤트는 큐에 있다가 신호 뒤에 순서대로 주입된다", () => {
    trackNativeEvent("permission_denied_viewed");
    trackNativeEvent("permission_denied_left", { reason: "back_home" });

    render(<RemoteWebViewHost path="/home" testID="host" />);
    expect(injectedTrackEvents()).toEqual([]);

    fireAnalyticsReady();
    expect(injectedTrackEvents().map((message) => message.name)).toEqual([
      "permission_denied_viewed",
      "permission_denied_left",
    ]);
  });

  it("포커스가 아니면 준비 신호가 와도 주입하지 않는다 — 보이지 않는 탭 웹뷰에 찍히면 N번 집계된다", () => {
    render(<RemoteWebViewHost path="/records" testID="host" focused={false} />);
    fireAnalyticsReady();

    trackNativeEvent("tab_pressed", { tab: "social", from_tab: "home", via: "tab_bar" });

    expect(injectedTrackEvents()).toEqual([]);
  });

  it("포커스를 잃은 동안 쌓인 이벤트를 되찾을 때 넘겨받는다 — 권한 거부 화면이 홈 탭을 덮었다 걷힌 경우", () => {
    const view = render(<RemoteWebViewHost path="/home" testID="host" focused />);
    fireAnalyticsReady();

    view.rerender(<RemoteWebViewHost path="/home" testID="host" focused={false} />);
    trackNativeEvent("permission_denied_viewed");
    expect(injectedTrackEvents()).toEqual([]);

    view.rerender(<RemoteWebViewHost path="/home" testID="host" focused />);
    expect(injectedTrackEvents().map((message) => message.name)).toEqual([
      "permission_denied_viewed",
    ]);
  });

  it("사망 복구에 들어가면 준비 상태를 되돌린다 — 복구된 문서가 다시 신호를 보낼 때까지 큐에 둔다", () => {
    render(<RemoteWebViewHost path="/home" testID="host" />);
    fireAnalyticsReady();

    act(() => {
      (screen.getByTestId("host").props.onContentProcessDidTerminate as () => void)();
    });
    mockInjectJavaScript.mockClear();
    trackNativeEvent("permission_denied_viewed");
    expect(injectedTrackEvents()).toEqual([]);

    fireAnalyticsReady();
    expect(injectedTrackEvents().map((message) => message.name)).toEqual([
      "permission_denied_viewed",
    ]);
  });

  it("로드가 끝나도 준비 상태를 되돌리지 않는다 — 새 문서의 신호가 onLoadEnd보다 먼저 올 수 있다", () => {
    render(<RemoteWebViewHost path="/home" testID="host" />);
    fireAnalyticsReady();
    act(() => {
      (screen.getByTestId("host").props.onLoadEnd as () => void)();
    });

    trackNativeEvent("permission_denied_viewed");

    expect(injectedTrackEvents().map((message) => message.name)).toEqual([
      "permission_denied_viewed",
    ]);
  });

  it("로드 실패와 다시 시도를 이벤트로 남긴다 — 그 웹뷰로는 못 나가므로 큐에 쌓인다", () => {
    render(<RemoteWebViewHost path="/home" testID="host" />);
    fireWebViewEvent("onError");
    fireEvent.press(screen.getByRole("button", { name: "다시 시도" }));

    const received: string[] = [];
    attachNativeAnalyticsSink((event) => {
      received.push(`${event.name}:${JSON.stringify(event.properties)}`);
    });

    expect(received).toEqual([
      'webview_load_failed:{"path":"/home","reason":"error"}',
      'webview_retry_pressed:{"path":"/home"}',
    ]);
  });

  it("HTTP 오류 응답은 http 사유로 남긴다", () => {
    render(<RemoteWebViewHost path="/settings" testID="host" />);
    fireWebViewEvent("onHttpError");

    const received: unknown[] = [];
    attachNativeAnalyticsSink((event) => received.push(event.properties));

    expect(received).toEqual([{ path: "/settings", reason: "http" }]);
  });

  it("베이스 URL 미설정은 config 사유로 마운트당 한 번만 남긴다 — 재시도해도 같은 실패", () => {
    mockWebBaseUrl = "";
    render(<RemoteWebViewHost path="/home" testID="host" />);
    fireEvent.press(screen.getByRole("button", { name: "다시 시도" }));

    const received: string[] = [];
    attachNativeAnalyticsSink((event) => received.push(event.name));

    expect(received).toEqual(["webview_load_failed", "webview_retry_pressed"]);
  });
});
