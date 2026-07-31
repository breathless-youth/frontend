import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ToNativeMessage } from "@focuson/types";

import { RemoteWebViewHost, buildRemoteWebViewUrl, originOf } from "../RemoteWebViewHost";

/**
 * 원격 웹뷰 호스트(BY-333) — 세션 화면이 직접 띄우던 WebView를 승격한 공용 컴포넌트.
 *
 * 검증 범위: URL 조립(경로+쿼리), 브리지 메시지 파싱→콜백 전달, 로드 실패·설정 누락이
 * **같은 폴백**으로 떨어지는지, 재시도가 다시 로드를 시도하는지.
 */

let mockWebBaseUrl: string | undefined = "https://web.test";

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
      ReactModule.useImperativeHandle(ref, () => ({ reload: jest.fn() }));
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

  it("설정된 베이스 URL의 오리진으로 originWhitelist를 제한한다", () => {
    render(<RemoteWebViewHost path="/home" testID="host" />);

    expect(screen.getByTestId("host").props.originWhitelist).toEqual(["https://web.test/*"]);
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
      onMessage({ nativeEvent: { data: '{"type":"exit-session","atMs":5}' } });
    });

    expect(onBridgeMessage).toHaveBeenCalledWith<[ToNativeMessage]>({
      type: "exit-session",
      atMs: 5,
    });
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

    expect(screen.getByText(/webBaseUrl 미설정/)).toBeTruthy();
  });

  it("로드 실패(설정은 있음)일 때는 개발 사유 문구를 보이지 않는다", () => {
    render(<RemoteWebViewHost path="/home" testID="host" />);
    fireWebViewEvent("onError");

    expect(screen.queryByText(/webBaseUrl 미설정/)).toBeNull();
  });
});
