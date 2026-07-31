import { act, render, screen } from "@testing-library/react-native";

import { RemoteScreen } from "../RemoteScreen";
import { handleBridgeMessage } from "../../lib/nativeBridgeHandler";
import { getRegisteredUserId } from "../../lib/userApi";

/**
 * 탭 3개 + 세션이 공유하는 원격 웹뷰 화면 골격(BY-333 2단계).
 *
 * 검증 범위: (1) 파라미터 조립이 끝나기 전엔 웹뷰를 띄우지 않고 스플래시만 보여주는지,
 * (2) 조립된 userId·appVersion이 실제로 URL에 붙는지, (3) 첫 로드가 끝나야 스플래시가
 * 걷히는지, (4) 브리지 메시지가 공용 핸들러(`handleBridgeMessage`)로 연결되는지.
 */

jest.mock("../../lib/userApi", () => ({ getRegisteredUserId: jest.fn() }));
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
      ReactModule.useImperativeHandle(ref, () => ({ reload: jest.fn() }));
      return ReactModule.createElement(View, props);
    }),
  };
});

const mockedGetRegisteredUserId = getRegisteredUserId as jest.MockedFunction<
  typeof getRegisteredUserId
>;
const mockedHandleBridgeMessage = handleBridgeMessage as jest.MockedFunction<
  typeof handleBridgeMessage
>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("RemoteScreen", () => {
  it("파라미터 조립이 끝나기 전엔 웹뷰 없이 스플래시만 보여준다", async () => {
    mockedGetRegisteredUserId.mockReturnValue(new Promise(() => undefined));

    render(<RemoteScreen testID="home-webview" path="/home" />);

    expect(screen.queryByTestId("home-webview")).toBeNull();
    expect(screen.getByTestId("home-webview-splash")).toBeTruthy();
  });

  it("조립된 userId·appVersion을 쿼리로 붙여 웹뷰를 띄운다", async () => {
    mockedGetRegisteredUserId.mockResolvedValue(7);

    render(<RemoteScreen testID="home-webview" path="/home" />);

    expect(await screen.findByTestId("home-webview")).toBeTruthy();
    expect(screen.getByTestId("home-webview").props.source).toEqual({
      uri: "https://web.test/home?userId=7&appVersion=1.4.2",
    });
  });

  it("userId가 미등록이면 쿼리에서 생략한다", async () => {
    mockedGetRegisteredUserId.mockResolvedValue(null);

    render(<RemoteScreen testID="home-webview" path="/home" />);

    expect(await screen.findByTestId("home-webview")).toBeTruthy();
    expect(screen.getByTestId("home-webview").props.source).toEqual({
      uri: "https://web.test/home?appVersion=1.4.2",
    });
  });

  it("웹뷰 로드가 끝나기 전까지는 스플래시가 남아 있다", async () => {
    mockedGetRegisteredUserId.mockResolvedValue(7);

    render(<RemoteScreen testID="home-webview" path="/home" />);
    await screen.findByTestId("home-webview");

    expect(screen.getByTestId("home-webview-splash")).toBeTruthy();
  });

  it("웹뷰 로드가 끝나면 스플래시를 걷는다", async () => {
    mockedGetRegisteredUserId.mockResolvedValue(7);

    render(<RemoteScreen testID="home-webview" path="/home" />);
    await screen.findByTestId("home-webview");

    const onLoadEnd = screen.getByTestId("home-webview").props.onLoadEnd as () => void;
    act(() => {
      onLoadEnd();
    });

    expect(screen.queryByTestId("home-webview-splash")).toBeNull();
  });

  it("웹이 보낸 브리지 메시지를 공용 핸들러로 넘긴다", async () => {
    mockedGetRegisteredUserId.mockResolvedValue(7);

    render(<RemoteScreen testID="home-webview" path="/home" />);
    const onMessage = (await screen.findByTestId("home-webview")).props.onMessage as (
      e: unknown,
    ) => void;

    act(() => {
      onMessage({ nativeEvent: { data: '{"type":"exit-session","atMs":5}' } });
    });

    expect(mockedHandleBridgeMessage).toHaveBeenCalledWith({ type: "exit-session", atMs: 5 });
  });
});
