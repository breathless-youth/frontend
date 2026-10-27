import { describe, expect, it } from "vitest";

import {
  cardTitle,
  offSlotHeadline,
  offSlotNotice,
  periodWord,
  podiumTitle,
  podiumTooltip,
  previousResultLabel,
  slotName,
} from "../labels";

describe("시상대 제목과 기준 툴팁", () => {
  it.each([
    [{ type: "FOCUS_TIME", period: "DAILY", slot: null }, "오늘 TOP 3", null],
    [{ type: "FOCUS_TIME", period: "WEEKLY", slot: null }, "이번 주 TOP 3", null],
    [{ type: "FOCUS_TIME", period: "MONTHLY", slot: null }, "이번 달 TOP 3", null],
    [
      { type: "FOCUS_RATE", period: "WEEKLY", slot: null },
      "집중률 TOP 3",
      "이번 주에 순공 10시간 이상 기록하면 랭킹에 진입할 수 있어요",
    ],
    [
      { type: "FOCUS_RATE", period: "MONTHLY", slot: null },
      "집중률 TOP 3",
      "이번 달 순공 30시간 이상 기록하면 랭킹에 진입할 수 있어요",
    ],
    [
      { type: "TIME_SLOT", period: "DAILY", slot: "MORNING" },
      "오전 구간 TOP 3",
      "오늘 오전 7–12시 순공시간 기준",
    ],
    [
      { type: "TIME_SLOT", period: "WEEKLY", slot: "NIGHT" },
      "심야 구간 TOP 3",
      "이번 주 심야 22–4시 순공시간 기준",
    ],
    [{ type: "TIME_SLOT", period: "DAILY", slot: null }, "시간대 TOP 3", null],
    [{ type: "TOTAL_TIME", period: null, slot: null }, "명예의 전당 TOP 3", null],
    [{ type: "TOTAL_DAYS", period: null, slot: null }, "명예의 전당 TOP 3", null],
    [{ type: "MAX_STREAK", period: null, slot: null }, "연속 공부 TOP 3", null],
  ] as const)("%o", (board, title, tooltip) => {
    expect(podiumTitle(board)).toBe(title);
    expect(podiumTooltip(board)).toBe(tooltip);
  });
});

describe("순위 카드 제목", () => {
  it("기간 판은 종목과 기간, 명예의 전당은 종목 이름이다", () => {
    expect(cardTitle({ type: "FOCUS_TIME", period: "WEEKLY", slot: null })).toBe("순공 · 주간");
    expect(cardTitle({ type: "FOCUS_RATE", period: "MONTHLY", slot: null })).toBe("집중률 · 월간");
    expect(cardTitle({ type: "TIME_SLOT", period: "DAILY", slot: "MORNING" })).toBe(
      "오전 구간 · 일간",
    );
    expect(cardTitle({ type: "TOTAL_DAYS", period: null, slot: null })).toBe("누적 일수");
    expect(cardTitle({ type: "MAX_STREAK", period: null, slot: null })).toBe("최대 연속 공부");
  });
});

describe("지금 구간이 아닌 시간대 판", () => {
  const dawn = { type: "TIME_SLOT", period: "WEEKLY", slot: "DAWN" } as const;

  it("순위가 없으면 그 구간에 공부해야 랭킹에 들어간다고 말한다", () => {
    expect(offSlotHeadline(dawn)).toBe("새벽 구간에 공부하면 랭킹 진입");
  });

  it("순위가 있으면 큰 글씨 앞에 구간 이름을 쓴다", () => {
    expect(slotName(dawn)).toBe("새벽 구간");
  });

  it("그 구간 시각에 공부한 시간만 들어간다고 알린다", () => {
    expect(offSlotNotice(dawn)).toBe("새벽 4–7시에 공부한 시간만 이 순위에 들어가요");
    expect(offSlotNotice({ ...dawn, slot: "NIGHT" })).toBe(
      "심야 22–4시에 공부한 시간만 이 순위에 들어가요",
    );
  });

  it("구간이 없는 판은 알릴 구간이 없어 문구를 만들지 않는다", () => {
    expect(offSlotNotice({ ...dawn, slot: null })).toBeNull();
  });
});

describe("리셋 안내", () => {
  it("직전 기간 결과 이름", () => {
    expect(previousResultLabel("DAILY")).toBe("어제 최종 결과");
    expect(previousResultLabel("WEEKLY")).toBe("지난주 최종 결과");
    expect(previousResultLabel("MONTHLY")).toBe("지난달 최종 결과");
  });

  it("기간을 부르는 말", () => {
    expect(periodWord("DAILY")).toBe("오늘");
    expect(periodWord("WEEKLY")).toBe("이번 주");
    expect(periodWord("MONTHLY")).toBe("이번 달");
  });
});
