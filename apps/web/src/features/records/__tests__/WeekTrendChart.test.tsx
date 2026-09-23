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

describe("WeekTrendChart", () => {
  it("이번 주·지난주 두 선을 그린다", () => {
    const { container } = render(<WeekTrendChart daily={thisWeek} compareDaily={lastWeek} />);

    expect(container.querySelectorAll(".recharts-line-curve")).toHaveLength(2);
    // 범례 라벨 두 개.
    expect(screen.getByText("이번 주")).toBeInTheDocument();
    expect(screen.getByText("지난주")).toBeInTheDocument();
  });

  it("x축에 월~일 요일 라벨 7개를 그린다", () => {
    render(<WeekTrendChart daily={thisWeek} compareDaily={lastWeek} />);

    for (const label of ["월", "화", "수", "목", "금", "토", "일"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("12시간 초과 눈금은 12+로 적는다", () => {
    render(
      <WeekTrendChart
        daily={[{ date: "2026-09-14", studySec: 0, focusSec: 20 * 3600 }]}
        compareDaily={[]}
      />,
    );

    expect(screen.getByText("12+")).toBeInTheDocument();
  });

  it("빈 배열이어도 축을 그리고 크래시하지 않는다", () => {
    render(<WeekTrendChart daily={[]} compareDaily={[]} />);

    for (const label of ["월", "화", "수", "목", "금", "토", "일"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
