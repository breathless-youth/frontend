import { render, screen } from "@testing-library/react-native";

import SocialScreen from "../app/(tabs)/social";

/**
 * 소셜 홈
 */

jest.mock("../lib/userApi", () => ({ ensureUserRegistered: jest.fn(async () => 7) }));

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

describe("SocialScreen", () => {
  it("/social 경로 + 탭 공용 쿼리(userId·appVersion)로 조립한 URL을 로드한다", async () => {
    render(<SocialScreen />);

    expect(await screen.findByTestId("social-webview")).toBeTruthy();
    expect(screen.getByTestId("social-webview").props.source).toEqual({
      uri: "https://web.test/social?userId=7&appVersion=1.4.2",
    });
  });
});
