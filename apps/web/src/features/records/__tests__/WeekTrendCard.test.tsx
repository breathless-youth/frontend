import type { ReactElement } from "react";
import { cloneElement } from "react";
import type * as Recharts from "recharts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WeekTrendCard } from "../WeekTrendCard";

// recharts의 ResponsiveContainer는 jsdom에서 폭·높이를 0으로 재서 SVG를 그리지 않는다.
// 자식 차트에 고정 크기를 넣어 축·막대가 실제로 그려지게 한다.
const CHART_WIDTH = 800;
const CHART_HEIGHT = 400;
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

/** 플롯 영역 — 위 여백 6, 아래 요일 축 20, 왼쪽 눈금 폭 32를 뺀 자리다. */
const PLOT_TOP = 6;
const PLOT_HEIGHT = CHART_HEIGHT - PLOT_TOP - 20;
const PLOT_LEFT = 32;
const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

/** 그 주 막대의 높이를 플롯 높이에 대한 비율로 읽는다. 그리지 않은 요일은 `null`. */
function barRatios(container: HTMLElement, series: "prev" | "current"): (number | null)[] {
  return [...container.querySelectorAll(`.trend-${series} .recharts-bar-rectangle`)].map((bar) => {
    const height = bar.querySelector("path")?.getAttribute("height");
    return height == null ? null : Number(height) / PLOT_HEIGHT;
  });
}

/** 요일 칸의 가운데를 누른다(차트는 플롯을 7등분한 자리로 요일을 가린다). */
function tapDay(container: HTMLElement, dayLabel: string) {
  const band = (CHART_WIDTH - PLOT_LEFT) / 7;
  fireEvent.click(container.querySelector(".recharts-wrapper")!, {
    clientX: PLOT_LEFT + band * (DAYS.indexOf(dayLabel) + 0.5),
    clientY: 100,
  });
}

/** 가로축의 요일 라벨 — 같은 글자가 표에도 있어 축에서만 찾는다. */
const dayTick = (container: HTMLElement, dayLabel: string) =>
  [...container.querySelectorAll(".recharts-xAxis text")].find(
    (tick) => tick.textContent === dayLabel,
  );

const yTicks = (container: HTMLElement) =>
  [...container.querySelectorAll(".recharts-yAxis .recharts-cartesian-axis-tick")].map(
    (tick) => tick.textContent,
  );

const tooltipText = (container: HTMLElement) =>
  container.querySelector(".recharts-tooltip-wrapper")?.textContent ?? "";

const day = (date: string, focusSec: number) => ({ date, studySec: focusSec, focusSec });
const H = 3600;

// 보는 주 2026-09-14(월)~20(일), 오늘 09-18(금). 서버는 7일을 0으로 채워 준다.
const THIS_WEEK = [
  day("2026-09-14", 6 * H),
  day("2026-09-15", 4 * H),
  day("2026-09-16", 2 * H),
  day("2026-09-17", 0),
  day("2026-09-18", 10 * H),
  day("2026-09-19", 0),
  day("2026-09-20", 0),
];
const LAST_WEEK = [
  day("2026-09-07", 5 * H),
  day("2026-09-08", 5 * H),
  day("2026-09-09", 5 * H),
  day("2026-09-10", 0),
  day("2026-09-11", 4 * H),
  day("2026-09-12", 8 * H),
  day("2026-09-13", H),
];
const EMPTY = THIS_WEEK.map((stat) => ({ ...stat, studySec: 0, focusSec: 0 }));

function renderCard(props: Partial<Parameters<typeof WeekTrendCard>[0]> = {}) {
  return render(
    <WeekTrendCard
      daily={THIS_WEEK}
      compareDaily={LAST_WEEK}
      weekAnchorKey="2026-09-18"
      todayKey="2026-09-18"
      {...props}
    />,
  );
}

