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
});
