import { describe, expect, it } from "vitest";

import {
  cardTitle,
  competitionLine,
  periodWord,
  podiumCaption,
  podiumTitle,
  previousResultLabel,
  resetNotice,
} from "../labels";

describe("시상대 제목과 오른쪽 글", () => {
  it.each([
    [{ type: "FOCUS_TIME", period: "DAILY", slot: null }, "오늘 TOP 3", null],
    [{ type: "FOCUS_TIME", period: "WEEKLY", slot: null }, "이번 주 TOP 3", null],
    [{ type: "FOCUS_TIME", period: "MONTHLY", slot: null }, "이번 달 TOP 3", null],
    [{ type: "FOCUS_RATE", period: "WEEKLY", slot: null }, "집중률 TOP 3", "순공 10시간 이상 참가"],
    [
      { type: "FOCUS_RATE", period: "MONTHLY", slot: null },
      "집중률 TOP 3",
      "순공 30시간 이상 참가",
    ],
    [{ type: "TIME_SLOT", period: "DAILY", slot: "MORNING" }, "오전 구간 TOP 3", "오늘 7–12시"],
    [{ type: "TIME_SLOT", period: "WEEKLY", slot: "NIGHT" }, "심야 구간 TOP 3", "이번 주 22–4시"],
    [{ type: "TOTAL_TIME", period: null, slot: null }, "명예의 전당 TOP 3", "누적 순공"],
    [{ type: "TOTAL_DAYS", period: null, slot: null }, "명예의 전당 TOP 3", "공부한 날"],
    [{ type: "MAX_STREAK", period: null, slot: null }, "연속 공부 TOP 3", "최대 연속 공부 기준"],
  ] as const)("%o", (board, title, caption) => {
    expect(podiumTitle(board)).toBe(title);
    expect(podiumCaption(board)).toBe(caption);
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

describe("처음 상태의 겨루는 기준", () => {
  it.each([
    [{ type: "FOCUS_TIME", period: "WEEKLY", slot: null }, "이번 주 순공으로 겨루는 중"],
    [{ type: "FOCUS_TIME", period: "DAILY", slot: null }, "오늘 순공으로 겨루는 중"],
    [{ type: "TIME_SLOT", period: "WEEKLY", slot: "EVENING" }, "이번 주 저녁 구간으로 겨루는 중"],
    [{ type: "TOTAL_TIME", period: null, slot: null }, "누적 순공으로 겨루는 중"],
    [{ type: "TOTAL_DAYS", period: null, slot: null }, "공부한 날로 겨루는 중"],
    [{ type: "MAX_STREAK", period: null, slot: null }, "최대 연속 공부로 겨루는 중"],
  ] as const)("%o", (board, line) => {
    expect(competitionLine(board)).toBe(line);
  });
});

describe("리셋 안내", () => {
  it("순공은 기간마다, 시간대는 구간 이름을 넣어 말한다", () => {
    expect(resetNotice({ type: "FOCUS_TIME", period: "DAILY", slot: null })).toBe(
      "00시에 일간 랭킹이 새로 시작됐어요",
    );
    expect(resetNotice({ type: "FOCUS_TIME", period: "WEEKLY", slot: null })).toBe(
      "월요일 00시에 주간 랭킹이 새로 시작됐어요",
    );
    expect(resetNotice({ type: "FOCUS_TIME", period: "MONTHLY", slot: null })).toBe(
      "1일 00시에 월간 랭킹이 새로 시작됐어요",
    );
    expect(resetNotice({ type: "TIME_SLOT", period: "DAILY", slot: "MORNING" })).toBe(
      "오늘 오전 구간 랭킹이 새로 시작됐어요",
    );
    expect(resetNotice({ type: "TIME_SLOT", period: "WEEKLY", slot: "MORNING" })).toBe(
      "이번 주 오전 구간 랭킹이 새로 시작됐어요",
    );
  });

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
