import { render, screen } from "@testing-library/react-native";

import RecordsScreen from "../app/(tabs)/records";

/**
 * 기록 탭 — 푸시 딥링크 파라미터(path·at) 배선
 */

jest.mock("../lib/userApi", () => ({ ensureUserRegistered: jest.fn(async () => 7) }));

const mockParams: { path?: string; at?: string } = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useIsFocused: () => true,
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { webBaseUrl: "https://web.test" }, version: "1.4.2" } },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
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

describe("RecordsScreen 딥링크 파라미터", () => {
  const SHARED =
    "appVersion=1.4.2&share=1&cameraGate=1&nativeUpdateGate=1&guestAuth=1&videoShare=1&ranking=1&alertHaptic=1&nativeTabBar=1";

  afterEach(() => {
    delete mockParams.path;
    delete mockParams.at;
  });

  it("파라미터가 없으면 기록 루트를 연다", async () => {
    render(<RecordsScreen />);
    expect(await screen.findByTestId("records-webview")).toBeTruthy();
    expect(screen.getByTestId("records-webview").props.source).toEqual({
      uri: `https://web.test/records?${SHARED}`,
    });
  });

  it("path 파라미터의 경로와 쿼리로 웹뷰를 연다 — 공용 파라미터 뒤에 붙는다", async () => {
    mockParams.path = "/planner?date=2026-10-01";
    mockParams.at = "1";
    render(<RecordsScreen />);
    expect(await screen.findByTestId("records-webview")).toBeTruthy();
    expect(screen.getByTestId("records-webview").props.source).toEqual({
      uri: `https://web.test/planner?${SHARED}&date=2026-10-01`,
    });
  });

  it("링크 쿼리는 공용 파라미터(appVersion 등)를 덮어쓰지 못한다", async () => {
    mockParams.path = "/planner?appVersion=0.0.1&nativeUpdateGate=0&date=2026-10-01";
    mockParams.at = "1";
    render(<RecordsScreen />);
    expect(await screen.findByTestId("records-webview")).toBeTruthy();
    expect(screen.getByTestId("records-webview").props.source).toEqual({
      uri: `https://web.test/planner?${SHARED}&date=2026-10-01`,
    });
  });

  it("at이 바뀌면 웹뷰를 다시 마운트한다", async () => {
    mockParams.path = "/planner";
    mockParams.at = "1";
    const { rerender } = render(<RecordsScreen />);
    const first = await screen.findByTestId("records-webview");

    mockParams.at = "2";
    rerender(<RecordsScreen />);

    expect(await screen.findByTestId("records-webview")).not.toBe(first);
  });

  it("이 탭이 여는 경로가 아니면(세션 화면·다른 탭) 루트를 연다", async () => {
    mockParams.path = "/room/1";
    mockParams.at = "1";
    render(<RecordsScreen />);
    expect(await screen.findByTestId("records-webview")).toBeTruthy();
    expect(screen.getByTestId("records-webview").props.source).toEqual({
      uri: `https://web.test/records?${SHARED}`,
    });
  });
});