describe("WeekTrendCard — 비교 문장", () => {
  it("진행 중인 주는 같은 요일까지끼리 견줘 더 공부하는 중이라고 말한다", () => {
    renderCard();

    // 이번 주 월~금 22시간, 지난주 월~금 19시간 → 3시간 더.
    expect(screen.getByText("3시간")).toHaveClass("text-primary");
    expect(screen.getByText(/지난주보다/)).toHaveTextContent("지난주보다 3시간 더 공부하는 중");
    expect(screen.getByText("지난주 금요일까지와 비교했어요")).toBeInTheDocument();
  });

  it("덜 공부했으면 델타를 비집중 주황으로 칠하고 덜 공부하는 중이라고 말한다", () => {
    renderCard({
      daily: LAST_WEEK.map((stat, index) => ({
        ...THIS_WEEK[index]!,
        focusSec: Math.max(0, stat.focusSec - H),
      })),
    });

    expect(screen.getByText(/지난주보다/)).toHaveTextContent(/덜 공부하는 중$/);
    expect(within(screen.getByText(/지난주보다/)).getByText(/^\d+시간$/)).toHaveClass(
      "text-state-distract",
    );
  });

  it("과거 주는 완료형으로 말하고, 견준 두 주를 오늘에서 센 호칭으로 적는다", () => {
    const { unmount } = renderCard({ todayKey: "2026-09-30" });

    // 전체 22시간 vs 28시간 → 6시간 덜.
    expect(screen.getByText(/지난주보다/)).toHaveTextContent("지난주보다 6시간 덜 공부했어요");
    // 오늘 09-30(수) → 보는 주(09-14~20)는 2주 전, 그 앞 주는 3주 전이다.
    expect(screen.getByText("2주 전과 3주 전을 비교했어요")).toBeInTheDocument();
    unmount();

    // 지난주로 넘기면 `1주 전과 2주 전을`이다.
    renderCard({ todayKey: "2026-09-25" });
    expect(screen.getByText("1주 전과 2주 전을 비교했어요")).toBeInTheDocument();
  });

  it("지난주 기록이 없으면 비교하지 않고 이번 주 합계만 말한다", () => {
    const { unmount } = renderCard({ compareDaily: EMPTY });

    expect(screen.getByText(/공부하는 중$/, { selector: "p" })).toHaveTextContent(
      "이번 주 22시간 공부하는 중",
    );
    expect(screen.getByText("지난주 기록이 없어 이번 주 기록만 표시했어요")).toBeInTheDocument();
    unmount();

    // 과거 주도 두 주를 호칭으로 부른다.
    renderCard({ compareDaily: EMPTY, todayKey: "2026-09-25" });
    expect(screen.getByText("2주 전 기록이 없어 1주 전 기록만 표시했어요")).toBeInTheDocument();
  });

  it("이번 주 기록이 없거나 둘 다 없으면 그 사실을 말한다", () => {
    const { unmount } = renderCard({ daily: EMPTY });
    expect(screen.getByText("이번 주 기록이 아직 없어요")).toBeInTheDocument();
    expect(screen.getByText("지난주 기록만 표시했어요")).toBeInTheDocument();
    unmount();

    renderCard({ daily: EMPTY, compareDaily: EMPTY });
    expect(screen.getByText("아직 기록이 없어요")).toBeInTheDocument();
    expect(screen.getByText("공부를 시작하고 패턴을 확인해보세요")).toBeInTheDocument();
  });
});

