import { render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import type * as ReactModule from "react";
import { BackHandler } from "react-native";
import type * as WebViewSharedModule from "react-native-webview/lib/WebViewShared";

import SessionRoomScreen from "../app/room/[id]";
import { getRegisteredUserId } from "../lib/userApi";
import { createFakeWebAssetServer, createUnavailableWebAssetServer } from "../lib/webAssetServer";
import { resetWebAssetServer, setWebAssetServer } from "../lib/webAssetServerRegistry";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "1" }),
  // 포커스 여부를 흉내내지 않는다 — 이 화면은 렌더되면 곧 포커스 상태다.
  // 정리 함수까지 그대로 흘려야 언마운트 시 핸들러 해제를 검증할 수 있다.
  useFocusEffect: (callback: () => undefined | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof ReactModule>("react");
    useEffect(callback, [callback]);
  },
}));

/**
 * 마지막 렌더의 WebView props — `originWhitelist`처럼 화면에 안 보이는 prop을 검증하기 위해
 * 붙잡아 둔다. 예전 모킹은 `source`/`testID`만 받고 나머지를 버렸는데, 그래서
 * `originWhitelist`가 잘못돼 세션이 시스템 브라우저로 열리는 버그를 테스트가 잡지 못했다.
 */
let lastWebViewProps: Record<string, unknown> = {};

jest.mock("react-native-webview", () => {
  const { View } = jest.requireActual("react-native");
  return {
    WebView: (props: { source: { uri: string }; testID?: string }) => {
      lastWebViewProps = props;
      return <View testID={props.testID ?? "webview"} accessibilityLabel={props.source.uri} />;
    },
  };
});

/**
 * dev 오리진은 기본 `null`(= 동봉 자산 + 로컬 정적 서버 경로)로 두고, 필요한 테스트에서만
 * 값을 넣는다 — 기존 테스트의 전제를 바꾸지 않기 위해서다.
 */
jest.mock("../lib/devWebOrigin", () => ({
  resolveDevWebOrigin: jest.fn(() => null),
}));

jest.mock("../lib/userApi", () => ({
  getRegisteredUserId: jest.fn(async () => 7),
}));

const mockGetRegisteredUserId = getRegisteredUserId as jest.MockedFunction<
  typeof getRegisteredUserId
>;

/**
 * 등록 자체를 관찰해야 한다 — "핸들러를 걸지 않았다"와 "걸었지만 false를 준다"는 결과가
 * 정반대인데(전자는 화면이 닫히고 후자는 안 닫힌다) 렌더 결과로는 구분되지 않는다.
 */
const backHandlerSpy = jest.spyOn(BackHandler, "addEventListener");

