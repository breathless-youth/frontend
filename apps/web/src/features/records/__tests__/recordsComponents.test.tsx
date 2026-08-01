import type {
  StudySessionEventCounts,
  StudySessionListResponse,
  StudySessionSummary,
} from "@focusmakers/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EventChip } from "../EventChip";
import { MonthCalendar } from "../MonthCalendar";
import { SessionListItem } from "../SessionListItem";
import { StreakBanner, type StreakWeekDay } from "../StreakBanner";
import { SummaryTiles } from "../SummaryTiles";

/**
 * S5 기록 컴포넌트 웹 이식 테스트 (BY-330).
 *
 * RN 원본 `apps/mobile/components/records/`에는 이 5개 컴포넌트 전용 `__tests__`가 없다
 * (원본 `__tests__/useRecordsData.test.tsx`는 데이터 훅 테스트라 별개 — Task 3 범위).
 * 그래서 각 컴포넌트가 지닌 표기·접근성·인터랙션 규칙(주석에 적힌 것들)을 새로 커버한다.
 */

const EMPTY_EVENT_COUNTS: StudySessionEventCounts = { PHONE: 0, DEVICE: 0, AWAY: 0, PAUSE: 0 };

function session(overrides: Partial<StudySessionSummary> = {}): StudySessionSummary {
  return {
    id: 1,
    statDate: "2026-07-26",
    startedAt: "2026-07-26T00:10:00.000Z",
    endedAt: "2026-07-26T01:40:00.000Z",
    studySec: 5400,
    focusSec: 4800,
    focusRate: 76.4,
    eventCounts: EMPTY_EVENT_COUNTS,
    ...overrides,
  };
}

describe("EventChip", () => {
  it("비집중 상태는 오렌지 도트·텍스트 토큰을 쓴다", () => {
    const { container } = render(<EventChip status="AWAY" label="자리 이탈 2회" />);

    expect(screen.getByText("자리 이탈 2회")).toBeInTheDocument();
    expect(container.querySelector(".bg-state-distract-subtle")).toBeInTheDocument();
    expect(container.querySelector(".bg-state-distract")).toBeInTheDocument();
    expect(container.querySelector(".text-state-distract-text")).toBeInTheDocument();
  });

  it("일시정지 상태는 회색 톤 토큰을 쓴다(오렌지 토큰과 섞이지 않는다)", () => {
    const { container } = render(<EventChip status="PAUSE" label="일시정지 1회" />);

    expect(screen.getByText("일시정지 1회")).toBeInTheDocument();
    expect(container.querySelector(".bg-bg-layer-2")).toBeInTheDocument();
    expect(container.querySelector(".bg-state-distract-subtle")).not.toBeInTheDocument();
  });
});

