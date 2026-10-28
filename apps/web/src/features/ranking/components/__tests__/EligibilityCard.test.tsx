import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FIXTURE_INELIGIBLE } from "@/lib/rankingFixtures";

import { IneligibleCard, LockedListCard } from "../EligibilityCard";

function paragraph(text: string) {
  return screen.getByText((_, element) => element?.tagName === "P" && element.textContent === text);
}

describe("IneligibleCard", () => {
  it("랭킹 진입까지 남은 순공과 예상 상위 %만 보이고 게이지와 숫자 줄은 없다", () => {
    render(
      <IneligibleCard
        board={FIXTURE_INELIGIBLE}
        deadline="마감 1일 9시간 전"
        onFocusStart={vi.fn()}
      />,
    );

    expect(paragraph("랭킹 진입까지 3시간 40분")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText("이번 주 순공", { exact: false })).toBeNull();
    expect(screen.queryByText("10시간")).toBeNull();
    expect(screen.getByText("현재 집중률이면 상위 15%예요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "순공 시작" })).toBeInTheDocument();
  });

  it("예상 순위가 3위 밖이고 예상 상위 %가 아직 안 오면 그 줄을 뺀다", () => {
    const { eligibility } = FIXTURE_INELIGIBLE;
    render(
      <IneligibleCard
        board={{
          ...FIXTURE_INELIGIBLE,
          eligibility: { ...eligibility!, expectedTopPercent: undefined },
        }}
        deadline={null}
        onFocusStart={vi.fn()}
      />,
    );

    expect(screen.queryByText(/현재 집중률이면/)).toBeNull();
    expect(screen.queryByText(/상위 \d+%예요/)).toBeNull();
    expect(screen.queryByText(/\d+위예요/)).toBeNull();
  });

  it("예상 순위가 1위보다 작게 오면 순위 줄을 쓰지 않는다", () => {
    const { eligibility } = FIXTURE_INELIGIBLE;
    render(
      <IneligibleCard
        board={{
          ...FIXTURE_INELIGIBLE,
          eligibility: { ...eligibility!, expectedRank: 0, expectedTopPercent: undefined },
        }}
        deadline={null}
        onFocusStart={vi.fn()}
      />,
    );

    expect(screen.queryByText(/현재 집중률이면/)).toBeNull();
    expect(screen.queryByText(/\d+위예요/)).toBeNull();
  });

  it.each([
    [1, 100, "현재 집중률이면 1위예요"],
    [2, undefined, "현재 집중률이면 2위예요"],
    [3, 75, "현재 집중률이면 3위예요"],
    [4, 80, "현재 집중률이면 상위 80%예요"],
  ])(
    "예상 %i위(상위 %s%%)는 3위까지 상위 %%가 없어도 순위로, 그 아래는 상위 %%로 쓴다",
    (expectedRank, expectedTopPercent, text) => {
      const { eligibility } = FIXTURE_INELIGIBLE;
      render(
        <IneligibleCard
          board={{
            ...FIXTURE_INELIGIBLE,
            eligibility: { ...eligibility!, expectedRank, expectedTopPercent },
          }}
          deadline={null}
          onFocusStart={vi.fn()}
        />,
      );

      expect(screen.getByText(text)).toBeInTheDocument();
    },
  );

  it("기간에 세션이 없으면 순공 0으로 본다", () => {
    render(
      <IneligibleCard
        board={{ ...FIXTURE_INELIGIBLE, period: "MONTHLY", eligibility: null }}
        deadline={null}
        onFocusStart={vi.fn()}
      />,
    );

    expect(paragraph("랭킹 진입까지 30시간")).toBeInTheDocument();
  });
});

describe("LockedListCard", () => {
  it("랭킹에 진입하면 앞뒤 순위가 보인다고 말한다", () => {
    render(<LockedListCard />);

    expect(screen.getByRole("region", { name: "내 앞뒤 순위" })).toHaveTextContent(
      "랭킹에 진입하면 나의 앞뒤 순위가 보여요",
    );
  });
});
