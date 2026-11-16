import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { EarnToday, StudyPointTier } from "../../../types";
import { StudyRow } from "../StudyRow";

const HOUR = 3600;
const TIERS: StudyPointTier[] = [
  { fromSec: 0, toSec: 2 * HOUR, soloPoints: 7, togetherPoints: 10 },
  { fromSec: 2 * HOUR, toSec: 4 * HOUR, soloPoints: 4, togetherPoints: 5 },
  { fromSec: 4 * HOUR, toSec: 12 * HOUR, soloPoints: 1, togetherPoints: 2 },
];

function study(focusSec: number, extra: Partial<EarnToday["study"]> = {}): EarnToday["study"] {
  return {
    focusSec,
    capSec: 12 * HOUR,
    unitSec: 30 * 60,
    pointsPerUnit: 7,
    tiers: TIERS,
    ...extra,
  };
}

const together = () => screen.queryByText(/그룹 공부방에서 같이 하면/);

describe("StudyRow", () => {
  it.each([
    [HOUR, "+10P"],
    [3 * HOUR, "+5P"],
    [5 * HOUR, "+2P"],
  ])("오늘 순공 %i초면 지금 구간의 같이 값을 30분마다로 한 줄 알린다", (focusSec, points) => {
    render(<StudyRow study={study(focusSec)} />);

    expect(together()).toHaveTextContent(`그룹 공부방에서 같이 하면 30분마다 ${points}`);
  });

  it("구간을 주지 않는 서버에서는 같이 하면 줄이 없다", () => {
    render(<StudyRow study={study(HOUR, { tiers: undefined })} />);

    expect(together()).toBeNull();
  });

  it("같이 값이 혼자 값보다 크지 않으면 같이 하면 줄이 없다", () => {
    const flat = TIERS.map((tier) => ({ ...tier, togetherPoints: tier.soloPoints }));
    render(<StudyRow study={study(HOUR, { tiers: flat })} />);

    expect(together()).toBeNull();
  });

  it("오늘 같이 한 시간은 따로 보이지 않는다", () => {
    render(<StudyRow study={study(HOUR, { togetherFocusSec: 70 * 60 })} />);

    expect(screen.queryByText(/같이 1시간 10분/)).toBeNull();
  });
});
