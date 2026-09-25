import type { ReactElement } from "react";
import { cloneElement } from "react";
import type * as Recharts from "recharts";
import type { DailyStudyStat } from "@focusmakers/types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WeekTrendChart } from "../WeekTrendChart";

// recharts의 ResponsiveContainer는 jsdom에서 폭·높이를 0으로 재서 SVG를 그리지 않는다.
// 자식 차트에 고정 크기를 넣어 축·선이 실제로 렌더되게 한다(픽셀 좌표는 단언하지 않는다).
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof Recharts>();
  return {
    ...actual,
    ResponsiveContainer: ({
      children,
    }: {
      children: ReactElement<{ width?: number; height?: number }>;
    }) => cloneElement(children, { width: 800, height: 400 }),
  };
});

// 2026-09-14(월)~20(일) 주. 요일 인덱스 매핑 확인용으로 순서를 일부러 섞어 넣는다.
const thisWeek: DailyStudyStat[] = [
  { date: "2026-09-16", studySec: 0, focusSec: 3 * 3600 }, // 수
  { date: "2026-09-14", studySec: 0, focusSec: 2 * 3600 }, // 월
  { date: "2026-09-18", studySec: 0, focusSec: 4 * 3600 }, // 금 (끝점)
];
const lastWeek: DailyStudyStat[] = [
  { date: "2026-09-07", studySec: 0, focusSec: 3600 }, // 월
  { date: "2026-09-09", studySec: 0, focusSec: 2 * 3600 }, // 수
];

// 이번 주 마지막 날(일) — 위 fixture의 이번 주 날짜가 전부 과거라 필터 없이 다 그려진다.
const SUNDAY = "2026-09-20";

