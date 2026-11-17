import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SessionStatusLine } from "../components/SessionStatusLine";

describe("SessionStatusLine", () => {
  it("문구를 상태 알림 영역으로 읽힌다", () => {
    render(<SessionStatusLine state="focus" label="순공시간 측정 중" />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("순공시간 측정 중");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it.each([
    ["focus", "--session-pill-border-focus"],
    ["distract", "--session-pill-border-distract"],
    ["paused", "--session-pill-border-paused"],
  ] as const)("%s 점은 필 테두리 색 변수를 쓴다", (state, variable) => {
    render(<SessionStatusLine state={state} label="x" />);
    expect(screen.getByTestId("status-dot").getAttribute("style")).toContain(variable);
  });

  it("심플 모드에서는 화면에서 숨기지만 알림은 남는다", () => {
    render(<SessionStatusLine state="focus" label="순공시간 측정 중" concealed />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("순공시간 측정 중");
    // 시각적 숨김은 다른 방법으로 드러나지 않아 클래스로 본다.
    expect(status).toHaveClass("sr-only");
    expect(screen.queryByTestId("status-dot")).not.toBeInTheDocument();
  });

  it("알림을 내면 안 되는 자리의 줄은 알림 영역이 아니다", () => {
    render(<SessionStatusLine state="distract" label="자리를 비운 것 같아요" live={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
