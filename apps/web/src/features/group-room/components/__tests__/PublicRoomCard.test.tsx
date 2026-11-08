import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublicRoomSummary } from "../../types";
import { PublicRoomCard } from "../PublicRoomCard";

afterEach(cleanup);

const room: PublicRoomSummary = {
  joinPolicy: "approval",
  roomId: 7,
  name: "새벽 공시반",
  translatedName: null,
  categoryLabel: "공무원",
  memberCount: 4,
  weeklyAverageSec: 3600,
  studyingCount: 0,
  member: false,
};

describe("PublicRoomCard 참여 표시", () => {
  it("들어가지 않은 그룹에는 표시가 없다", () => {
    render(<PublicRoomCard room={room} onOpen={vi.fn()} />);

    expect(screen.queryByText("참여 중")).toBeNull();
    expect(screen.getByRole("button").getAttribute("aria-label")).not.toContain("참여 중");
  });

  it("들어간 그룹은 글자로 표시하고 카드 이름에도 담는다", async () => {
    const onOpen = vi.fn();
    render(<PublicRoomCard room={{ ...room, member: true }} onOpen={onOpen} />);

    expect(screen.getByText("참여 중")).toBeInTheDocument();
    const card = screen.getByRole("button", { name: /새벽 공시반, 참여 중/ });
    await userEvent.setup().click(card);
    expect(onOpen).toHaveBeenCalledWith(7);
  });
});

it.each([
  ["approval", "신청 후 입장"],
  ["open", "바로 입장"],
] as const)("shows the %s policy chip", (joinPolicy, label) => {
  render(<PublicRoomCard room={{ ...room, joinPolicy }} onOpen={vi.fn()} />);
  expect(screen.getByText(label)).toBeInTheDocument();
  expect(screen.getByRole("button")).toHaveAccessibleName(new RegExp(label));
});
