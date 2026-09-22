import type { StudySessionEventCounts, StudySessionSummary } from "@focusmakers/types";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EventChip } from "../EventChip";
import { MonthCalendar } from "../MonthCalendar";
import { MonthSummary } from "../MonthSummary";
import { SegmentedControl } from "../SegmentedControl";
import { SessionListItem } from "../SessionListItem";
import { StreakBanner, type StreakWeekDay } from "../StreakBanner";

// jsdom에는 `PointerEvent` 구현이 없다 — 폴리필이 없으면 스와이프 판정에 쓰는
// `clientX`/`clientY`가 사라진다(`OnboardingGuidePage.test.tsx`와 같은 이유·같은 최소 폴리필).
if (typeof window.PointerEvent === "undefined") {
  window.PointerEvent = MouseEvent as unknown as typeof PointerEvent;
}

/**
 * S5 기록 컴포넌트 웹 이식 테스트 (BY-330).
 *
 * RN 원본 `apps/mobile/components/records/`에는 이 5개 컴포넌트 전용 `__tests__`가 없다
 * (원본 `__tests__/useRecordsData.test.tsx`는 데이터 훅 테스트라 별개 — Task 3 범위).
 * 그래서 각 컴포넌트가 지닌 표기·접근성·인터랙션 규칙(주석에 적힌 것들)을 새로 커버한다.
 */

const EMPTY_EVENT_COUNTS: StudySessionEventCounts = { PHONE: 0, DEVICE: 0, AWAY: 0, PAUSE: 0 };

