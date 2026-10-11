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
    expect(screen.getByText("지금").closest("div")).toHaveTextContent("지금0일오늘 공부하면 1일째");
    expect(screen.getByText("을 이어가면 최고 기록을 넘어요", { exact: false })).toHaveTextContent(
      "14일을 이어가면 최고 기록을 넘어요",
    );
  });

  it("지금이 최고 기록이면 비교 없이 내일 오를 순위를 말한다", () => {
    render(
      <StreakCard
        board={{
          ...FIXTURE_STREAK,
          streak: {
            ...FIXTURE_STREAK.streak!,
            currentDays: 13,
            currentIsBest: true,
            nextRankIfContinue: 1732,
          },
        }}
      />,
    );

    expect(screen.getByText("지금이 최고 기록이에요")).toBeInTheDocument();
    expect(screen.getByText("내일도 공부하면 최대 14일 · 1,732위로 올라가요")).toBeInTheDocument();
    expect(screen.queryByText("최고 기록")).toBeNull();
  });

  it.each([
    ["지금 순위와 같으면", 1742],
    ["지금 순위보다 뒤면", 1750],
  ])("공동 순위라 내일 순위가 %s 오른다고 하지 않고 일수만 말한다", (_, nextRank) => {
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

    expect(screen.getByText("지금이 최고 기록이에요")).toBeInTheDocument();
    expect(screen.getByText("내일도 공부하면 최대 14일이에요")).toBeInTheDocument();
    expect(screen.queryByText(/올라가요/)).toBeNull();
  });
});
