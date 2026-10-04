import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WeekTrendCard } from "../WeekTrendCard";

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
    expect(screen.getByText(/^\d+시간$/)).toHaveClass("text-state-distract");
  });

  it("과거 주는 완료형으로 말하고 한 주 전체끼리 견준 날짜를 적는다", () => {
    renderCard({ todayKey: "2026-09-30" });

    // 전체 22시간 vs 28시간 → 6시간 덜.
    expect(screen.getByText(/지난주보다/)).toHaveTextContent("지난주보다 6시간 덜 공부했어요");
    expect(
      screen.getByText("바로 앞 주(9월 7일 ~ 13일)와 한 주 전체끼리 비교했어요"),
    ).toBeInTheDocument();
  });

  it("지난주 기록이 없으면 비교하지 않고 이번 주 합계만 말한다", () => {
    renderCard({ compareDaily: EMPTY });

    expect(screen.getByText(/이번 주/, { selector: "p" })).toHaveTextContent(
      "이번 주 22시간 공부하는 중",
    );
    expect(screen.getByText("지난주 기록이 없어 비교하지 않아요")).toBeInTheDocument();
  });

  it("이번 주 기록이 없거나 둘 다 없으면 그 사실을 말한다", () => {
    const { unmount } = renderCard({ daily: EMPTY });
    expect(screen.getByText("이번 주 기록이 아직 없어요")).toBeInTheDocument();
    unmount();

    renderCard({ daily: EMPTY, compareDaily: EMPTY });
    expect(screen.getByText("아직 기록이 없어요")).toBeInTheDocument();
  });
});

describe("WeekTrendCard — 막대와 범례", () => {
  it("아직 오지 않은 요일은 지난주 막대만 남고, 8시간을 넘는 날은 상한에서 잘린다", () => {
    renderCard();

    expect(screen.getByTestId("trend-current-월")).toHaveStyle({ height: "75%" });
    // 금요일 10시간 → 8시간 상한(100%).
    expect(screen.getByTestId("trend-current-금")).toHaveStyle({ height: "100%" });
    expect(screen.queryByTestId("trend-current-토")).not.toBeInTheDocument();
    expect(screen.getByTestId("trend-prev-토")).toHaveStyle({ height: "100%" });
    // 0시간인 날은 막대를 그리지 않는다.
    expect(screen.queryByTestId("trend-prev-목")).not.toBeInTheDocument();
  });

  it("세로축 눈금은 0 · 2 · 4 · 6 · 8+이고, 값은 대체 텍스트로 읽힌다", () => {
    renderCard();

    const chart = screen.getByRole("img", { name: /요일별 순공시간/ });
    expect(chart).toHaveTextContent("8+6420");
    expect(chart).toHaveAccessibleName(/월 이번 주 6시간 지난주 5시간/);
  });

  it("범례는 이번 주 · 지난주이고, 과거 주에서는 오늘 기준 상대 호칭을 쓴다", () => {
    const { unmount } = renderCard();
    expect(screen.getByText("이번 주", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("지난주", { selector: "span" })).toBeInTheDocument();
    unmount();

    // 오늘 09-25(금) → 보는 주(09-14~20)는 지난주, 그 앞 주는 2주 전.
    renderCard({ todayKey: "2026-09-25" });
    expect(screen.getByText("지난주", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("2주 전")).toBeInTheDocument();
  });
});