describe("WeekTrendChart", () => {
  it("이번 주·지난주 두 선을 그린다", () => {
    const { container } = render(
      <WeekTrendChart
        daily={thisWeek}
        compareDaily={lastWeek}
        todayKey={SUNDAY}
        todayIndex={null}
      />,
    );

    // 두 Area의 선(stroke) path 두 개.
    expect(container.querySelectorAll(".recharts-area-curve")).toHaveLength(2);
    // 범례 라벨 두 개.
    expect(screen.getByText("이번 주")).toBeInTheDocument();
    expect(screen.getByText("지난주")).toBeInTheDocument();
  });

  it("툴팁을 마운트한다 — 호버 상세용 Tooltip 래퍼가 크래시 없이 렌더된다", () => {
    // recharts 툴팁 내용은 호버 시에만 뜨므로 jsdom에선 값 검증이 어렵다.
    // 여기서는 Tooltip이 차트에 붙어 래퍼가 렌더되고 크래시가 없는지만 확인한다.
    const { container } = render(
      <WeekTrendChart
        daily={thisWeek}
        compareDaily={lastWeek}
        todayKey={SUNDAY}
        todayIndex={null}
      />,
    );

    expect(container.querySelector(".recharts-tooltip-wrapper")).not.toBeNull();
  });

  it("범례는 겹침(Area) 순서와 무관하게 이번 주 → 지난주 순서로 나온다", () => {
    const { container } = render(
      <WeekTrendChart
        daily={thisWeek}
        compareDaily={lastWeek}
        todayKey={SUNDAY}
        todayIndex={null}
      />,
    );

    // Area는 지난주를 먼저 그리지만(겹침), 범례는 chartConfig 순서로 이번 주가 먼저다.
    const legend = container.querySelector(".recharts-legend-wrapper");
    expect(legend).not.toBeNull();
    const text = legend?.textContent ?? "";
    expect(text.indexOf("이번 주")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("이번 주")).toBeLessThan(text.indexOf("지난주"));
  });

  it("x축에 월~일 요일 라벨 7개를 그린다", () => {
    render(
      <WeekTrendChart
        daily={thisWeek}
        compareDaily={lastWeek}
        todayKey={SUNDAY}
        todayIndex={null}
      />,
    );

    for (const label of ["월", "화", "수", "목", "금", "토", "일"]) {
      // XAxis 눈금과 sr-only 표 양쪽에 요일이 있으므로 getAllByText로 존재만 확인한다.
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("12시간 초과 눈금은 12+로 적는다", () => {
    render(
      <WeekTrendChart
        daily={[{ date: "2026-09-14", studySec: 0, focusSec: 20 * 3600 }]}
        compareDaily={[]}
        todayKey={SUNDAY}
        todayIndex={null}
      />,
    );

    expect(screen.getByText("12+")).toBeInTheDocument();
  });

  it("빈 배열이어도 축을 그리고 크래시하지 않는다", () => {
    render(<WeekTrendChart daily={[]} compareDaily={[]} todayKey={SUNDAY} todayIndex={null} />);

    for (const label of ["월", "화", "수", "목", "금", "토", "일"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("실제 API처럼 7일을 0으로 채운 이번 주에서 오늘 이후 요일은 선에서 빠진다", () => {
    // 2026-09-14~20 주, 오늘은 수(09-16). 목~일은 서버가 0으로 채워 내려온다.
    const fullWeekZeroFilled: DailyStudyStat[] = [
      { date: "2026-09-14", studySec: 0, focusSec: 2 * 3600 },
      { date: "2026-09-15", studySec: 0, focusSec: 3600 },
      { date: "2026-09-16", studySec: 0, focusSec: 3 * 3600 },
      { date: "2026-09-17", studySec: 0, focusSec: 0 },
      { date: "2026-09-18", studySec: 0, focusSec: 0 },
      { date: "2026-09-19", studySec: 0, focusSec: 0 },
      { date: "2026-09-20", studySec: 0, focusSec: 0 },
    ];
    render(
      <WeekTrendChart
        daily={fullWeekZeroFilled}
        compareDaily={[]}
        todayKey="2026-09-16"
        todayIndex={2}
      />,
    );

    // sr-only 표에서 목~일은 "기록 없음"이고 월~수만 값이 있다.
    expect(screen.getAllByText("기록 없음").length).toBe(4 + 7); // 이번주 목~일 4 + 지난주 7일 전부
    expect(screen.getByText("2시간")).toBeInTheDocument();
    expect(screen.getByText("3시간")).toBeInTheDocument();
  });

  it("라인차트 접근성 — role=img·aria-label과 요일별 sr-only 요약을 제공한다", () => {
    render(
      <WeekTrendChart
        daily={thisWeek}
        compareDaily={lastWeek}
        todayKey={SUNDAY}
        todayIndex={null}
      />,
    );

    expect(
      screen.getByRole("img", { name: "이번 주와 지난주 요일별 순공시간 추이" }),
    ).toBeInTheDocument();
    // 두 선 모두 실선이라(시안), 색상 외 단서는 요일별 sr-only 표가 제공한다.
    expect(screen.getByText("요일별 순공시간 (이번 주 · 지난주)")).toBeInTheDocument();
  });

  it("지난주 선은 점선이 아니라 실선이다(시안 반영)", () => {
    const { container } = render(
      <WeekTrendChart
        daily={thisWeek}
        compareDaily={lastWeek}
        todayKey={SUNDAY}
        todayIndex={null}
      />,
    );

    // 두 Area의 선이 모두 그려지되 어느 선에도 점선(strokeDasharray="4 4")이 남아 있지 않다.
    expect(container.querySelectorAll(".recharts-area-curve")).toHaveLength(2);
    expect(container.querySelector('.recharts-area-curve[stroke-dasharray="4 4"]')).toBeNull();
  });

  it("선 아래에 그라데이션 채움(Area)을 그린다 — 두 선 각각의 fill 영역", () => {
    const { container } = render(
      <WeekTrendChart
        daily={thisWeek}
        compareDaily={lastWeek}
        todayKey={SUNDAY}
        todayIndex={null}
      />,
    );

    // 각 Area의 채움 path(.recharts-area-area) 두 개와 그라데이션 defs가 있다.
    expect(container.querySelectorAll(".recharts-area-area")).toHaveLength(2);
    expect(container.querySelector("#weekTrendThisWeekFill")).not.toBeNull();
    expect(container.querySelector("#weekTrendLastWeekFill")).not.toBeNull();
  });

  it("오늘이 이 주에 있으면 오늘 요일에만 끝점 도트(파랑 테두리)를 하나 찍는다", () => {
    // 2026-09-14~20 주, 오늘은 수(09-16, 월=0 기준 index 2). 값이 있는 오늘에 도트가 찍힌다.
    const currentWeek: DailyStudyStat[] = [
      { date: "2026-09-14", studySec: 0, focusSec: 2 * 3600 },
      { date: "2026-09-15", studySec: 0, focusSec: 3600 },
      { date: "2026-09-16", studySec: 0, focusSec: 3 * 3600 },
    ];
    const { container } = render(
      <WeekTrendChart daily={currentWeek} compareDaily={[]} todayKey="2026-09-16" todayIndex={2} />,
    );

    expect(container.querySelectorAll('circle[stroke="var(--color-thisWeek)"]')).toHaveLength(1);
  });

  it("과거 주(오늘이 이 주에 없음, todayIndex=null)면 끝점 도트를 찍지 않는다", () => {
    // 값이 있는 마지막 지점(금요일)이 있어도 오늘이 이 주에 없으면 도트가 없다.
    const { container } = render(
      <WeekTrendChart
        daily={thisWeek}
        compareDaily={lastWeek}
        todayKey={SUNDAY}
        todayIndex={null}
      />,
    );

    expect(container.querySelectorAll('circle[stroke="var(--color-thisWeek)"]')).toHaveLength(0);
  });
});