// KST 07:30~08:16(2026-09-19), 순공 44분 · 집중 96% — v2 행 표기 고정값(계획 Task 6 Step 1).
function session(overrides: Partial<StudySessionSummary> = {}): StudySessionSummary {
  return {
    id: 1,
    statDate: "2026-09-19",
    startedAt: "2026-09-18T22:30:00Z",
    endedAt: "2026-09-18T23:16:00Z",
    studySec: 46 * 60,
    focusSec: 44 * 60,
    focusRate: 96,
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

  it("요일 헤더를 렌더한다(월 라벨은 BY-567부터 RecordsPage가 카드 밖에서 그린다)", () => {
    render(
      <MonthCalendar
        month={month}
        todayKey={todayKey}
        selectedKey={todayKey}
        dayFocusSec={new Map()}
        onSelectDate={vi.fn()}
        slideFrom={null}
        onSwipeMonth={vi.fn()}
      />,
    );

    expect(screen.getByText("일")).toBeInTheDocument();
    expect(screen.getByText("토")).toBeInTheDocument();
  });

  it("달력을 좌로 스와이프하면 delta 1(다음 달), 우로 스와이프하면 delta -1(이전 달)로 onSwipeMonth를 부른다 (BY-343)", () => {
    const onSwipeMonth = vi.fn();
    render(
      <MonthCalendar
        month={month}
        todayKey={todayKey}
        selectedKey={todayKey}
        dayFocusSec={new Map()}
        onSelectDate={vi.fn()}
        slideFrom={null}
        onSwipeMonth={onSwipeMonth}
      />,
    );
    const swipeArea = screen.getByTestId("month-calendar-swipe-area");

    fireEvent.pointerDown(swipeArea, { clientX: 300, clientY: 200 });
    fireEvent.pointerUp(swipeArea, { clientX: 300 - 60, clientY: 200 });
    expect(onSwipeMonth).toHaveBeenNthCalledWith(1, 1);

    fireEvent.pointerDown(swipeArea, { clientX: 240, clientY: 200 });
    fireEvent.pointerUp(swipeArea, { clientX: 240 + 60, clientY: 200 });
    expect(onSwipeMonth).toHaveBeenNthCalledWith(2, -1);
  });

  it("임계 미만·세로 우세 드래그는 월을 바꾸지 않는다 — 날짜 탭·페이지 스크롤 몫이다", () => {
    const onSwipeMonth = vi.fn();
    render(
      <MonthCalendar
        month={month}
        todayKey={todayKey}
        selectedKey={todayKey}
        dayFocusSec={new Map()}
        onSelectDate={vi.fn()}
        slideFrom={null}
        onSwipeMonth={onSwipeMonth}
      />,
    );
    const swipeArea = screen.getByTestId("month-calendar-swipe-area");

    // 임계(48px) 미만의 가로 드래그.
    fireEvent.pointerDown(swipeArea, { clientX: 300, clientY: 200 });
    fireEvent.pointerUp(swipeArea, { clientX: 300 - 30, clientY: 200 });

    // 가로로 임계를 넘었지만 세로 이동이 더 큰 드래그(스크롤).
    fireEvent.pointerDown(swipeArea, { clientX: 300, clientY: 200 });
    fireEvent.pointerUp(swipeArea, { clientX: 300 - 60, clientY: 200 + 120 });

    expect(onSwipeMonth).not.toHaveBeenCalled();
  });

  it("과거 날짜를 클릭하면 onSelectDate가 그 날짜 키로 호출된다", () => {
    const onSelectDate = vi.fn();
    render(
      <MonthCalendar
        month={month}
        todayKey={todayKey}
        selectedKey={todayKey}
        dayFocusSec={new Map()}
        onSelectDate={onSelectDate}
        slideFrom={null}
        onSwipeMonth={vi.fn()}
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
        dayFocusSec={new Map()}
        onSelectDate={onSelectDate}
        slideFrom={null}
        onSwipeMonth={vi.fn()}
      />,
    );

    const futureCell = screen.getByRole("button", { name: "31일, 기록 없음" });
    expect(futureCell).toBeDisabled();

    fireEvent.click(futureCell);
    expect(onSelectDate).not.toHaveBeenCalled();
  });

  it("공부한 날은 순공시간과 함께 aria-label을 주고 시간 라벨을 보여준다", () => {
    render(
      <MonthCalendar
        month={month}
        todayKey={todayKey}
        selectedKey={todayKey}
        dayFocusSec={new Map([["2026-07-04", 3 * 3600 + 6 * 60]])}
        onSelectDate={vi.fn()}
        slideFrom={null}
        onSwipeMonth={vi.fn()}
      />,
    );

    expect(screen.getByText("3:06")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "4일, 순공 3시간 6분" })).toBeInTheDocument();
  });

  it("기록 없는 날은 시간 라벨 없이 기록 없음으로 읽힌다", () => {
    render(
      <MonthCalendar
        month={month}
        todayKey={todayKey}
        selectedKey={todayKey}
        dayFocusSec={new Map()}
        onSelectDate={vi.fn()}
        slideFrom={null}
        onSwipeMonth={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "6일, 기록 없음" })).toBeInTheDocument();
  });

  it("선택일 셀은 aria-pressed=true다", () => {
    render(
      <MonthCalendar
        month={month}
        todayKey={todayKey}
        selectedKey="2026-07-10"
        dayFocusSec={new Map()}
        onSelectDate={vi.fn()}
        slideFrom={null}
        onSwipeMonth={vi.fn()}
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
  it("v2 행은 시각 범위와 순공·집중 보조줄을 버튼으로 보여준다", () => {
    const onSelect = vi.fn();
    render(<SessionListItem session={session()} onSelect={onSelect} />);

    const button = screen.getByRole("button", { name: /07:30 ~ 08:16/ });
    expect(screen.getByText("순공 44분 · 집중 96%")).toBeInTheDocument();

    button.click();
    expect(onSelect).toHaveBeenCalled();
  });

  it("onSelect가 없으면 버튼이 아니라 비인터랙티브 행이지만 시각 범위·보조줄은 그대로 보인다", () => {
    render(<SessionListItem session={session()} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("07:30 ~ 08:16")).toBeInTheDocument();
    expect(screen.getByText("순공 44분 · 집중 96%")).toBeInTheDocument();
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

describe("MonthSummary", () => {
  const month = { year: 2026, month: 9 };
  it("월 순공 합계와 증가 문구를 보여준다", () => {
    render(
      <MonthSummary
        month={month}
        daily={[{ date: "2026-09-01", studySec: 0, focusSec: 6 * 3600 }]}
        compareDaily={[{ date: "2026-08-01", studySec: 0, focusSec: 0 }]}
      />,
    );
    expect(screen.getByText("9월 순공시간")).toBeInTheDocument();
    expect(screen.getByText("6시간")).toBeInTheDocument();
    expect(screen.getByText(/지난달보다 6시간 늘었어요/)).toBeInTheDocument();
  });

  it("증감이 0이면 증감 줄을 그리지 않는다", () => {
    render(
      <MonthSummary
        month={month}
        daily={[{ date: "2026-09-01", studySec: 0, focusSec: 3600 }]}
        compareDaily={[{ date: "2026-08-01", studySec: 0, focusSec: 3600 }]}
      />,
    );
    expect(screen.queryByText(/지난달보다/)).not.toBeInTheDocument();
  });

  it("줄었으면 줄어든 문구를 보여준다", () => {
    render(
      <MonthSummary
        month={month}
        daily={[{ date: "2026-09-01", studySec: 0, focusSec: 3600 }]}
        compareDaily={[{ date: "2026-08-01", studySec: 0, focusSec: 2 * 3600 }]}
      />,
    );
    expect(screen.getByText(/지난달보다 1시간 줄었어요/)).toBeInTheDocument();
  });
});

describe("SegmentedControl", () => {
  it("현재 값을 선택 상태로 표시하고, 주간 비활성이면 누를 수 없다", () => {
    const onChange = vi.fn();
    render(<SegmentedControl value="daily" onChange={onChange} weeklyDisabled />);
    const daily = screen.getByRole("tab", { name: "일간" });
    const weekly = screen.getByRole("tab", { name: "주간" });
    expect(daily).toHaveAttribute("aria-selected", "true");
    expect(weekly).toBeDisabled();
  });

  it("활성 상태에서 다른 탭을 누르면 onChange가 불린다", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl value="daily" onChange={onChange} />);
    // Radix Tabs는 포인터/포커스 이벤트로 활성화한다 — jsdom의 raw `.click()`으로는 안 불린다.
    await userEvent.click(screen.getByRole("tab", { name: "주간" }));
    expect(onChange).toHaveBeenCalledWith("weekly");
  });
});
