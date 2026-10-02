import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SessionControlBar } from "../components/SessionControlBar";

/** BY-435 — 소셜룸 컨트롤 바와 동일한 버튼 모션을 싱글룸 바에도 건다. */
describe("SessionControlBar 버튼 효과 (BY-435)", () => {
  function renderBar() {
    render(<SessionControlBar paused={false} onTogglePause={vi.fn()} onRequestExit={vi.fn()} />);
  }

  it("일시정지↔재개 아이콘은 팝 애니메이션으로 교체된다", () => {
    renderBar();
    const icon = screen
      .getByRole("button", { name: "일시정지" })
      .querySelector('[data-testid="icon-pause"]');
    expect(icon?.getAttribute("class")).toContain("control-icon-pop");
  });

  it("버튼은 눌림 스케일 효과를 가진다", () => {
    renderBar();
    expect(screen.getByRole("button", { name: "공부 종료" })).toHaveClass("active:scale-95");
  });
});
