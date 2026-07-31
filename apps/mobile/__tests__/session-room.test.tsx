import { render, screen } from "@testing-library/react-native";

import SessionRoomScreen from "../app/room/[id]";

/**
 * 싱글룸 세션 화면 — `RemoteScreen`(BY-333 2단계)의 소비처.
 *
 * 여기서 검증하는 것은 화면 고유 배선뿐이다: (1) `:id`로 세션 경로를 조립하는지, (2) 탭과
 * 동일한 쿼리 파라미터(userId·appVersion)가 붙는지, (3) 항상 다크 배경인지. 파라미터
 * 조립·브리지 공용화·스플래시 자체의 세부 동작은 `lib/__tests__/remoteQueryParams.test.ts`·
 * `lib/__tests__/nativeBridgeHandler.test.ts`·`components/__tests__/RemoteScreen.test.tsx`가
 * 덮는다.
 */

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "1" }),
}));

jest.mock("../lib/userApi", () => ({ getRegisteredUserId: jest.fn(async () => 7) }));

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

describe("SessionRoomScreen", () => {
  it("세션 경로 + 탭과 동일한 쿼리(userId·appVersion)로 조립한 URL을 WebView에 넘긴다", async () => {
    render(<SessionRoomScreen />);

    expect(await screen.findByTestId("session-webview")).toBeTruthy();
    expect(screen.getByTestId("session-webview").props.source).toEqual({
      uri: "https://web.test/room/1?userId=7&appVersion=1.4.2",
    });
  });

  it("세션 화면은 항상 다크 배경이다", async () => {
    render(<SessionRoomScreen />);

    expect(await screen.findByTestId("session-webview")).toBeTruthy();
    expect(screen.getByTestId("session-webview").props.style).toEqual({
      flex: 1,
      backgroundColor: "#0B0F14",
    });
  });
});
