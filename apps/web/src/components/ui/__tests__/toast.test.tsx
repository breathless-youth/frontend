import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";

import { Toast, ToastViewport, toastVariants } from "../toast";

/**
 * `--session-toast-bg`는 세션/룸 서브트리에만 주입되므로 세션 밖 화면(초대코드 공유·소셜 홈)은
 * CSS 변수 폴백이 없으면 배경이 투명해져 라이트 모드에서 흰 글자가 안 보인다(2026-08-24 결정:
 * 전 화면 다크 알약 + 흰 글자). Tailwind v4 임의값 클래스라 문자열 그대로 고정한다.
 * 임의값 클래스는 공백을 못 담아 폴백은 공백 없이 쓴다 — sessionTheme 값과 비교할 때도 공백을 지운다.
 */
const TOAST_BG_FALLBACK_CLASS = "bg-[var(--session-toast-bg,rgba(78,89,104,0.96))]";

describe("Toast", () => {
  it("세션 밖 화면(변수 미주입)에서도 보이도록 배경 클래스에 CSS 변수 폴백을 포함한다", () => {
    render(<Toast message="코드가 복사되었어요" />);

    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("코드가 복사되었어요");
    expect(toast.className).toContain(TOAST_BG_FALLBACK_CLASS);
    // 다크 알약 + 흰 글자 — 폴백 배경과 한 세트다.
    expect(toast.className).toContain("text-white");
  });

  it("폴백 값은 sessionTheme의 --session-toast-bg와 동일하다 — 세션 안팎에서 배경이 달라지면 안 된다", () => {
    const vars = sessionSurfaceStyle as unknown as Record<string, string>;
    const sessionValue = vars["--session-toast-bg"].replaceAll(" ", "");
    expect(TOAST_BG_FALLBACK_CLASS).toContain(`var(--session-toast-bg,${sessionValue})`);
    expect(toastVariants({ tone: "session" })).toContain(TOAST_BG_FALLBACK_CLASS);
  });
});

/**
 * 하단 오프셋이 화면마다 복붙돼 어긋났다 — 소셜 홈·설정은 탭 바를 피하려던 옛 +96px에
 * 남아 있는데 앱 전역 부팅 토스트는 2026-08-25에 +16px 표준으로 옮겨졌다(BY-436에서
 * 실기기 확인). 표준을 한 곳에 두고 화면들이 그것만 쓰게 한다.
 */
describe("ToastViewport", () => {
  it("앱 전역 표준 위치(하단 안전영역 + 16px)에 토스트를 띄운다", () => {
    const { container } = render(<ToastViewport message="저장했어요" />);

    const viewport = container.firstElementChild;
    expect(viewport?.className).toContain("bottom-[calc(env(safe-area-inset-bottom)+16px)]");
    // 토스트는 화면 조작을 막지 않는다 — 전면 고정 레이어라 없으면 밑의 버튼을 삼킨다.
    expect(viewport?.className).toContain("pointer-events-none");
    expect(screen.getByRole("status")).toHaveTextContent("저장했어요");
  });

  it("toastClassName은 알약에 전달된다 — 화면별 등장 모션(BY-435 설정 페이드 업)용", () => {
    render(
      <ToastViewport message="저장했어요" toastClassName="animate-[toast-rise_240ms_ease-out]" />,
    );

    expect(screen.getByRole("status").className).toContain("toast-rise");
  });

  it("message가 null이면 아무것도 그리지 않는다", () => {
    const { container } = render(<ToastViewport message={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("ToastViewport — 안드로이드 웹뷰 보정", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("안드로이드 웹뷰에서는 오프셋을 8px로 줄인다 — 탭 바가 시스템 내비 인셋만큼 높아 토스트가 iOS보다 높게 보인다", () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 15; wv)" });

    const { container } = render(<ToastViewport message="방이 만료되었어요" />);

    expect(container.firstElementChild?.className).toContain(
      "bottom-[calc(env(safe-area-inset-bottom)+8px)]",
    );
  });

  it("안드로이드라도 브리지가 없으면(브라우저 단독) 표준 16px이다 — 네이티브 탭 바가 없다", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 15) Chrome/128" });

    const { container } = render(<ToastViewport message="방이 만료되었어요" />);

    expect(container.firstElementChild?.className).toContain(
      "bottom-[calc(env(safe-area-inset-bottom)+16px)]",
    );
  });

  it("iOS 웹뷰는 표준 16px이다", () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    });

    const { container } = render(<ToastViewport message="방이 만료되었어요" />);

    expect(container.firstElementChild?.className).toContain(
      "bottom-[calc(env(safe-area-inset-bottom)+16px)]",
    );
  });
});
