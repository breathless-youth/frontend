import { fireEvent, render, screen } from "@testing-library/react-native";

import PermissionDeniedScreen from "../app/permission-denied";
import {
  __resetNativeAnalyticsForTests,
  attachNativeAnalyticsSink,
  type NativeAnalyticsEvent,
} from "../lib/nativeAnalytics";

/**
 * 화면 테스트는 `app/` 밖에 둔다 — `expo-router`의 라우트 컨텍스트 정규식은 `__tests__`·
 * `.test.tsx`를 걸러내지 않아(`node_modules/expo-router/_ctx.js` 확인), `app/` 아래에 두면
 * 테스트 파일이 그대로 라우트로 등록된다. 순수 유틸 테스트는 기존대로 `lib/__tests__`에 둔다.
 */

/** 화면이 스택에서 빠질 때 불리는 beforeRemove 리스너 — 이탈 계측이 여기에 걸린다. */
const mockBeforeRemove: { listener: (() => void) | null } = { listener: null };

jest.mock("expo-router", () => ({
  router: { canGoBack: jest.fn(() => true), back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  useNavigation: () => ({
    addListener: (event: string, listener: () => void) => {
      if (event === "beforeRemove") {
        mockBeforeRemove.listener = listener;
      }
      return () => {
        mockBeforeRemove.listener = null;
      };
    },
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

// 설정 앱 열기·권한 재조회는 OS 어댑터다 — 이벤트 배선만 보므로 무동작으로 둔다.
jest.mock("../lib/cameraPermission", () => ({
  openAppSettings: jest.fn(async () => undefined),
  getCameraPermissionStatus: jest.fn(async () => "denied"),
}));

describe("S2-3 · 권한 거부 안내", () => {
  it("확정 카피를 그대로 노출한다", () => {
    // 문구는 `ai-wiki/product/voice-tone.md` §4 확정 카피이자 Figma `52:312`와 문자 단위로
    // 일치해야 한다 — 의역·개행·문장부호가 바뀌면 여기서 깨진다.
    render(<PermissionDeniedScreen />);

    expect(screen.getByText("카메라 권한이 필요해요")).toBeTruthy();
    expect(
      screen.getByText("측정은 카메라로만 할 수 있어요.\n설정에서 허용하면 바로 시작할 수 있어요."),
    ).toBeTruthy();
    expect(screen.getByText("영상은 기기 안에서만 처리되고 저장되지 않아요")).toBeTruthy();
    expect(screen.getByText("설정 열기")).toBeTruthy();
    expect(screen.getByText("홈으로 돌아가기")).toBeTruthy();
  });

  it("버튼 두 개가 button role로 노출된다", () => {
    render(<PermissionDeniedScreen />);

    expect(screen.getByRole("button", { name: "설정 열기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "홈으로 돌아가기" })).toBeTruthy();
  });

  it("카메라 없이 시작하는 우회 경로를 제공하지 않는다 (policies.md §3 카메라 필수)", () => {
    render(<PermissionDeniedScreen />);

    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});

/**
 * S2-3은 네이티브 화면이라 웹 페이지뷰가 없다 — 노출·설정 열기·홈 복귀를 `permission_denied_*`로
 * 웹 Amplitude에 넘긴다. 이 화면이 탭 웹뷰를 덮는 동안은 sink가 없어 큐에 쌓였다가 홈 복귀 뒤 전달된다
 * (`lib/__tests__/nativeAnalytics.test.ts`) — 여기서는 발신 자체만 본다.
 */
describe("S2-3 · 이벤트", () => {
  let received: NativeAnalyticsEvent[];

  beforeEach(() => {
    __resetNativeAnalyticsForTests();
    received = [];
    attachNativeAnalyticsSink((event) => received.push(event));
    mockBeforeRemove.listener = null;
  });

  afterEach(() => {
    __resetNativeAnalyticsForTests();
  });

  const summary = () => received.map((event) => [event.name, event.properties]);

  it("노출 → 설정 열기를 남기고, 홈으로 돌아가기는 화면이 빠질 때 back_home으로 남긴다", () => {
    render(<PermissionDeniedScreen />);
    fireEvent.press(screen.getByRole("button", { name: "설정 열기" }));
    fireEvent.press(screen.getByRole("button", { name: "홈으로 돌아가기" }));
    // 버튼 자체는 이탈을 찍지 않는다 — 스택에서 빠지는 순간 한 번이다.
    expect(summary()).toEqual([
      ["permission_denied_viewed", undefined],
      ["permission_denied_settings_opened", undefined],
    ]);

    mockBeforeRemove.listener?.();

    expect(summary().at(-1)).toEqual(["permission_denied_left", { reason: "back_home" }]);
  });

  it("하드웨어 백·스와이프 백처럼 사유 없이 빠지면 back으로 남긴다", () => {
    render(<PermissionDeniedScreen />);

    mockBeforeRemove.listener?.();

    expect(summary()).toEqual([
      ["permission_denied_viewed", undefined],
      ["permission_denied_left", { reason: "back" }],
    ]);
  });
});
