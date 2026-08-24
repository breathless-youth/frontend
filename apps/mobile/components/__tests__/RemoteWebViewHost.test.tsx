import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ToNativeMessage, ToWebMessage } from "@focusmakers/types";

import { RemoteWebViewHost, buildRemoteWebViewUrl, originOf } from "../RemoteWebViewHost";

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
