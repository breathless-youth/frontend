import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { MyRoomSummary } from "../../types";
import { MyRoomCard } from "../MyRoomCard";

const room: MyRoomSummary = {
  joinPolicy: "approval",
  roomId: 7,
  name: "새벽 공시반",
  categoryLabel: "공무원",
  visibility: "public",
  memberCount: 2,
  newRequestCount: 0,
  members: [],
};

describe("MyRoomCard 새 신청 줄", () => {
  it("새 신청이 없으면 줄을 그리지 않고 카드만 그룹 홈으로 간다", async () => {
    const onOpen = vi.fn();
    render(<MyRoomCard room={room} onOpen={onOpen} onOpenRequests={vi.fn()} />);

    expect(screen.queryByText(/새 신청/)).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: /새벽 공시반/ }));
    expect(onOpen).toHaveBeenCalledWith(7);
  });

  it("새 신청이 있으면 수를 보이고 줄을 누르면 신청 확인으로만 간다", async () => {
    const onOpen = vi.fn();
    const onOpenRequests = vi.fn();
    render(
      <MyRoomCard
        room={{ ...room, newRequestCount: 2 }}
        onOpen={onOpen}
        onOpenRequests={onOpenRequests}
      />,
    );

    expect(screen.getByText("새 신청 2건")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "새벽 공시반, 새 신청 2건" }));
    expect(onOpenRequests).toHaveBeenCalledWith(7);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("두 버튼이 서로 안에 들어가지 않고 줄은 그룹 이름을 분석에서 가린다", () => {
    render(
      <MyRoomCard
        room={{ ...room, newRequestCount: 1 }}
        onOpen={vi.fn()}
        onOpenRequests={vi.fn()}
      />,
    );

    const row = screen.getByRole("button", { name: "새벽 공시반, 새 신청 1건" });
    expect(row.closest("button")).toBe(row);
    expect(row.parentElement?.closest("button")).toBeNull();
    expect(row).toHaveAttribute("data-amp-mask");
    expect(row).toHaveAttribute("data-amp-mask-attributes", "aria-label");
    expect(row).toHaveClass("min-h-11");
  });
});
