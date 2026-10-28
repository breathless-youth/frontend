import type { RankingBoardGain } from "@focusmakers/types";
import { describe, expect, it } from "vitest";

import {
  FIXTURE_SESSION_GAINS,
  FIXTURE_SESSION_GAINS_EMPTY,
  FIXTURE_SESSION_GAINS_NO_WEEKLY,
} from "@/lib/rankingFixtures";

import { formatRise, formatRiseSpoken, gainCardView, gainChipLabel } from "../gainView";

const WEEKLY = { before: 1205, after: 1202, delta: 3 };

function gain(
  fields: Pick<RankingBoardGain, "type" | "period" | "slot" | "delta">,
): RankingBoardGain {
  return { ...fields, before: 100, after: 100 - fields.delta };
}

describe("gainCardView", () => {
  it("주간 순공이 오르지 않았으면 다른 판이 올라도 숨긴다", () => {
    expect(gainCardView(FIXTURE_SESSION_GAINS_NO_WEEKLY)).toBeNull();
    expect(gainCardView(FIXTURE_SESSION_GAINS_EMPTY)).toBeNull();
    expect(
      gainCardView({
        weekly: { before: 10, after: 10, delta: 0 },
        others: FIXTURE_SESSION_GAINS.others,
      }),
    ).toBeNull();
  });

  it("같은 판은 더 많이 오른 하나만 처음 나온 자리에 쓰고, 순공이 아니면 기간을 붙이지 않는다", () => {
    expect(gainCardView(FIXTURE_SESSION_GAINS)).toEqual({
      before: 1205,
      after: 1202,
      delta: 3,
      chips: [
        { key: "FOCUS_RATE:-", label: "집중률", delta: 208 },
        { key: "TIME_SLOT:EVENING", label: "저녁 구간", delta: 9 },
        { key: "TOTAL_TIME:-", label: "누적 시간", delta: 41 },
      ],
    });
  });

  it("뒤에 나온 같은 판이 더 많이 올랐으면 그 값과 그 기간을 앞 자리에 쓴다", () => {
    const view = gainCardView({
      weekly: WEEKLY,
      others: [
        gain({ type: "FOCUS_TIME", period: "DAILY", slot: null, delta: 4 }),
        gain({ type: "FOCUS_RATE", period: "WEEKLY", slot: null, delta: 2 }),
        gain({ type: "FOCUS_TIME", period: "MONTHLY", slot: null, delta: 12 }),
      ],
    });

    expect(view?.chips).toEqual([
      { key: "FOCUS_TIME:-", label: "월간 순공", delta: 12 },
      { key: "FOCUS_RATE:-", label: "집중률", delta: 2 },
    ]);
  });

  it("서버 순서대로 3개까지만 쓴다", () => {
    const view = gainCardView({
      weekly: WEEKLY,
      others: [
        gain({ type: "FOCUS_TIME", period: "DAILY", slot: null, delta: 12 }),
        gain({ type: "FOCUS_RATE", period: "MONTHLY", slot: null, delta: 3 }),
        gain({ type: "TIME_SLOT", period: "DAILY", slot: "MORNING", delta: 5 }),
        gain({ type: "MAX_STREAK", period: null, slot: null, delta: 2 }),
      ],
    });

    expect(view?.chips.map((chip) => chip.label)).toEqual(["일간 순공", "집중률", "아침 구간"]);
  });

  it("오르지 않은 판은 칩으로 쓰지 않는다", () => {
    const view = gainCardView({
      weekly: WEEKLY,
      others: [gain({ type: "TOTAL_DAYS", period: null, slot: null, delta: 0 })],
    });

    expect(view?.chips).toEqual([]);
  });
});

describe("표기", () => {
  it("칩 이름은 순공만 기간을 붙이고, 집중률은 종목, 시간대는 구간, 명예의 전당은 판 이름이다", () => {
    expect(gainChipLabel({ type: "FOCUS_TIME", period: "DAILY", slot: null })).toBe("일간 순공");
    expect(gainChipLabel({ type: "FOCUS_TIME", period: "MONTHLY", slot: null })).toBe("월간 순공");
    expect(gainChipLabel({ type: "FOCUS_RATE", period: "MONTHLY", slot: null })).toBe("집중률");
    expect(gainChipLabel({ type: "TIME_SLOT", period: "DAILY", slot: "NIGHT" })).toBe("심야 구간");
    expect(gainChipLabel({ type: "TOTAL_TIME", period: null, slot: null })).toBe("누적 시간");
    expect(gainChipLabel({ type: "TOTAL_DAYS", period: null, slot: null })).toBe("누적 일수");
    expect(gainChipLabel({ type: "MAX_STREAK", period: null, slot: null })).toBe("연속 공부");
  });

  it("오른 계단 수는 ▲를 붙이고 천 단위에 쉼표를 넣는다", () => {
    expect(formatRise(3)).toBe("▲3");
    expect(formatRise(1208)).toBe("▲1,208");
  });

  it("화면 낭독기용 표기는 계단 수를 문장으로 쓴다", () => {
    expect(formatRiseSpoken(3)).toBe("3계단 올랐어요");
    expect(formatRiseSpoken(1208)).toBe("1,208계단 올랐어요");
  });
});
