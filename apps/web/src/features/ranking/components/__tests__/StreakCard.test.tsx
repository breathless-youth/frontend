import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FIXTURE_STREAK } from "@/lib/rankingFixtures";

import { StreakCard } from "../StreakCard";

describe("StreakCard", () => {
  it("최고 기록과 지금을 나란히 두고 넘으려면 며칠인지 말한다", () => {
    render(<StreakCard board={FIXTURE_STREAK} />);

    expect(screen.getByRole("heading", { name: "최대 연속 공부" })).toBeInTheDocument();
    expect(screen.getByText("최고 기록").closest("div")).toHaveTextContent(
      "최고 기록13일9월 14일 – 9월 26일",
    );
    expect(screen.getByText("지금").closest("div")).toHaveTextContent(
      "지금0일오늘 공부하면 1일째예요",
    );
    expect(screen.getByText("을 이어가면 최고 기록을 넘어요", { exact: false })).toHaveTextContent(
      "14일을 이어가면 최고 기록을 넘어요",
    );
  });

  it.each([
    ["내일 순위가 오르는 판이어도", 1732],
    ["공동 순위라 내일 순위가 그대로여도", 1742],
    ["다음 순위 정보가 없어도", null],
  ])("지금이 최고 기록이면 %s 순위 없이 내일 이어 갈 일수만 말한다", (_, nextRank) => {
    render(
      <StreakCard
        board={{
          ...FIXTURE_STREAK,
          streak: {
            ...FIXTURE_STREAK.streak!,
            currentDays: 13,
            currentIsBest: true,
            nextRankIfContinue: nextRank,
          },
        }}
      />,
    );

    expect(screen.getByText("지금이 최고 기록")).toBeInTheDocument();
    expect(screen.getByText("내일도 공부하면 최대 14일이에요")).toBeInTheDocument();
    expect(screen.queryByText(/\d위/)).toBeNull();
    expect(screen.queryByText("최고 기록", { exact: true })).toBeNull();
  });
});
