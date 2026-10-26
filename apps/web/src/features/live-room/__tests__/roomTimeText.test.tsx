import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RoomTimeText } from "../components/RoomTimeText";

describe("RoomTimeText", () => {
  it("순공을 위에, 총 공부를 아래에 HH:MM:SS로 보여 주고 스크린리더에는 한글로 읽힌다", () => {
    render(<RoomTimeText focusSec={3725} studySec={7200} />);

    const root = screen.getByTestId("room-time-text");
    expect(root).toHaveClass("pointer-events-none");
    expect(screen.getByText("01:02:05")).toHaveAttribute("aria-hidden", "true");
    const total = screen.getByText("총").parentElement;
    expect(total).toHaveTextContent("총 02:00:00");
    expect(total).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("순공시간 1시간 2분 5초")).toHaveClass("sr-only");
    expect(screen.getByText("총 공부 시간 2시간")).toHaveClass("sr-only");
  });

  it("총 줄은 숨기면 높이를 접고 사라져 스크린리더에서도 빠지고, 다시 보이면 펼친다", () => {
    const { rerender } = render(<RoomTimeText focusSec={0} studySec={7200} totalHidden />);

    const row = screen.getByTestId("room-time-total");
    expect(row).toHaveClass("grid-rows-[0fr]", "opacity-0");
    expect(row).toHaveAttribute("aria-hidden", "true");
    // 세션 조작과 같은 시간·곡선으로 움직이고 동작 줄이기에서는 끈다.
    expect(row).toHaveClass(
      "duration-500",
      "ease-[cubic-bezier(0.32,0.72,0,1)]",
      "motion-reduce:transition-none",
    );

    rerender(<RoomTimeText focusSec={0} studySec={7200} />);

    expect(row).toHaveClass("grid-rows-[1fr]");
    expect(row).not.toHaveClass("opacity-0");
    expect(row).not.toHaveAttribute("aria-hidden");
    expect(screen.getByText("총 공부 시간 2시간")).toHaveClass("sr-only");
  });
});
