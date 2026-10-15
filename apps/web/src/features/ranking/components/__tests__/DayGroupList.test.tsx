import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FIXTURE_STREAK, FIXTURE_TOTAL_DAYS } from "@/lib/rankingFixtures";

import { DayGroupList } from "../DayGroupList";

describe("DayGroupList", () => {
  it("같은 일수끼리 묶은 줄에 순위, 이름, 일수만 보인다", () => {
    render(<DayGroupList type="MAX_STREAK" groups={FIXTURE_STREAK.aroundGroups!} />);

    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveTextContent("1,698형광펜 외 43명14일");
    expect(items[2]).toHaveAttribute("aria-current", "true");
    expect(items[2]).toHaveTextContent("1,742오늘도출석 외 41명13일");
    expect(screen.getByRole("list")).not.toHaveTextContent(/먼저 달성|번째로 달성/);
  });

  it("순위 칸 폭은 가장 긴 순위에 맞춘다", () => {
    const groups = FIXTURE_STREAK.aroundGroups!;
    const { unmount } = render(<DayGroupList type="MAX_STREAK" groups={groups} />);
    expect(screen.getByText("1,742")).toHaveStyle({ width: "5ch" });
    unmount();

    render(
      <DayGroupList
        type="MAX_STREAK"
        groups={groups.map((group, index) => ({ ...group, rank: 8 + index }))}
      />,
    );
    expect(screen.getByText("8")).toHaveStyle({ width: "2ch" });
  });

  it("혼자인 묶음은 외 N명을 붙이지 않는다", () => {
    render(
      <DayGroupList
        type="MAX_STREAK"
        groups={[{ ...FIXTURE_STREAK.aroundGroups![0]!, othersCount: 0 }]}
      />,
    );

    expect(screen.getByRole("listitem")).not.toHaveTextContent("외");
  });

  it.each([
    ["TOTAL_DAYS", FIXTURE_TOTAL_DAYS, "내 주변 누적 일수 순위"],
    ["MAX_STREAK", FIXTURE_STREAK, "내 주변 연속 공부 순위"],
  ] as const)("%s 판은 그 판 이름으로 목록을 부른다", (type, board, label) => {
    render(<DayGroupList type={type} groups={board.aroundGroups!} />);

    expect(screen.getByRole("region", { name: label })).toBeInTheDocument();
  });
});