describe("SessionRoomScreen", () => {
  beforeEach(() => {
    mockGetRegisteredUserId.mockResolvedValue(7);
    backHandlerSpy.mockReset();
    backHandlerSpy.mockImplementation(() => ({ remove: jest.fn() }));
  });

  afterEach(() => {
    resetWebAssetServer();
  });

  it("서버가 뜨면 세션 URL을 WebView에 넘긴다", async () => {
    setWebAssetServer(createFakeWebAssetServer({ origin: "http://localhost:9999" }));

    render(<SessionRoomScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("session-webview")).toHaveProp(
        "accessibilityLabel",
        // `diag=1`은 `__DEV__`일 때만 붙는다(jest는 `__DEV__ === true`로 돈다).
        // 릴리스 빌드에서는 이 플래그가 없어 웹 진단이 꺼진 채 로드된다.
        "http://localhost:9999/room/1?userId=7&diag=1",
      );
    });
  });

  it("서버가 뜨기 전에는 WebView를 그리지 않는다", () => {
    setWebAssetServer(createFakeWebAssetServer());

    render(<SessionRoomScreen />);

    expect(screen.queryByTestId("session-webview")).toBeNull();
  });

  /**
   * 페이지(문서) 스크롤을 잠근다 — 카메라 프리뷰를 드래그하면 WKWebView가 콘텐츠와 무관하게
   * 화면을 밀어 올리는 러버밴드 바운스를 보인다(2026-07-30 실기기 확인). S4 통계 카드·자동/미달
   * 종료 안내처럼 실제로 스크롤이 필요한 콘텐츠는 각자 안의 `overflow-y-auto` 컨테이너가 맡으므로
   * (별도 컴포지팅 레이어) 이 세 값은 문서 루트 스크롤만 잠그고 그 컨테이너들과 무관하다.
   */
  it("문서 스크롤·바운스를 잠근다 — 카메라 프리뷰가 러버밴드로 밀리지 않아야 한다", async () => {
    setWebAssetServer(createFakeWebAssetServer({ origin: "http://localhost:9999" }));

    render(<SessionRoomScreen />);

    await screen.findByTestId("session-webview");
    expect(lastWebViewProps.scrollEnabled).toBe(false);
    expect(lastWebViewProps.bounces).toBe(false);
    expect(lastWebViewProps.overScrollMode).toBe("never");
  });

  it("서버 기동에 실패하면 WebView 대신 안내를 보여준다", async () => {
    setWebAssetServer(createFakeWebAssetServer({ failToStart: true }));

    render(<SessionRoomScreen />);

    await waitFor(() => {
      expect(screen.getByText("세션을 시작하지 못했어요")).toBeTruthy();
    });
    expect(screen.queryByTestId("session-webview")).toBeNull();
  });

  /**
   * 뒤로가기를 막지 않으면 네이티브가 이 화면을 팝하면서 WebView가 파괴되고, 세션 로직이
   * 전부 그 안에 있으므로 `endAndSubmit`이 실행되지 않는다 — **공부한 시간이 통째로 사라진다.**
   * 화면에 보이는 증상이 없는 유실이라 테스트로 못 박는다.
   */
  describe("Android 하드웨어 뒤로가기", () => {
    function registeredBackHandler() {
      const calls = backHandlerSpy.mock.calls;
      return calls.length === 0 ? null : calls[calls.length - 1]![1];
    }

    it("세션이 살아 있으면 뒤로가기를 소비한다 — 화면이 닫히지 않는다", async () => {
      setWebAssetServer(createFakeWebAssetServer({ origin: "http://localhost:9999" }));

      render(<SessionRoomScreen />);
      await screen.findByTestId("session-webview");

      // `true` = "이 이벤트를 처리했으니 기본 동작(화면 닫기)을 하지 말라"
      expect(registeredBackHandler()?.()).toBe(true);
    });

    it("오류 화면에서는 막지 않는다 — 막으면 사용자가 갇힌다", async () => {
      setWebAssetServer(createFakeWebAssetServer({ failToStart: true }));

      render(<SessionRoomScreen />);
      await screen.findByText("세션을 시작하지 못했어요");

      expect(backHandlerSpy).not.toHaveBeenCalled();
    });

    it("서버가 뜨기 전에도 막지 않는다 — 아직 지킬 세션이 없다", () => {
      setWebAssetServer(createFakeWebAssetServer());

      render(<SessionRoomScreen />);

      expect(backHandlerSpy).not.toHaveBeenCalled();
    });

    it("화면을 벗어나면 핸들러를 해제한다 — 남으면 다른 화면의 뒤로가기까지 먹는다", async () => {
      setWebAssetServer(createFakeWebAssetServer({ origin: "http://localhost:9999" }));

      const view = render(<SessionRoomScreen />);
      await screen.findByTestId("session-webview");
      const remove = backHandlerSpy.mock.results[0]!.value.remove as jest.Mock;
      view.unmount();

      expect(remove).toHaveBeenCalled();
    });
  });

  it("서버가 사용 불가면 실패 안내로 간다", async () => {
    // 사용 불가 서버는 start()가 **거부**된다. fake처럼 성공해버리면 라우트가 실패 분기를
    // 건너뛰고 존재하지 않는 서버를 로드해 백지가 된다 — 원인을 짚을 수 없는 실패다.
    // 레지스트리 기본값이 실제 구현으로 바뀐 뒤에도 이 분기는 그대로 살아 있어야 한다.
    setWebAssetServer(createUnavailableWebAssetServer());

    render(<SessionRoomScreen />);

    await waitFor(() => {
      expect(screen.getByText("세션을 시작하지 못했어요")).toBeTruthy();
    });
    expect(screen.queryByTestId("session-webview")).toBeNull();
  });

  it("userId를 못 읽어도 세션은 연다 — apps/web이 unsaved 경로로 처리한다", async () => {
    setWebAssetServer(createFakeWebAssetServer({ origin: "http://localhost:9999" }));
    mockGetRegisteredUserId.mockRejectedValue(new Error("SecureStore 읽기 실패"));

    render(<SessionRoomScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("session-webview")).toHaveProp(
        "accessibilityLabel",
        // userId만 빠지고 진단 플래그는 그대로다 — 둘은 독립이다.
        "http://localhost:9999/room/1?diag=1",
      );
    });
    expect(screen.queryByText("세션을 시작하지 못했어요")).toBeNull();
  });
});

