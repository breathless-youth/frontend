import { act, render, screen } from "@testing-library/react-native";
import { BackHandler, Text } from "react-native";

import { RemoteScreen } from "../RemoteScreen";
import { handleBridgeMessage } from "../../lib/nativeBridgeHandler";
import { __resetRemoteQueryParamsCacheForTests } from "../../lib/remoteQueryParams";
import { ensureUserRegistered } from "../../lib/userApi";

/**
 * 탭 3개 + 세션이 공유하는 원격 웹뷰 화면 골격(BY-333 2단계).
 *
 * 검증 범위: (1) 파라미터 조립이 끝나기 전엔 웹뷰를 띄우지 않고 스플래시만 보여주는지,
 * (2) 조립된 userId·appVersion이 실제로 URL에 붙는지, (3) 첫 로드가 끝나야 스플래시가
 * 걷히는지, (4) 브리지 메시지가 공용 핸들러(`handleBridgeMessage`)로 연결되는지.
 */

jest.mock("../../lib/userApi", () => ({ ensureUserRegistered: jest.fn() }));
jest.mock("../../lib/nativeBridgeHandler", () => ({ handleBridgeMessage: jest.fn() }));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { webBaseUrl: "https://web.test" }, version: "1.4.2" } },
}));

jest.mock("react-native-webview", () => {
  /*
    eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports --
    `jest.mock` 팩토리는 상단 import보다 먼저 호이스팅돼 평가되므로 import 바인딩을 참조할 수 없다.
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
        reload: jest.fn(),
        injectJavaScript: jest.fn(),
      }));
      return ReactModule.createElement(View, props);
    }),
  };
});

const mockedEnsureUserRegistered = ensureUserRegistered as jest.MockedFunction<
  typeof ensureUserRegistered
>;
const mockedHandleBridgeMessage = handleBridgeMessage as jest.MockedFunction<
  typeof handleBridgeMessage
>;

beforeEach(() => {
  jest.clearAllMocks();
  // 파라미터는 모듈 스코프에 캐시된다(BY-333) — 테스트마다 다른 userId를 목킹하므로,
  // 이전 테스트에서 채워진 캐시가 새 마운트에 그대로 재사용되지 않도록 초기화한다.
  __resetRemoteQueryParamsCacheForTests();
});

describe("RemoteScreen", () => {
  it("파라미터 조립이 끝나기 전엔 웹뷰 없이 스플래시만 보여준다", async () => {
    mockedEnsureUserRegistered.mockReturnValue(new Promise(() => undefined));

    render(<RemoteScreen testID="home-webview" path="/home" />);

    expect(screen.queryByTestId("home-webview")).toBeNull();
    expect(screen.getByTestId("home-webview-splash")).toBeTruthy();
  });

  it("splash로 받은 스켈레톤을 스플래시 자리에 그린다 — 기본 인디케이터 대신", async () => {
    mockedEnsureUserRegistered.mockReturnValue(new Promise(() => undefined));

    render(
      <RemoteScreen
        testID="home-webview"
        path="/home"
        splash={<Text testID="home-skeleton">skeleton</Text>}
      />,
    );

    const splash = screen.getByTestId("home-webview-splash");
    expect(screen.getByTestId("home-skeleton")).toBeTruthy();
    // 스켈레톤이 있어도 스플래시 컨테이너의 터치 통과 계약은 유지돼야 한다.
    expect(splash.props.pointerEvents).toBe("none");
  });

  it('스플래시는 pointerEvents="none"이라 터치를 가로채지 않는다', async () => {
    // pointerEvents 없이 뜨면 밑에 있는 웹뷰(또는 실패 폴백의 재시도 버튼)로 가는 모든
    // 터치를 스플래시가 가로챈다(BY-333 실기기 확인).
    mockedEnsureUserRegistered.mockReturnValue(new Promise(() => undefined));

    render(<RemoteScreen testID="home-webview" path="/home" />);

    expect(screen.getByTestId("home-webview-splash").props.pointerEvents).toBe("none");
  });

  it("조립된 userId·appVersion을 쿼리로 붙여 웹뷰를 띄운다", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(7);

    render(<RemoteScreen testID="home-webview" path="/home" />);

    expect(await screen.findByTestId("home-webview")).toBeTruthy();
    expect(screen.getByTestId("home-webview").props.source).toEqual({
      uri: "https://web.test/home?userId=7&appVersion=1.4.2&share=1&cameraGate=1&nativeUpdateGate=1",
    });
  });

  it("userId가 미등록이면 쿼리에서 생략한다", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(null);

    render(<RemoteScreen testID="home-webview" path="/home" />);

    expect(await screen.findByTestId("home-webview")).toBeTruthy();
    expect(screen.getByTestId("home-webview").props.source).toEqual({
      uri: "https://web.test/home?appVersion=1.4.2&share=1&cameraGate=1&nativeUpdateGate=1",
    });
  });

  it("웹뷰 로드가 끝나기 전까지는 스플래시가 남아 있다", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(7);

    render(<RemoteScreen testID="home-webview" path="/home" />);
    await screen.findByTestId("home-webview");

    expect(screen.getByTestId("home-webview-splash")).toBeTruthy();
  });

  it("웹뷰 로드가 끝나면 스플래시를 걷는다", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(7);

    render(<RemoteScreen testID="home-webview" path="/home" />);
    await screen.findByTestId("home-webview");

    const onLoadEnd = screen.getByTestId("home-webview").props.onLoadEnd as () => void;
    act(() => {
      onLoadEnd();
    });

    expect(screen.queryByTestId("home-webview-splash")).toBeNull();
  });

  it("사망 복구에 들어가면 스플래시를 되돌린다 — 복구 중 흰 화면 방지", async () => {
    // OS가 웹 콘텐츠 프로세스를 회수하면 복구(재로드)가 끝날 때까지 빈 화면만 남는다(BY-436).
    // WebView의 onLoadStart 이벤트가 아니라 호스트의 복구 진입 통지를 쓴다 — Android는
    // SPA 라우팅에도 onLoadStart가 발화해 스플래시가 영영 걷히지 않았다.
    mockedEnsureUserRegistered.mockResolvedValue(7);

    render(<RemoteScreen testID="home-webview" path="/home" />);
    const webview = await screen.findByTestId("home-webview");
    act(() => {
      (webview.props.onLoadEnd as () => void)();
    });
    expect(screen.queryByTestId("home-webview-splash")).toBeNull();

    act(() => {
      (webview.props.onContentProcessDidTerminate as () => void)();
    });

    expect(screen.getByTestId("home-webview-splash")).toBeTruthy();
  });

  it("웹뷰 로드가 실패해도 스플래시를 걷는다 — 실패 폴백의 재시도 버튼을 가리지 않도록", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(7);

    render(<RemoteScreen testID="home-webview" path="/home" />);
    const webview = await screen.findByTestId("home-webview");

    const onError = webview.props.onError as () => void;
    act(() => {
      onError();
    });

    expect(screen.queryByTestId("home-webview-splash")).toBeNull();
  });

  it("어두운 화면 보고(report-screen dark) 후의 복구 스플래시는 다크 배경이다 — 흰 번쩍임 방지(BY-436)", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(7);

    render(
      <RemoteScreen
        testID="social-webview"
        path="/social"
        splash={<Text testID="social-skeleton">skeleton</Text>}
      />,
    );
    const webview = await screen.findByTestId("social-webview");
    act(() => {
      (webview.props.onLoadEnd as () => void)();
    });

    // 웹이 소셜룸(다크 화면)에 있다고 보고한 뒤 렌더러가 죽어 리로드가 시작된 상황.
    act(() => {
      (webview.props.onMessage as (e: unknown) => void)({
        nativeEvent: {
          data: JSON.stringify({
            type: "report-screen",
            path: "/social/room/42",
            dark: true,
            atMs: 1,
          }),
        },
      });
    });
    act(() => {
      (webview.props.onContentProcessDidTerminate as () => void)();
    });

    const splash = screen.getByTestId("social-webview-splash");
    expect(splash.props.style).toMatchObject({ backgroundColor: "#0B0F14" });
    // 라이트 스켈레톤(소셜 홈 모양)은 다크 화면 위에 그리지 않는다.
    expect(screen.queryByTestId("social-skeleton")).toBeNull();
  });

  it("밝은 화면 보고 후의 복구 스플래시는 기존 스켈레톤 그대로다", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(7);

    render(
      <RemoteScreen
        testID="social-webview"
        path="/social"
        splash={<Text testID="social-skeleton">skeleton</Text>}
      />,
    );
    const webview = await screen.findByTestId("social-webview");
    act(() => {
      (webview.props.onLoadEnd as () => void)();
    });

    act(() => {
      (webview.props.onMessage as (e: unknown) => void)({
        nativeEvent: {
          data: JSON.stringify({ type: "report-screen", path: "/social", dark: false, atMs: 1 }),
        },
      });
    });
    act(() => {
      (webview.props.onContentProcessDidTerminate as () => void)();
    });

    expect(screen.getByTestId("social-skeleton")).toBeTruthy();
  });

  it("report-screen은 공용 브리지 핸들러로 넘기지 않는다 — 셸 내부 상태다", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(7);

    render(<RemoteScreen testID="social-webview" path="/social" />);
    const webview = await screen.findByTestId("social-webview");
    act(() => {
      (webview.props.onMessage as (e: unknown) => void)({
        nativeEvent: {
          data: JSON.stringify({ type: "report-screen", path: "/social", dark: false, atMs: 1 }),
        },
      });
    });

    expect(mockedHandleBridgeMessage).not.toHaveBeenCalled();
  });

  it("suppressTabBarMessages면 set-tab-bar만 걸러지고 다른 메시지는 통과한다", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(7);

    render(<RemoteScreen testID="home-webview" path="/home" suppressTabBarMessages />);
    const onMessage = (await screen.findByTestId("home-webview")).props.onMessage as (
      e: unknown,
    ) => void;

    act(() => {
      onMessage({ nativeEvent: { data: '{"type":"set-tab-bar","visible":true,"atMs":5}' } });
      onMessage({ nativeEvent: { data: '{"type":"navigate-home","atMs":6}' } });
    });

    expect(mockedHandleBridgeMessage).toHaveBeenCalledTimes(1);
    expect(mockedHandleBridgeMessage).toHaveBeenCalledWith(
      { type: "navigate-home", atMs: 6 },
      expect.any(Function),
    );
  });

  it("웹이 set-back-lock을 보내면 하드웨어 뒤로가기를 차단하고, 해제하면 되푼다", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(7);
    const remove = jest.fn();
    const spy = jest
      .spyOn(BackHandler, "addEventListener")
      .mockReturnValue({ remove } as ReturnType<typeof BackHandler.addEventListener>);

    render(<RemoteScreen testID="home-webview" path="/home" />);
    const webview = await screen.findByTestId("home-webview");
    act(() => {
      (webview.props.onLoadEnd as () => void)();
    });
    expect(spy).not.toHaveBeenCalled();

    const onMessage = webview.props.onMessage as (e: unknown) => void;
    act(() => {
      onMessage({ nativeEvent: { data: '{"type":"set-back-lock","locked":true,"atMs":5}' } });
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const handler = spy.mock.calls[0]?.[1] as () => boolean;
    expect(handler()).toBe(true);
    // 셸이 소비하는 메시지라 공용 핸들러로는 넘어가지 않는다
    expect(mockedHandleBridgeMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "set-back-lock" }),
      expect.any(Function),
    );

    act(() => {
      onMessage({ nativeEvent: { data: '{"type":"set-back-lock","locked":false,"atMs":6}' } });
    });
    expect(remove).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("문서가 다시 로드되면 웹 주도 잠금이 기본값(풀림)으로 돌아간다 — 렌더러 재생성 대비", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(7);
    const remove = jest.fn();
    const spy = jest
      .spyOn(BackHandler, "addEventListener")
      .mockReturnValue({ remove } as ReturnType<typeof BackHandler.addEventListener>);

    render(<RemoteScreen testID="home-webview" path="/home" />);
    const webview = await screen.findByTestId("home-webview");
    const onLoadEnd = webview.props.onLoadEnd as () => void;
    act(() => {
      onLoadEnd();
    });
    act(() => {
      (webview.props.onMessage as (e: unknown) => void)({
        nativeEvent: { data: '{"type":"set-back-lock","locked":true,"atMs":5}' },
      });
    });
    expect(spy).toHaveBeenCalledTimes(1);

    // 렌더러 크래시 등으로 새 문서가 로드되면 — 새 문서는 잠근 적이 없다
    act(() => {
      onLoadEnd();
    });

    expect(remove).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("비포커스 탭에서는 set-back-lock이 걸려도 하드웨어 뒤로가기를 막지 않는다", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(7);
    const spy = jest
      .spyOn(BackHandler, "addEventListener")
      .mockReturnValue({ remove: jest.fn() } as ReturnType<typeof BackHandler.addEventListener>);

    render(<RemoteScreen testID="home-webview" path="/home" suppressTabBarMessages />);
    const webview = await screen.findByTestId("home-webview");
    act(() => {
      (webview.props.onLoadEnd as () => void)();
    });
    act(() => {
      (webview.props.onMessage as (e: unknown) => void)({
        nativeEvent: { data: '{"type":"set-back-lock","locked":true,"atMs":5}' },
      });
    });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("포커스를 되찾으면 마지막 set-tab-bar 상태를 재보고한다 — 탭 전환 뒤 탭 바 유실 방지", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(7);
    const view = render(
      <RemoteScreen testID="home-webview" path="/home" suppressTabBarMessages={false} />,
    );
    const webview = await screen.findByTestId("home-webview");
    act(() => {
      (webview.props.onMessage as (e: unknown) => void)({
        nativeEvent: { data: '{"type":"set-tab-bar","visible":false,"atMs":5}' },
      });
    });

    view.rerender(<RemoteScreen testID="home-webview" path="/home" suppressTabBarMessages />);
    mockedHandleBridgeMessage.mockClear();
    view.rerender(
      <RemoteScreen testID="home-webview" path="/home" suppressTabBarMessages={false} />,
    );

    expect(mockedHandleBridgeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "set-tab-bar", visible: false }),
      expect.any(Function),
    );
  });

  it("웹이 보낸 브리지 메시지를 공용 핸들러로 넘긴다", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(7);

    render(<RemoteScreen testID="home-webview" path="/home" />);
    const onMessage = (await screen.findByTestId("home-webview")).props.onMessage as (
      e: unknown,
    ) => void;

    act(() => {
      onMessage({ nativeEvent: { data: '{"type":"navigate-home","atMs":5}' } });
    });

    expect(mockedHandleBridgeMessage).toHaveBeenCalledWith(
      { type: "navigate-home", atMs: 5 },
      expect.any(Function),
    );
  });
});
