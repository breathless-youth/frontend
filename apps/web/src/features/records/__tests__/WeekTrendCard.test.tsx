import { fireEvent, render, screen } from "@testing-library/react";
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

  it("과거 주는 완료형으로 말하고, 보고 있는 주를 오늘에서 센 호칭으로 기준 삼아 적는다", () => {
    const { unmount } = renderCard({ todayKey: "2026-09-30" });

    // 전체 22시간 vs 28시간 → 6시간 덜.
    expect(screen.getByText(/지난주보다/)).toHaveTextContent("지난주보다 6시간 덜 공부했어요");
    // 오늘 09-30(수) → 보는 주(09-14~20)는 2주 전이다.
    expect(screen.getByText("2주 전을 기준으로 비교했어요")).toBeInTheDocument();
    unmount();

    // 지난주로 넘기면 `1주 전을 기준으로`다.
    renderCard({ todayKey: "2026-09-25" });
    expect(screen.getByText("1주 전을 기준으로 비교했어요")).toBeInTheDocument();
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
    expect(screen.getByText("지난주 막대만 보여드려요")).toBeInTheDocument();
    unmount();

    renderCard({ daily: EMPTY, compareDaily: EMPTY });
    expect(screen.getByText("아직 기록이 없어요")).toBeInTheDocument();
    expect(screen.getByText("집중을 시작하면 요일별로 쌓여요")).toBeInTheDocument();
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

  it("세로축 눈금은 단위를 붙여 0 · 2h · 4h · 6h · 8h+로 적고, 값은 요일 버튼의 이름으로 읽힌다", () => {
    renderCard();

    const chart = screen.getByRole("group", { name: "요일별 순공시간" });
    expect(chart).toHaveTextContent("8h+6h4h2h0");
    expect(
      screen.getByRole("button", { name: "월요일 이번 주 6시간 지난주 5시간" }),
    ).toBeInTheDocument();
  });

  it("요일을 누르면 그 요일의 실제 값이 말풍선으로 뜨고, 다시 누르거나 차트 밖을 누르면 닫힌다", () => {
    renderCard();
    const friday = screen.getByRole("button", { name: /^금요일/ });

    fireEvent.click(friday);
    // 막대는 8시간에서 잘리지만 말풍선은 원래 값(10시간)을 적는다.
    expect(screen.getByRole("status")).toHaveTextContent("금요일이번 주10시간지난주4시간");
    expect(friday).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^월요일/ })).toHaveClass("opacity-35");

    fireEvent.click(friday);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^화요일/ }));
    expect(screen.getByRole("status")).toHaveTextContent("화요일");
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("아직 오지 않은 요일의 말풍선에는 지난주 값만 있다", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "토요일 지난주 8시간" }));
    expect(screen.getByRole("status")).toHaveTextContent("토요일지난주8시간");
    expect(screen.getByRole("status")).not.toHaveTextContent("이번 주");
  });

  it("범례는 이번 주 · 지난주이고, 과거 주에서는 오늘에서 센 N주 전으로 부른다", () => {
    const { unmount } = renderCard();
    expect(screen.getByText("이번 주", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("지난주", { selector: "span" })).toBeInTheDocument();
    unmount();

    // 오늘 09-25(금) → 보는 주(09-14~20)는 1주 전, 그 앞 주는 2주 전.
    renderCard({ todayKey: "2026-09-25" });
    expect(screen.getByText("1주 전")).toBeInTheDocument();
    expect(screen.getByText("2주 전")).toBeInTheDocument();
    expect(screen.queryByText("지난주", { selector: "span" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "월요일 1주 전 6시간 2주 전 5시간" }),
    ).toBeInTheDocument();
  });

  it("보는 주의 하루 평균을 점선과 범례로 보여주고, 공부한 날이 없으면 선을 바닥에 두고 0분으로 적는다", () => {
    const { unmount } = renderCard();
    // 공부한 4일의 합계 22시간 → 하루 평균 5시간 30분(8시간 눈금의 68.75%).
    expect(screen.getByTestId("trend-average-line")).toHaveStyle({ bottom: "68.75%" });
    expect(screen.getByText("하루 평균")).toHaveTextContent("하루 평균5시간 30분");
    unmount();

    renderCard({ daily: EMPTY });
    expect(screen.queryByTestId("trend-average-line")).not.toBeInTheDocument();
    expect(screen.getByText("하루 평균")).toHaveTextContent("하루 평균0분");
  });

  it("세로축 상한은 그 주의 값에 맞춰 줄어들어 짧은 공부도 납작하게 깔리지 않는다", () => {
    const short = (dates: typeof THIS_WEEK, minutes: number[]) =>
      dates.map((stat, index) => ({
        ...stat,
        studySec: minutes[index]! * 60,
        focusSec: minutes[index]! * 60,
      }));
    const { unmount } = renderCard({
      // 두 주 모두 하루 최대 1시간 30분 → 상한 2시간(눈금 2 · 1.5 · 1 · 0.5 · 0).
      daily: short(THIS_WEEK, [90, 60, 30, 0, 45, 0, 0]),
      compareDaily: short(LAST_WEEK, [60, 60, 60, 0, 30, 0, 0]),
    });
    expect(screen.getByTestId("trend-current-월")).toHaveStyle({ height: "75%" });
    expect(screen.getByText("1.5h")).toBeInTheDocument();
    expect(screen.queryByText("8h+")).not.toBeInTheDocument();
    unmount();

    // 하루 최대 3시간 → 상한 4시간.
    renderCard({
      daily: short(THIS_WEEK, [180, 60, 30, 0, 45, 0, 0]),
      compareDaily: short(LAST_WEEK, [60, 60, 60, 0, 30, 0, 0]),
    });
    expect(screen.getByTestId("trend-current-월")).toHaveStyle({ height: "75%" });
    expect(screen.getByText("3h")).toBeInTheDocument();
  });

  it("진행 중인 주에서만 오늘 요일 라벨을 굵게 적는다", () => {
    const { unmount } = renderCard();
    expect(screen.getByText("금")).toHaveClass("font-bold", "text-foreground");
    expect(screen.getByText("목")).toHaveClass("text-muted-foreground");
    unmount();

    // 과거 주를 보면 오늘과 같은 요일이라도 강조하지 않는다.
    renderCard({ todayKey: "2026-09-25" });
    expect(screen.getByText("금")).toHaveClass("text-muted-foreground");
    expect(screen.getByText("금")).not.toHaveClass("font-bold");
  });
});
