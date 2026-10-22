import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SessionExitButton, SessionPauseButton } from "../SessionControlButtons";

describe("세션 하단 버튼", () => {
  it("일시정지 버튼 이름과 아이콘이 상태를 따라간다", () => {
    const { rerender } = render(<SessionPauseButton paused={false} onClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "일시정지" })).toBeInTheDocument();
    expect(screen.getByTestId("icon-pause").getAttribute("class")).toContain("control-icon-pop");

    rerender(<SessionPauseButton paused onClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "다시 시작" })).toBeInTheDocument();
    expect(screen.getByTestId("icon-play").getAttribute("class")).toContain("control-icon-pop");
  });

  it("버튼은 눌림 스케일 효과를 가진다", () => {
    render(<SessionPauseButton paused={false} onClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "일시정지" }).className).toContain("active:scale-95");
  });

  it("공부 종료 버튼이 종료 요청을 보낸다", async () => {
    const onClick = vi.fn();
    render(<SessionExitButton onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
