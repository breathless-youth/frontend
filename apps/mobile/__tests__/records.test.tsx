import { render, screen } from "@testing-library/react-native";

import RecordsScreen from "../app/(tabs)/records";

/**
 * S5 · 기록 — 내용물이 `RemoteScreen`(BY-333 2단계)으로 이관됐다. 달력·통계 렌더링 등 예전
 * 네이티브 UI 검증은 더 이상 이 화면의 몫이 아니다(웹이 소유). 여기서는 `/records` 경로 +
 * 탭 공용 쿼리가 붙는지만 확인한다.
 */

jest.mock("../lib/userApi", () => ({ ensureUserRegistered: jest.fn(async () => 7) }));

jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useIsFocused: () => true,
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { webBaseUrl: "https://web.test" }, version: "1.4.2" } },
}));

// 스플래시 스켈레톤(`RemoteSplashSkeletons`)이 상단 안전영역을 읽는다 — home.test와 같은 목.
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

describe("RecordsScreen", () => {
  it("/records 경로 + 탭 공용 쿼리(userId·appVersion)로 조립한 URL을 로드한다", async () => {
    render(<RecordsScreen />);

    expect(await screen.findByTestId("records-webview")).toBeTruthy();
    expect(screen.getByTestId("records-webview").props.source).toEqual({
      uri: "https://web.test/records?userId=7&appVersion=1.4.2&share=1&cameraGate=1&nativeUpdateGate=1",
    });
  });
});
