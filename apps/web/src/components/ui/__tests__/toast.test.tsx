import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";

import { Toast, toastVariants } from "../toast";

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
