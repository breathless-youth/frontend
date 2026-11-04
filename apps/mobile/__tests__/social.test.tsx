import { act, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

import SocialScreen from "../app/(tabs)/social";
import { handleTabBack } from "../lib/tabBack";

/**
 * 소셜 홈
 */

jest.mock("../lib/userApi", () => ({ ensureUserRegistered: jest.fn(async () => 7) }));

const mockParams: { code?: string; at?: string; path?: string } = {};
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

/** Android 시스템 뒤로 가기가 웹뷰 기록으로 돌아갔는지 보는 관찰점 */
const mockGoBack = jest.fn();

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
      ReactModule.useImperativeHandle(ref, () => ({ reload: jest.fn(), goBack: mockGoBack }));
      return ReactModule.createElement(View, props);
    }),
  };
});

describe("SocialScreen", () => {
  afterEach(() => {
    delete mockParams.code;
    delete mockParams.at;
    delete mockParams.path;
  });

  it("푸시 path 파라미터로 소셜 탭 안의 초대코드 공유 화면을 연다", async () => {
    mockParams.path = "/social/code";
    mockParams.at = "1";
    render(<SocialScreen />);
    expect(await screen.findByTestId("social-webview")).toBeTruthy();
    expect(screen.getByTestId("social-webview").props.source).toEqual({
      uri: "https://web.test/social/code?appVersion=1.4.2&share=1&cameraGate=1&nativeUpdateGate=1&guestAuth=1&videoShare=1&ranking=1&groupRooms=1&alertHaptic=1&pushPermission=1&nativeTabBar=1&lang=ko",
    });
  });

  it("code와 path가 같이 오면 초대 참여가 이긴다", async () => {
    mockParams.code = "5634";
    mockParams.path = "/social/code";
    mockParams.at = "1";
    render(<SocialScreen />);
    expect(await screen.findByTestId("social-webview")).toBeTruthy();
    expect(screen.getByTestId("social-webview").props.source).toEqual({
      uri: "https://web.test/social/join?appVersion=1.4.2&share=1&cameraGate=1&nativeUpdateGate=1&guestAuth=1&videoShare=1&ranking=1&groupRooms=1&alertHaptic=1&pushPermission=1&nativeTabBar=1&code=5634&lang=ko",
    });
  });

  it("/social 경로 + 탭 공용 쿼리(appVersion)로 조립한 URL을 로드한다", async () => {
    render(<SocialScreen />);

    expect(await screen.findByTestId("social-webview")).toBeTruthy();
    expect(screen.getByTestId("social-webview").props.source).toEqual({
      uri: "https://web.test/social?appVersion=1.4.2&share=1&cameraGate=1&nativeUpdateGate=1&guestAuth=1&videoShare=1&ranking=1&groupRooms=1&alertHaptic=1&pushPermission=1&nativeTabBar=1&lang=ko",
    });
  });

  it("code 파라미터가 있으면 /social/join을 코드 프리필로 로드한다", async () => {
    mockParams.code = "5634";
    render(<SocialScreen />);

    expect(await screen.findByTestId("social-webview")).toBeTruthy();
    expect(screen.getByTestId("social-webview").props.source).toEqual({
      uri: "https://web.test/social/join?appVersion=1.4.2&share=1&cameraGate=1&nativeUpdateGate=1&guestAuth=1&videoShare=1&ranking=1&groupRooms=1&alertHaptic=1&pushPermission=1&nativeTabBar=1&code=5634&lang=ko",
    });
  });

  it("code 없이 떠 있던 화면에 code가 생기면 key 변화로 재마운트해 join URL을 새로 로드한다", async () => {
    const { rerender } = render(<SocialScreen />);

    expect(await screen.findByTestId("social-webview")).toBeTruthy();
    expect(screen.getByTestId("social-webview").props.source).toEqual({
      uri: "https://web.test/social?appVersion=1.4.2&share=1&cameraGate=1&nativeUpdateGate=1&guestAuth=1&videoShare=1&ranking=1&groupRooms=1&alertHaptic=1&pushPermission=1&nativeTabBar=1&lang=ko",
    });

    mockParams.code = "5634";
    rerender(<SocialScreen />);

    expect(await screen.findByTestId("social-webview")).toBeTruthy();
    expect(screen.getByTestId("social-webview").props.source).toEqual({
      uri: "https://web.test/social/join?appVersion=1.4.2&share=1&cameraGate=1&nativeUpdateGate=1&guestAuth=1&videoShare=1&ranking=1&groupRooms=1&alertHaptic=1&pushPermission=1&nativeTabBar=1&code=5634&lang=ko",
    });
  });

  it("같은 코드라도 at이 바뀌면 웹뷰를 다시 마운트한다", async () => {
    mockParams.code = "5634";
    mockParams.at = "1";
    const { rerender } = render(<SocialScreen />);
    const first = await screen.findByTestId("social-webview");

    mockParams.at = "2";
    rerender(<SocialScreen />);

    expect(await screen.findByTestId("social-webview")).not.toBe(first);
  });
});