/**
 * `originWhitelist` — **세션이 시스템 브라우저로 튀어나가지 않게 하는 유일한 방어선.**
 *
 * 2026-07-30 실기기에서 "공부 시작을 누르면 Safari가 열린다"는 증상이 났고, 원인은 dev 오리진
 * 항목에 붙은 `/*`였다. `react-native-webview`는 URL 전체가 아니라 **오리진만** 대조하므로
 * (`extractOrigin`이 경로를 잘라낸다) `https://host/*` → `^https://host/.*`는 오리진
 * `https://host`와 절대 일치하지 않고, 통과 못한 URL은 `Linking.openURL`로 넘어간다.
 *
 * 그래서 이 테스트는 배열 모양을 비교하는 데 그치지 않고 **라이브러리의 실제 판정 함수**로
 * 검증한다. 모양만 고정하면 라이브러리가 규칙을 바꿨을 때 그대로 통과해 버린다.
 */
describe("SessionRoomScreen — originWhitelist", () => {
  const TUNNEL = "https://sometimes-chance-sunglasses-sky.trycloudflare.com";
  const mockResolveDevWebOrigin = jest.requireMock<{
    resolveDevWebOrigin: jest.Mock;
  }>("../lib/devWebOrigin").resolveDevWebOrigin;

  /** 라이브러리의 실제 판정 로직으로 "이 URL이 WebView 안에서 열리는가"를 본다. */
  function opensInsideWebView(whitelist: string[], url: string): boolean {
    const { createOnShouldStartLoadWithRequest } = jest.requireActual<typeof WebViewSharedModule>(
      "react-native-webview/lib/WebViewShared",
    );
    let started = false;
    const handler = createOnShouldStartLoadWithRequest((shouldStart: boolean) => {
      started = shouldStart;
    }, whitelist);
    handler({ nativeEvent: { url, lockIdentifier: 0 } } as never);
    return started;
  }

  afterEach(() => {
    mockResolveDevWebOrigin.mockReturnValue(null);
  });

  it("dev 오리진의 세션 URL이 WebView 안에서 열린다 — 브라우저로 넘기지 않는다", async () => {
    mockResolveDevWebOrigin.mockReturnValue(TUNNEL);
    render(<SessionRoomScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("session-webview")).toBeTruthy();
    });
    const whitelist = lastWebViewProps.originWhitelist as string[];

    expect(opensInsideWebView(whitelist, `${TUNNEL}/room/1?userId=7&diag=1`)).toBe(true);
  });

  /** `/*`를 붙이면 왜 깨지는지 못 박는다 — 누군가 "친절하게" 되돌려 놓는 것을 막는다. */
  it("dev 오리진 항목에 `/*`를 붙이면 통과하지 못한다", () => {
    expect(opensInsideWebView([`${TUNNEL}/*`], `${TUNNEL}/room/1`)).toBe(false);
    expect(opensInsideWebView([TUNNEL], `${TUNNEL}/room/1`)).toBe(true);
  });

  it("로컬 정적 서버 오리진도 통과한다 — 포트 자리의 `*`는 멀쩡하다", () => {
    expect(
      opensInsideWebView(
        ["http://localhost:*", "http://127.0.0.1:*"],
        "http://127.0.0.1:9999/room/1?userId=7",
      ),
    ).toBe(true);
  });

  it("관계 없는 오리진은 WebView 안에서 열리지 않는다", async () => {
    mockResolveDevWebOrigin.mockReturnValue(TUNNEL);
    render(<SessionRoomScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("session-webview")).toBeTruthy();
    });
    const whitelist = lastWebViewProps.originWhitelist as string[];

    expect(opensInsideWebView(whitelist, "https://evil.example.com/room/1")).toBe(false);
  });
});
