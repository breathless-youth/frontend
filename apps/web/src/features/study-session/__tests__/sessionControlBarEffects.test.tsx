import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SessionControlBar } from "../components/SessionControlBar";

/** BY-435 — 소셜룸 컨트롤 바와 동일한 버튼 모션을 싱글룸 바에도 건다. */
describe("SessionControlBar 버튼 효과 (BY-435)", () => {
  function renderBar() {
    render(
      <SessionControlBar
        paused={false}
        onTogglePause={vi.fn()}
        onFlipCamera={vi.fn()}
        onRequestExit={vi.fn()}
      />,
    );
  }

  it("카메라 전환을 누를 때마다 아이콘이 반 바퀴씩 돌아간다", () => {
    renderBar();
    const flip = screen.getByRole("button", { name: "카메라 전환" });
    const icon = flip.querySelector("img") as HTMLImageElement;
    expect(icon.style.transform).toBe("rotate(0deg)");

    fireEvent.click(flip);
    expect(icon.style.transform).toBe("rotate(180deg)");

    fireEvent.click(flip);
    expect(icon.style.transform).toBe("rotate(360deg)");
  });

  it("일시정지↔재개 아이콘은 팝 애니메이션으로 교체된다", () => {
    renderBar();
    const icon = screen.getByRole("button", { name: "일시정지" }).querySelector("img");
    expect(icon?.className).toContain("control-icon-pop");
  });

  it("버튼은 눌림 스케일 효과를 가진다", () => {
    renderBar();
    expect(screen.getByRole("button", { name: "공부 종료" })).toHaveClass("active:scale-90");
  });
});
