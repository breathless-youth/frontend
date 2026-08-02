import { act, render, screen } from "@testing-library/react-native";
import { BackHandler } from "react-native";

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

jest.mock("../lib/userApi", () => ({ ensureUserRegistered: jest.fn(async () => 7) }));

jest.mock("../lib/orientation", () => ({
  lockPortrait: jest.fn(),
  unlockForSession: jest.fn(),
}));

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

  /**
   * 뒤로가기를 막지 않으면 네이티브가 이 화면을 팝하면서 WebView가 파괴되고, 세션 로직이
   * 전부 그 안에 있으므로 종료·제출이 실행되지 않는다 — **공부한 시간이 통째로 사라진다.**
   * 화면에 보이는 증상이 없는 유실이라 테스트로 못 박는다. 차단 조건 자체(로딩 중·실패
   * 화면에서는 막지 않음)는 `components/__tests__/RemoteScreen.test.tsx`가 덮는다.
   */
  it("세션 화면만 안드로이드 하드웨어 뒤로가기를 막는다", async () => {
    const spy = jest.spyOn(BackHandler, "addEventListener");
    spy.mockImplementation(() => ({ remove: jest.fn() }));

    render(<SessionRoomScreen />);
    await screen.findByTestId("session-webview");
    // 웹뷰 로드가 끝나야(스플래시가 걷혀야) 지킬 세션이 생긴다.
    act(() => {
      (screen.getByTestId("session-webview").props.onLoadEnd as () => void)();
    });

    // `true` = "이 이벤트를 처리했으니 기본 동작(화면 닫기)을 하지 말라"
    expect(spy.mock.calls.at(-1)?.[1]()).toBe(true);
    spy.mockRestore();
  });

  /**
   * 화면 방향은 rn-screens 옵션이 아니라 expo-screen-orientation이 집행한다(P0-3 정정,
   * `lib/orientation.ts`) — 세션이 마운트에서 풀고 언마운트에서 되잠그는 배선이 빠지면
   * iOS에서 세션 가로 거치(S3-5·S3-6)가 통째로 죽거나, 반대로 세션을 나온 뒤에도 앱이
   * 회전하는 채로 남는다.
   */
  it("마운트에서 회전을 열고 언마운트에서 세로로 되잠근다", () => {
    const { lockPortrait, unlockForSession } =
      jest.requireMock<typeof import("../lib/orientation")>("../lib/orientation");
    // 앞선 테스트들의 렌더가 남긴 호출 누적을 걷어낸다 — 이 테스트는 횟수를 단언한다.
    (lockPortrait as jest.Mock).mockClear();
    (unlockForSession as jest.Mock).mockClear();

    const { unmount } = render(<SessionRoomScreen />);
    expect(unlockForSession).toHaveBeenCalledTimes(1);
    expect(lockPortrait).not.toHaveBeenCalled();

    unmount();
    expect(lockPortrait).toHaveBeenCalledTimes(1);
  });
});
