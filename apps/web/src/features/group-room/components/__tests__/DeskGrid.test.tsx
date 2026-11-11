import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { RoomDeskMember } from "../../types";
import { DeskGrid } from "../DeskGrid";

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

// 마지막으로 공부한 때는 시각에 따라 표기가 달라져서 값 대신 표기의 형태로 찾는다.
const LAST_STUDIED_TEXT = /오늘|어제|분 전|시간 전|일 전/;

function desks() {
  return within(screen.getByRole("list", { name: "멤버 책상" })).getAllByRole("listitem");
}

describe("DeskGrid", () => {
  it("공부방, 다른 곳, 쉼, 빈자리 순서이고 상태를 글로 읽는다", () => {
    render(<DeskGrid members={members} visibility="private" elapsedSec={0} />);
    const items = desks();
    expect(items).toHaveLength(6);
    expect(items[0]).toHaveAccessibleName("새벽러, 그룹장, 공부방에 있어요, 3:12:40");
    expect(items[1]).toHaveAccessibleName("고구마맛탕, 다른 곳에서 공부 중, 1:58:20");
    expect(items[2]).toHaveAccessibleName("연필깎이, 쉬는 중, 0:00:00");
    expect(items[5]).toHaveAccessibleName("빈자리");
  });

  it("마스코트가 있는 멤버는 마스코트와 입은 소품을 그리고 없는 멤버는 사람 그림이다", () => {
    const withMascot: RoomDeskMember[] = [
      {
        ...members[0]!,
        mascot: {
          id: "stopwatch",
          accessories: [{ slot: "head", code: "STOPWATCH_HEAD_CROWN", imageUrl: "/crown.png" }],
        },
      },
      members[1]!,
    ];
    render(<DeskGrid members={withMascot} visibility="private" elapsedSec={0} />);
    const [first, , third] = desks();
    expect(first!.querySelector('[data-slot="accessory-head"]')).toHaveAttribute(
      "src",
      "/crown.png",
    );
    expect(first!.querySelectorAll("img")).toHaveLength(2);
    expect(third!.querySelector("img")).toBeNull();
  });

  it("쉬는 멤버의 책상 아래에는 마지막으로 공부한 때를 보이지 않는다", () => {
    render(<DeskGrid members={members} visibility="private" elapsedSec={0} />);
    const resting = screen.getByRole("listitem", { name: /^연필깎이,/ });
    expect(within(resting).queryByText(LAST_STUDIED_TEXT)).toBeNull();
  });

  it("순공이 쌓이는 멤버만 시간이 흐른다", () => {
    render(<DeskGrid members={members} visibility="private" elapsedSec={5} />);
    expect(screen.getByText("3:12:45")).toBeInTheDocument();
    expect(screen.getByText("0:00:00")).toBeInTheDocument();
  });

  it("공개 그룹 빈자리에만 신청을 받고 있어요를 덧붙인다", () => {
    const { rerender } = render(<DeskGrid members={members} visibility="public" elapsedSec={0} />);
    expect(screen.getAllByText("신청을 받고 있어요")).toHaveLength(3);
    rerender(<DeskGrid members={members} visibility="private" elapsedSec={0} />);
    expect(screen.queryByText("신청을 받고 있어요")).toBeNull();
  });

  it("범례는 한 번만 둔다", () => {
    render(<DeskGrid members={members} visibility="private" elapsedSec={0} />);
    expect(screen.getAllByText("공부방에 있어요")).toHaveLength(1);
    expect(screen.getAllByText("다른 곳에서 공부 중")).toHaveLength(1);
  });

  it("내 책상도 닉네임으로 보이고 닉네임으로 읽는다", () => {
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
    render(<DeskGrid members={[mine]} visibility="private" elapsedSec={0} />);
    expect(desks()[0]).toHaveAccessibleName("열공곰, 그룹장, 쉬는 중, 1:12:30");
    expect(screen.getByText("열공곰")).toBeInTheDocument();
    expect(screen.queryByText("나")).toBeNull();
  });

  describe("내 책상 표시", () => {
    const mine: RoomDeskMember = {
      ...base,
      userId: 9,
      nickname: "아주아주아주긴닉네임을가진열공곰",
      presence: "away",
      isMe: true,
    };
    const other: RoomDeskMember = { ...base, userId: 1, nickname: "새벽러", presence: "away" };

    it("내 칸에는 바탕과 테두리를 두지 않는다", () => {
      render(<DeskGrid members={[other, mine]} visibility="private" elapsedSec={0} />);
      const marked = desks().filter((desk) => desk.hasAttribute("data-me"));
      expect(marked).toHaveLength(1);
      expect(marked[0]).toHaveAccessibleName(/아주아주아주긴닉네임을가진열공곰/);
      expect(marked[0]).not.toHaveClass("bg-brand-subtle");
      expect(marked[0]).not.toHaveClass("border");
    });

    it("내 닉네임만 파란색으로 굵고, 긴 이름은 칸 안에서 말줄임한다", () => {
      render(<DeskGrid members={[other, mine]} visibility="private" elapsedSec={0} />);
      const name = screen.getByText("아주아주아주긴닉네임을가진열공곰");
      expect(name).toHaveClass("font-bold", "text-primary", "truncate");
      expect(screen.getByText("새벽러")).toHaveClass("font-semibold", "text-foreground");
    });

    it("쉬는 중인 내 시간은 다른 멤버와 같은 흐린 글자색이다", () => {
      render(<DeskGrid members={[mine]} visibility="private" elapsedSec={0} />);
      const myDesk = desks().find((desk) => desk.hasAttribute("data-me"));
      expect(within(myDesk as HTMLElement).getByText("0:00:00")).toHaveClass(
        "text-muted-foreground",
      );
    });

    it("책상 그림의 상태 색은 그대로 둔다", () => {
      render(<DeskGrid members={[mine]} visibility="private" elapsedSec={0} />);
      const myDesk = desks().find((desk) => desk.hasAttribute("data-me"));
      expect((myDesk as HTMLElement).querySelector("svg g")).toHaveClass("stroke-text-tertiary");
    });
  });

  describe("빈자리 초대", () => {
    const four: RoomDeskMember[] = [
      ...members,
      { ...base, userId: 4, nickname: "민준", presence: "away" },
    ];
    const six: RoomDeskMember[] = [
      ...four,
      { ...base, userId: 5, nickname: "옥수수", presence: "away" },
      { ...base, userId: 6, nickname: "라떼", presence: "away" },
    ];

    it("멤버가 4명이면 빈자리 2개가 초대하기 버튼이고 누르면 넘긴다", async () => {
      const onInvite = vi.fn();
      render(<DeskGrid members={four} visibility="public" elapsedSec={0} onInvite={onInvite} />);
      const buttons = screen.getAllByRole("button", { name: "초대하기" });
      expect(buttons).toHaveLength(2);
      await userEvent.setup().click(buttons[0]!);
      expect(onInvite).toHaveBeenCalledOnce();
    });

    it("초대할 수 있는 빈자리에는 빈자리와 신청 안내 글자를 두지 않는다", () => {
      render(<DeskGrid members={four} visibility="public" elapsedSec={0} onInvite={vi.fn()} />);
      expect(screen.queryByText("빈자리")).toBeNull();
      expect(screen.queryByText("신청을 받고 있어요")).toBeNull();
      expect(screen.getAllByText("초대하기")).toHaveLength(2);
    });

    it("멤버가 6명이면 초대하기 버튼이 없다", () => {
      render(<DeskGrid members={six} visibility="private" elapsedSec={0} onInvite={vi.fn()} />);
      expect(screen.queryByRole("button", { name: "초대하기" })).toBeNull();
    });

    it("초대를 넘기지 않으면 지금처럼 빈자리로 읽고 버튼이 없다", () => {
      render(<DeskGrid members={four} visibility="public" elapsedSec={0} />);
      expect(screen.queryByRole("button")).toBeNull();
      expect(desks()[5]).toHaveAccessibleName("빈자리, 신청을 받고 있어요");
    });
  });
});
