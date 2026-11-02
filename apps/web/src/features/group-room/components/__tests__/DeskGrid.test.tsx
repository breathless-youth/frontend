import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RoomDeskMember } from "../../types";
import { DeskGrid } from "../DeskGrid";

const NOW = new Date("2026-11-02T10:00:00+09:00");
const base = {
  isOwner: false,
  isMe: false,
  lastStudiedAt: null,
  todayStudySec: 0,
  accumulating: false,
} as const;
const members: RoomDeskMember[] = [
  {
    ...base,
    userId: 1,
    nickname: "새벽러",
    presence: "this_room",
    todayStudySec: 11_560,
    accumulating: true,
    isOwner: true,
  },
  {
    ...base,
    userId: 2,
    nickname: "연필깎이",
    presence: "away",
    lastStudiedAt: "2026-11-02T08:00:00+09:00",
  },
  {
    ...base,
    userId: 3,
    nickname: "고구마맛탕",
    presence: "studying_elsewhere",
    todayStudySec: 7_100,
    accumulating: true,
  },
];

function desks() {
  return within(screen.getByRole("list", { name: "멤버 책상" })).getAllByRole("listitem");
}

describe("DeskGrid", () => {
  it("공부방, 다른 곳, 쉼, 빈자리 순서이고 상태를 글로 읽는다", () => {
    render(<DeskGrid members={members} visibility="private" elapsedSec={0} now={NOW} />);
    const items = desks();
    expect(items).toHaveLength(6);
    expect(items[0]).toHaveAccessibleName("새벽러, 그룹장, 공부방에 있어요, 3:12:40");
    expect(items[1]).toHaveAccessibleName("고구마맛탕, 다른 곳에서 공부 중, 1:58:20");
    expect(items[2]).toHaveAccessibleName("연필깎이, 쉬는 중, 0:00:00, 2시간 전");
    expect(items[5]).toHaveAccessibleName("빈자리");
  });

  it("순공이 쌓이는 멤버만 시간이 흐른다", () => {
    render(<DeskGrid members={members} visibility="private" elapsedSec={5} now={NOW} />);
    expect(screen.getByText("3:12:45")).toBeInTheDocument();
    expect(screen.getByText("0:00:00")).toBeInTheDocument();
  });

  it("공개 그룹 빈자리에만 신청을 받고 있어요를 덧붙인다", () => {
    const { rerender } = render(
      <DeskGrid members={members} visibility="public" elapsedSec={0} now={NOW} />,
    );
    expect(screen.getAllByText("신청을 받고 있어요")).toHaveLength(3);
    rerender(<DeskGrid members={members} visibility="private" elapsedSec={0} now={NOW} />);
    expect(screen.queryByText("신청을 받고 있어요")).toBeNull();
  });

  it("범례는 한 번만 둔다", () => {
    render(<DeskGrid members={members} visibility="private" elapsedSec={0} now={NOW} />);
    expect(screen.getAllByText("공부방에 있어요")).toHaveLength(1);
    expect(screen.getAllByText("다른 곳에서 공부 중")).toHaveLength(1);
  });

  it("내 책상은 닉네임 대신 나로 보이고 나로 읽는다", () => {
    const mine: RoomDeskMember = {
      ...base,
      userId: 9,
      nickname: "열공곰",
      presence: "away",
      todayStudySec: 4_350,
      lastStudiedAt: "2026-11-02T08:00:00+09:00",
      isOwner: true,
      isMe: true,
    };
    render(<DeskGrid members={[mine]} visibility="private" elapsedSec={0} now={NOW} />);
    expect(desks()[0]).toHaveAccessibleName("나, 그룹장, 쉬는 중, 1:12:30, 2시간 전");
    expect(screen.getByText("나")).toBeInTheDocument();
    expect(screen.queryByText("열공곰")).toBeNull();
  });
});
