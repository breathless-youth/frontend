import type { DailyStudyStat } from "@focusmakers/types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MonthTiles } from "../MonthTiles";
import type { CalendarMonth } from "../recordsFormat";

const SEPTEMBER: CalendarMonth = { year: 2026, month: 9 };

function day(date: string, focusSec: number): DailyStudyStat {
  return { date, studySec: focusSec, focusSec };
}

describe("MonthTiles", () => {
  it("이 달 최고 기록의 순공시간과 날짜를 표시한다", () => {
    const daily = [day("2026-09-05", 3600), day("2026-09-07", 4 * 3600 + 12 * 60)];
    render(<MonthTiles daily={daily} month={SEPTEMBER} todayKey="2026-09-20" />);

    expect(screen.getByText("4시간 12분")).toBeInTheDocument();
    expect(screen.getByText("9월 7일")).toBeInTheDocument();
  });

  it("기록이 없으면 폴백을 보여준다", () => {
    render(<MonthTiles daily={[]} month={SEPTEMBER} todayKey="2026-09-20" />);

    expect(screen.getByText("기록 없음")).toBeInTheDocument();
  });

  it("현재 달은 오늘 일자를 분모로 공부 일수와 비율을 표시한다", () => {
    // 20일 경과 중 3일 공부 → 3/20 = 15%
    const daily = [day("2026-09-03", 60), day("2026-09-10", 60), day("2026-09-18", 60)];
    render(<MonthTiles daily={daily} month={SEPTEMBER} todayKey="2026-09-20" />);

    expect(screen.getByText("3일")).toBeInTheDocument();
    expect(screen.getByText("20일 중 15%")).toBeInTheDocument();
  });

  it("과거 달은 말일을 분모로 삼는다", () => {
    // 9월(30일)을 10월 시점에서 보면 분모 30. 15일 공부 → 50%
    const daily = Array.from({ length: 15 }, (_, i) =>
      day(`2026-09-${String(i + 1).padStart(2, "0")}`, 60),
    );
    render(<MonthTiles daily={daily} month={SEPTEMBER} todayKey="2026-10-05" />);

    expect(screen.getByText("15일")).toBeInTheDocument();
    expect(screen.getByText("30일 중 50%")).toBeInTheDocument();
  });

  it("경과일이 0이면 0%로 방어한다", () => {
    // 미래 달(11월)을 9월 시점에서 보면 경과일 0
    render(<MonthTiles daily={[]} month={{ year: 2026, month: 11 }} todayKey="2026-09-20" />);

    expect(screen.getByText("0일")).toBeInTheDocument();
    expect(screen.getByText("0일 중 0%")).toBeInTheDocument();
  });
});