/**
 * Android 시스템 뒤로 가기
 *
 * 어떤 링크로 열었든 이 탭의 첫 화면은 그룹 탭 루트다.
 * 탭 루트에서는 웹뷰 기록이 남아 있어도 처리하지 않아 홈 탭 이동에 맡기고, 그 밖의 화면은 기록을 한 칸 거슬러 간다.
 */
describe("SocialScreen Android 시스템 뒤로 가기", () => {
  beforeEach(() => {
    mockGoBack.mockClear();
    jest.replaceProperty(Platform, "OS", "android");
    // 개발 빌드의 브리지 로그를 가린다.
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    delete mockParams.code;
    delete mockParams.at;
    delete mockParams.path;
    jest.restoreAllMocks();
  });

  /** 웹이 보고한 화면과 Android 웹뷰의 기록 상태를 흉내 낸다. */
  function showScreen(path: string, canGoBack: boolean) {
    const props = screen.getByTestId("social-webview").props as {
      onMessage: (e: unknown) => void;
      onNavigationStateChange: (e: unknown) => void;
    };
    act(() => {
      props.onNavigationStateChange({ url: `https://web.test${path}`, loading: false, canGoBack });
      props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: "report-screen", path, dark: false, atMs: 1 }),
        },
      });
    });
  }

  it("초대 링크로 연 탭은 방을 나와 돌아온 탭 루트에서 지난 참여 화면으로 돌아가지 않는다", async () => {
    mockParams.code = "5298";
    render(<SocialScreen />);
    await screen.findByTestId("social-webview");

    // 링크로 연 참여 화면에는 돌아갈 기록이 없다.
    showScreen("/social/join", false);
    expect(handleTabBack()).toBe(false);

    // 참여 화면에서 방에 들어갔다 나오면 기록은 남고 화면은 탭 루트다.
    showScreen("/social", true);
    expect(handleTabBack()).toBe(false);
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it("초대 링크로 연 탭도 탭 루트가 아닌 화면은 기록이 있으면 한 칸 돌아간다", async () => {
    mockParams.code = "5298";
    render(<SocialScreen />);
    await screen.findByTestId("social-webview");

    showScreen("/social/groups/42", true);
    expect(handleTabBack()).toBe(true);

    // 탭 루트에서 다시 연 참여 화면은 하위 화면이다.
    showScreen("/social/join", true);
    expect(handleTabBack()).toBe(true);
    expect(mockGoBack).toHaveBeenCalledTimes(2);
  });

  it("링크 없이 연 탭은 탭 루트가 첫 화면이다", async () => {
    render(<SocialScreen />);
    await screen.findByTestId("social-webview");

    showScreen("/social/groups/42", true);
    expect(handleTabBack()).toBe(true);
    expect(mockGoBack).toHaveBeenCalledTimes(1);

    showScreen("/social", true);
    expect(handleTabBack()).toBe(false);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it("알림 링크로 하위 화면을 연 탭은 탭 루트가 첫 화면이고, 돌아갈 기록이 생긴 뒤에만 처리한다", async () => {
    mockParams.path = "/social/groups/42";
    mockParams.at = "1";
    render(<SocialScreen />);
    await screen.findByTestId("social-webview");

    showScreen("/social/groups/42", false);
    expect(handleTabBack()).toBe(false);

    showScreen("/social/groups/42/members", true);
    expect(handleTabBack()).toBe(true);
    expect(mockGoBack).toHaveBeenCalledTimes(1);

    showScreen("/social", true);
    expect(handleTabBack()).toBe(false);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});
