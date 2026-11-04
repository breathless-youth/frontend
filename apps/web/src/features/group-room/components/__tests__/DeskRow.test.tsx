import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RoomDeskMember } from "../../types";
import { DeskRow } from "../DeskRow";

const base = {
  isOwner: false,
  isMe: false,
  lastStudiedAt: null,
  todayStudySec: 0,
  accumulating: false,
} as const;
const members: RoomDeskMember[] = [
  { ...base, userId: 1, nickname: "새벽러", presence: "this_room", todayStudySec: 11_560 },
  { ...base, userId: 2, nickname: "연필깎이", presence: "away" },
  {
    ...base,
    userId: 3,
    nickname: "고구마맛탕",
    presence: "studying_elsewhere",
    todayStudySec: 7_100,
  },
];

function seats() {
  return Array.from(screen.getByTestId("desk-row").children);
}

describe("DeskRow", () => {
  it("작은 책상 6자리를 공부방, 다른 곳, 쉼, 빈자리 순서로 닉네임과 함께 놓는다", () => {
    render(<DeskRow members={members} />);
    expect(seats().map((seat) => seat.textContent)).toEqual([
      "새벽러",
      "고구마맛탕",
      "연필깎이",
      "빈자리",
      "빈자리",
      "빈자리",
    ]);
    expect(seats().map((seat) => seat.getAttribute("data-tone"))).toEqual([
      "room",
      "elsewhere",
      "rest",
      "empty",
      "empty",
      "empty",
    ]);
  });

  it("내 책상도 닉네임으로 쓴다", () => {
    render(
      <DeskRow
        members={[{ ...base, userId: 9, nickname: "열공곰", presence: "away", isMe: true }]}
      />,
    );
    expect(seats()[0].textContent).toBe("열공곰");
    expect(screen.queryByText("나")).toBeNull();
  });

  it("내 자리에만 작은 바탕과 테두리를 두고 닉네임을 굵게 쓴다", () => {
    render(
      <DeskRow
        members={[
          ...members,
          { ...base, userId: 9, nickname: "아주아주긴닉네임열공곰", presence: "away", isMe: true },
        ]}
      />,
    );
    const marked = seats().filter((seat) => seat.hasAttribute("data-me"));
    expect(marked).toHaveLength(1);
    expect(marked[0]).not.toHaveClass("bg-brand-subtle");
    expect(marked[0]).not.toHaveClass("border");
    const name = screen.getByText("아주아주긴닉네임열공곰");
    expect(name).toHaveClass("font-bold", "text-primary", "truncate");
    expect(name).not.toHaveClass("text-muted-foreground");
    expect(screen.getByText("연필깎이")).toHaveClass("text-muted-foreground");
  });
});