describe("MonthCalendar", () => {
  const month = { year: 2026, month: 7 };
  const todayKey = "2026-07-26";

  it("월 라벨·요일 헤더를 렌더한다", () => {
    render(
      <MonthCalendar
        month={month}
        todayKey={todayKey}
        selectedKey={todayKey}
        studiedDates={[]}
        onSelectDate={vi.fn()}
        onPrevMonth={vi.fn()}
        onNextMonth={vi.fn()}
      />,
    );

    expect(screen.getByText("2026년 7월")).toBeInTheDocument();
    expect(screen.getByText("일")).toBeInTheDocument();
    expect(screen.getByText("토")).toBeInTheDocument();
  });

  it("이전/다음 달 버튼이 각각 핸들러를 호출한다", () => {
    const onPrevMonth = vi.fn();
    const onNextMonth = vi.fn();
    render(
      <MonthCalendar
        month={month}
        todayKey={todayKey}
        selectedKey={todayKey}
        studiedDates={[]}
        onSelectDate={vi.fn()}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "이전 달" }));
    fireEvent.click(screen.getByRole("button", { name: "다음 달" }));

    expect(onPrevMonth).toHaveBeenCalledTimes(1);
    expect(onNextMonth).toHaveBeenCalledTimes(1);
  });

  it("과거 날짜를 클릭하면 onSelectDate가 그 날짜 키로 호출된다", () => {
    const onSelectDate = vi.fn();
    render(
      <MonthCalendar
        month={month}
        todayKey={todayKey}
        selectedKey={todayKey}
        studiedDates={[]}
        onSelectDate={onSelectDate}
        onPrevMonth={vi.fn()}
        onNextMonth={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "10일, 기록 없음" }));

    expect(onSelectDate).toHaveBeenCalledWith("2026-07-10");
  });

  it("미래 날짜는 비활성(disabled)이고 클릭해도 onSelectDate가 호출되지 않는다", () => {
    const onSelectDate = vi.fn();
    render(
      <MonthCalendar
        month={month}
        todayKey={todayKey}
        selectedKey={todayKey}
        studiedDates={[]}
        onSelectDate={onSelectDate}
        onPrevMonth={vi.fn()}
        onNextMonth={vi.fn()}
      />,
    );

    const futureCell = screen.getByRole("button", { name: "31일, 기록 없음" });
    expect(futureCell).toBeDisabled();

    fireEvent.click(futureCell);
    expect(onSelectDate).not.toHaveBeenCalled();
  });

  it("studiedDates에 있는 날짜는 '기록 있음' 라벨과 도트를 갖는다", () => {
    render(
      <MonthCalendar
        month={month}
        todayKey={todayKey}
        selectedKey={todayKey}
        studiedDates={["2026-07-10"]}
        onSelectDate={vi.fn()}
        onPrevMonth={vi.fn()}
        onNextMonth={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "10일, 기록 있음" })).toBeInTheDocument();
  });

  it("선택일 셀은 aria-pressed=true다", () => {
    render(
      <MonthCalendar
        month={month}
        todayKey={todayKey}
        selectedKey="2026-07-10"
        studiedDates={[]}
        onSelectDate={vi.fn()}
        onPrevMonth={vi.fn()}
        onNextMonth={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "10일, 기록 없음" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "26일, 기록 없음" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("SessionListItem", () => {
  it("공부 시간·시간 범위·집중률을 렌더한다", () => {
    render(<SessionListItem session={session()} />);

    expect(screen.getByText("1시간 20분")).toBeInTheDocument();
    expect(screen.getByText("09:10 – 10:40 · 총 1시간 30분")).toBeInTheDocument();
    expect(screen.getByText("집중률")).toBeInTheDocument();
    expect(screen.getByText("76%")).toBeInTheDocument();
  });

  it("이벤트 카운트가 0인 상태는 칩을 그리지 않고, 0보다 큰 상태만 칩으로 렌더한다", () => {
    render(
      <SessionListItem
        session={session({ eventCounts: { PHONE: 2, DEVICE: 0, AWAY: 1, PAUSE: 0 } })}
      />,
    );

    expect(screen.getByText("자리 이탈 1회")).toBeInTheDocument();
    expect(screen.getByText("휴대폰 2회")).toBeInTheDocument();
    expect(screen.queryByText(/기기 조작/)).not.toBeInTheDocument();
    expect(screen.queryByText(/일시정지/)).not.toBeInTheDocument();
  });

  it("모든 이벤트가 0회면 칩 영역 자체가 없다", () => {
    const { container } = render(<SessionListItem session={session()} />);

    expect(container.querySelector(".flex-wrap")).not.toBeInTheDocument();
  });
});

describe("StreakBanner", () => {
  const days: StreakWeekDay[] = [
    { dateKey: "2026-07-19", weekdayLabel: "일", dayOfMonth: 19, state: "done" },
    { dateKey: "2026-07-20", weekdayLabel: "월", dayOfMonth: 20, state: "none" },
    { dateKey: "2026-07-21", weekdayLabel: "화", dayOfMonth: 21, state: "today" },
  ];

  it("연속일 문구를 렌더한다", () => {
    render(<StreakBanner streakDays={3} days={days} />);

    expect(screen.getByText("3일 연속 공부 중")).toBeInTheDocument();
    expect(screen.getByText("내일도 10분만 하면 이어져요")).toBeInTheDocument();
  });

  it("요일 도트는 상태별로 다른 접근성 라벨을 갖는다", () => {
    render(<StreakBanner streakDays={3} days={days} />);

    expect(screen.getByRole("img", { name: "일요일, 공부함" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "월요일, 기록 없음" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "화요일, 오늘" })).toBeInTheDocument();
  });
});

describe("SummaryTiles", () => {
  function stats(overrides: Partial<StudySessionListResponse> = {}): StudySessionListResponse {
    return {
      sessions: [],
      sessionCount: 3,
      totalStudySec: 7200,
      totalFocusSec: 5400,
      longestFocusSec: 3600,
      focusRate: 75,
      totalEventCounts: EMPTY_EVENT_COUNTS,
      studiedDatesInMonth: [],
      ...overrides,
    };
  }

  it("4개 타일에 라벨과 표기값을 렌더한다", () => {
    render(<SummaryTiles stats={stats()} />);

    expect(screen.getByText("순공시간")).toBeInTheDocument();
    expect(screen.getByText("1시간 30분")).toBeInTheDocument();
    expect(screen.getByText("총 공부 시간")).toBeInTheDocument();
    expect(screen.getByText("2시간")).toBeInTheDocument();
    expect(screen.getByText("집중률")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("공부 횟수")).toBeInTheDocument();
    expect(screen.getByText("3회")).toBeInTheDocument();
  });

  it("기록이 없는 날은 0값 표기를 그대로 노출한다(숨기지 않는다)", () => {
    render(
      <SummaryTiles
        stats={stats({ totalStudySec: 0, totalFocusSec: 0, focusRate: 0, sessionCount: 0 })}
      />,
    );

    expect(screen.getAllByText("0분")).toHaveLength(2);
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("0회")).toBeInTheDocument();
  });
});
