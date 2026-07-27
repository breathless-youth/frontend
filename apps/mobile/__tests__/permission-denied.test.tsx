import { render, screen } from "@testing-library/react-native";

import PermissionDeniedScreen from "../app/permission-denied";

/**
 * 화면 테스트는 `app/` 밖에 둔다 — `expo-router`의 라우트 컨텍스트 정규식은 `__tests__`·
 * `.test.tsx`를 걸러내지 않아(`node_modules/expo-router/_ctx.js` 확인), `app/` 아래에 두면
 * 테스트 파일이 그대로 라우트로 등록된다. 순수 유틸 테스트는 기존대로 `lib/__tests__`에 둔다.
 */

jest.mock("expo-router", () => ({
  router: { canGoBack: jest.fn(() => true), back: jest.fn(), replace: jest.fn(), push: jest.fn() },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

describe("S2-3 · 권한 거부 안내", () => {
  it("확정 카피를 그대로 노출한다", () => {
    // 문구는 `.ai/product/voice-tone.md` §4 확정 카피이자 Figma `52:312`와 문자 단위로
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