describe("WeekTrendCard — 막대와 범례", () => {
  it("아직 오지 않은 요일은 지난주 막대만 남고, 8시간을 넘는 날은 상한에서 잘린다", () => {
    const { container } = renderCard();

    // 금요일 10시간 → 8시간 상한(1). 토·일은 아직 오지 않았고, 0시간인 목요일은 막대를 그리지 않는다.
    expect(barRatios(container, "current")).toEqual([0.75, 0.5, 0.25, null, 1, null, null]);
    expect(barRatios(container, "prev")).toEqual([0.625, 0.625, 0.625, null, 0.5, 1, 0.125]);
  });

  it("세로축 눈금은 단위를 붙여 0 · 2h · 4h · 6h · 8h+로 적고, 값은 표로도 읽힌다", () => {
    const { container } = renderCard();

    expect(yTicks(container)).toEqual(["0", "2h", "4h", "6h", "8h+"]);
    const table = screen.getByRole("table", { name: "요일별 순공시간" });
    expect(within(table).getByRole("row", { name: "월 6시간 5시간" })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: "토 기록 없음 8시간" })).toBeInTheDocument();
  });

  it("요일을 누르면 그 요일의 실제 값이 말풍선으로 뜨고, 다시 누르거나 차트 밖을 누르면 닫힌다", () => {
    const { container } = renderCard();

    tapDay(container, "금");
    // 막대는 8시간에서 잘리지만 말풍선은 원래 값(10시간)을 적는다. 보는 주가 먼저다.
    expect(tooltipText(container)).toBe("금요일이번 주10시간지난주4시간");
    expect(dayTick(container, "금")).toHaveAttribute("data-emphasis", "picked");
    // 누르지 않은 요일의 막대는 흐려진다(목요일은 막대가 없다).
    const opacities = [...container.querySelectorAll(".trend-prev path")].map((bar) =>
      bar.getAttribute("fill-opacity"),
    );
    expect(opacities).toEqual(["0.35", "0.35", "0.35", "1", "0.35", "0.35"]);

    tapDay(container, "금");
    expect(tooltipText(container)).toBe("");

    tapDay(container, "화");
    expect(tooltipText(container)).toContain("화요일");
    fireEvent.pointerDown(document.body);
    expect(tooltipText(container)).toBe("");
  });

  it("아직 오지 않은 요일의 말풍선에는 지난주 값만 있다", () => {
    const { container } = renderCard();

    tapDay(container, "토");
    expect(tooltipText(container)).toBe("토요일지난주8시간");
  });

  it("범례는 이번 주 · 지난주이고, 과거 주에서는 오늘에서 센 N주 전으로 부른다", () => {
    const { unmount } = renderCard();
    expect(screen.getByText("이번 주", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("지난주", { selector: "span" })).toBeInTheDocument();
    unmount();

    // 오늘 09-25(금) → 보는 주(09-14~20)는 1주 전, 그 앞 주는 2주 전.
    renderCard({ todayKey: "2026-09-25" });
    expect(screen.getByText("1주 전", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("2주 전", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByText("지난주", { selector: "span" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "1주 전" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "2주 전" })).toBeInTheDocument();
  });

  it("보는 주의 하루 평균을 점선과 범례로 보여주고, 공부한 날이 없으면 선을 바닥에 두고 0분으로 적는다", () => {
    const averageRatio = (container: HTMLElement) => {
      const y = Number(
        container.querySelector(".recharts-reference-line-line")?.getAttribute("y1"),
      );
      return 1 - (y - PLOT_TOP) / PLOT_HEIGHT;
    };
    const { container, unmount } = renderCard();
    // 공부한 4일의 합계 22시간 → 하루 평균 5시간 30분(8시간 눈금의 68.75%).
    expect(averageRatio(container)).toBeCloseTo(0.6875);
    expect(screen.getByText("하루 평균")).toHaveTextContent("하루 평균5시간 30분");
    unmount();

    const empty = renderCard({ daily: EMPTY });
    expect(averageRatio(empty.container)).toBeCloseTo(0);
    expect(screen.getByText("하루 평균")).toHaveTextContent("하루 평균0분");
  });

  it("세로축 상한은 그 주의 값에 맞춰 줄어들어 짧은 공부도 납작하게 깔리지 않는다", () => {
    const short = (dates: typeof THIS_WEEK, minutes: number[]) =>
      dates.map((stat, index) => ({
        ...stat,
        studySec: minutes[index]! * 60,
        focusSec: minutes[index]! * 60,
      }));
    const first = renderCard({
      // 두 주 모두 하루 최대 1시간 30분 → 상한 2시간(눈금 2 · 1.5 · 1 · 0.5 · 0).
      daily: short(THIS_WEEK, [90, 60, 30, 0, 45, 0, 0]),
      compareDaily: short(LAST_WEEK, [60, 60, 60, 0, 30, 0, 0]),
    });
    expect(barRatios(first.container, "current")[0]).toBe(0.75);
    expect(yTicks(first.container)).toEqual(["0", "0.5h", "1h", "1.5h", "2h"]);
    first.unmount();

    // 하루 최대 3시간 → 상한 4시간.
    const second = renderCard({
      daily: short(THIS_WEEK, [180, 60, 30, 0, 45, 0, 0]),
      compareDaily: short(LAST_WEEK, [60, 60, 60, 0, 30, 0, 0]),
    });
    expect(barRatios(second.container, "current")[0]).toBe(0.75);
    expect(yTicks(second.container)).toEqual(["0", "1h", "2h", "3h", "4h"]);
  });

  it("한 주가 통째로 비면 그 주의 막대 자리를 잡지 않는다", () => {
    const { container } = renderCard({ compareDaily: EMPTY });

    expect(container.querySelector(".trend-prev")).toBeNull();
    expect(barRatios(container, "current")).toHaveLength(7);
  });

  it("진행 중인 주에서만 오늘 요일 라벨을 굵게 적는다", () => {
    const { container, unmount } = renderCard();
    expect(dayTick(container, "금")).toHaveAttribute("data-emphasis", "today");
    expect(dayTick(container, "목")).not.toHaveAttribute("data-emphasis");
    unmount();

    // 과거 주를 보면 오늘과 같은 요일이라도 강조하지 않는다.
    const past = renderCard({ todayKey: "2026-09-25" });
    expect(dayTick(past.container, "금")).not.toHaveAttribute("data-emphasis");
  });
});
