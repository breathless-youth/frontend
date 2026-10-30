import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DayPickerSheet, MonthPickerSheet, WeekPickerSheet } from "../PeriodPickerSheet";

// jsdom에는 `PointerEvent` 구현이 없다 — 폴리필이 없으면 스와이프 판정에 쓰는 `clientX`가 사라진다
// (`recordsComponents.test.tsx`와 같은 최소 폴리필).
if (typeof window.PointerEvent === "undefined") {
  window.PointerEvent = MouseEvent as unknown as typeof PointerEvent;
}

const TODAY = "2026-09-18"; // 금요일

describe("MonthPickerSheet — 달 선택", () => {
  it("보고 있는 달을 선택으로 표시하고 미래 달은 고를 수 없다", () => {
    render(
      <MonthPickerSheet
        open
        onOpenChange={vi.fn()}
        month={{ year: 2026, month: 9 }}
        todayKey={TODAY}
        onPick={vi.fn()}
      />,
    );

    expect(screen.getByText("달 선택")).toBeInTheDocument();
    expect(screen.getByText("2026년")).toBeInTheDocument();
    // 달 격자는 하나만 고르는 묶음(라디오)이다.
    expect(screen.getByRole("radio", { name: "9월" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "8월" })).not.toBeDisabled();
    expect(screen.getByRole("radio", { name: "10월" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "다음 해" })).toBeDisabled();
  });

  it("연도를 넘겨 다른 해의 달을 고르면 그 달을 넘긴다", async () => {
    const onPick = vi.fn();
    render(
      <MonthPickerSheet
        open
        onOpenChange={vi.fn()}
        month={{ year: 2026, month: 9 }}
        todayKey={TODAY}
        onPick={onPick}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "이전 해" }));
    expect(screen.getByText("2025년")).toBeInTheDocument();
    // 지난해는 12월까지 전부 고를 수 있다.
    await userEvent.click(screen.getByRole("radio", { name: "12월" }));

    expect(onPick).toHaveBeenCalledWith({ year: 2025, month: 12 }, false);
  });

  it("달 격자를 좌우로 밀면 해를 넘기고, 올해에서는 더 가지 않는다", () => {
    render(
      <MonthPickerSheet
        open
        onOpenChange={vi.fn()}
        month={{ year: 2026, month: 9 }}
        todayKey={TODAY}
        onPick={vi.fn()}
      />,
    );
    const grid = screen.getByTestId("month-picker-swipe-area");

    // 오른쪽으로 밀면 이전 해.
    fireEvent.pointerDown(grid, { clientX: 100, clientY: 200 });
    fireEvent.pointerUp(grid, { clientX: 100 + 60, clientY: 200 });
    expect(screen.getByText("2025년")).toBeInTheDocument();

    // 왼쪽으로 밀면 다음 해 — 올해까지만.
    fireEvent.pointerDown(grid, { clientX: 300, clientY: 200 });
    fireEvent.pointerUp(grid, { clientX: 300 - 60, clientY: 200 });
    fireEvent.pointerDown(grid, { clientX: 300, clientY: 200 });
    fireEvent.pointerUp(grid, { clientX: 300 - 60, clientY: 200 });
    expect(screen.getByText("2026년")).toBeInTheDocument();
  });

  it("오늘을 누르면 오늘이 속한 달을 넘긴다", async () => {
    const onPick = vi.fn();
    render(
      <MonthPickerSheet
        open
        onOpenChange={vi.fn()}
        month={{ year: 2025, month: 3 }}
        todayKey={TODAY}
        onPick={onPick}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "오늘" }));

    expect(onPick).toHaveBeenCalledWith({ year: 2026, month: 9 }, true);
  });

  it("격자를 가로로 미는 동작은 시트 끌어 닫기에서 뺀다", () => {
    render(
      <MonthPickerSheet
        open
        onOpenChange={vi.fn()}
        month={{ year: 2026, month: 9 }}
        todayKey={TODAY}
        onPick={vi.fn()}
      />,
    );

    expect(screen.getByTestId("month-picker-swipe-area")).toHaveAttribute(
      "data-base-ui-swipe-ignore",
      "x",
    );
  });

  it("오늘·해 넘기기 버튼에서 시작한 손가락은 끌기에서 빼고, 제목에서는 끌어 닫을 수 있다", () => {
    // iOS에서 살짝 움직인 탭이 끌기로 잡혀 버려지지 않게 한다.
    render(
      <MonthPickerSheet
        open
        onOpenChange={vi.fn()}
        month={{ year: 2026, month: 9 }}
        todayKey={TODAY}
        onPick={vi.fn()}
      />,
    );

    for (const name of ["오늘", "이전 해", "다음 해"]) {
      expect(
        screen.getByRole("button", { name }).closest("[data-base-ui-swipe-ignore]"),
      ).not.toBeNull();
    }
    expect(screen.getByText("달 선택").closest("[data-base-ui-swipe-ignore]")).toBeNull();
  });
});

describe("WeekPickerSheet — 주 선택", () => {
  it("날짜를 누르면 그 날짜를 넘기고, 미래 날짜는 고를 수 없다", async () => {
    const onPick = vi.fn();
    render(
      <WeekPickerSheet
        open
        onOpenChange={vi.fn()}
        weekAnchorKey={TODAY}
        todayKey={TODAY}
        onPick={onPick}
      />,
    );

    expect(screen.getByText("주 선택")).toBeInTheDocument();
    expect(screen.getByText("2026년 9월")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "9월 19일" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "오늘, 9월 18일" })).not.toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "9월 9일" }));
    expect(onPick).toHaveBeenCalledWith("2026-09-09", false);
  });

  it("보고 있는 주의 행을 강조하고, 달을 넘겨 다른 달의 날짜를 고를 수 있다", async () => {
    const onPick = vi.fn();
    render(
      <WeekPickerSheet
        open
        onOpenChange={vi.fn()}
        weekAnchorKey={TODAY}
        todayKey={TODAY}
        onPick={onPick}
      />,
    );

    // 9월 14일(월)~20일(일) 행이 강조된다.
    expect(screen.getByRole("button", { name: "9월 14일" }).parentElement).toHaveClass(
      "bg-brand-subtle",
    );
    expect(screen.getByRole("button", { name: "9월 7일" }).parentElement).not.toHaveClass(
      "bg-brand-subtle",
    );
    // 오늘이 속한 달이 끝이다.
    expect(screen.getByRole("button", { name: "다음 달" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "이전 달" }));
    expect(screen.getByText("2026년 8월")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "8월 20일" }));
    expect(onPick).toHaveBeenCalledWith("2026-08-20", false);
  });

  it("달력을 좌우로 밀면 달을 넘기고, 오늘이 속한 달에서는 더 가지 않는다", () => {
    render(
      <WeekPickerSheet
        open
        onOpenChange={vi.fn()}
        weekAnchorKey={TODAY}
        todayKey={TODAY}
        onPick={vi.fn()}
      />,
    );
    const area = screen.getByTestId("week-picker-swipe-area");

    fireEvent.pointerDown(area, { clientX: 100, clientY: 200 });
    fireEvent.pointerUp(area, { clientX: 100 + 60, clientY: 200 });
    expect(screen.getByText("2026년 8월")).toBeInTheDocument();

    fireEvent.pointerDown(area, { clientX: 300, clientY: 200 });
    fireEvent.pointerUp(area, { clientX: 300 - 60, clientY: 200 });
    fireEvent.pointerDown(area, { clientX: 300, clientY: 200 });
    fireEvent.pointerUp(area, { clientX: 300 - 60, clientY: 200 });
    expect(screen.getByText("2026년 9월")).toBeInTheDocument();
  });

  it("달의 첫 주·마지막 주는 이웃 달 날짜로 채우고, 오늘은 굵게 적는다", () => {
    render(
      <WeekPickerSheet
        open
        onOpenChange={vi.fn()}
        weekAnchorKey={TODAY}
        todayKey={TODAY}
        onPick={vi.fn()}
      />,
    );

    // 2026년 9월은 화요일에 시작한다 — 첫 주는 8월 31일(월)부터, 마지막 주는 10월 4일(일)까지다.
    const firstMonday = screen.getByRole("button", { name: "8월 31일" });
    expect(firstMonday).not.toBeDisabled();
    expect(firstMonday.closest("tr")).toBe(
      screen.getByRole("button", { name: "9월 1일" }).closest("tr"),
    );
    expect(screen.getByRole("button", { name: "10월 4일" })).toBeDisabled();

    expect(screen.getByRole("button", { name: "오늘, 9월 18일" })).toHaveClass("font-extrabold");
    expect(screen.getByRole("button", { name: "9월 17일" })).not.toHaveClass("font-extrabold");
  });

  it("오늘을 누르면 오늘 날짜를 넘긴다", async () => {
    const onPick = vi.fn();
    render(
      <WeekPickerSheet
        open
        onOpenChange={vi.fn()}
        weekAnchorKey="2026-08-05"
        todayKey={TODAY}
        onPick={onPick}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "오늘" }));
    expect(onPick).toHaveBeenCalledWith(TODAY, true);
  });

  it("달력을 가로로 미는 동작은 시트 끌어 닫기에서 뺀다", () => {
    render(
      <WeekPickerSheet
        open
        onOpenChange={vi.fn()}
        weekAnchorKey={TODAY}
        todayKey={TODAY}
        onPick={vi.fn()}
      />,
    );

    expect(screen.getByTestId("week-picker-swipe-area")).toHaveAttribute(
      "data-base-ui-swipe-ignore",
      "x",
    );
  });
});

describe("DayPickerSheet — 날짜 선택", () => {
  it("달력을 좌우로 밀면 달을 넘기되 오늘이 속한 달 뒤로는 가지 않는다", () => {
    render(
      <DayPickerSheet
        open
        onOpenChange={vi.fn()}
        dateKey={TODAY}
        todayKey={TODAY}
        onPick={vi.fn()}
      />,
    );
    const area = screen.getByTestId("day-picker-swipe-area");

    fireEvent.pointerDown(area, { clientX: 100, clientY: 200 });
    fireEvent.pointerUp(area, { clientX: 100 + 60, clientY: 200 });
    expect(screen.getByText("2026년 8월")).toBeInTheDocument();

    fireEvent.pointerDown(area, { clientX: 300, clientY: 200 });
    fireEvent.pointerUp(area, { clientX: 300 - 60, clientY: 200 });
    fireEvent.pointerDown(area, { clientX: 300, clientY: 200 });
    fireEvent.pointerUp(area, { clientX: 300 - 60, clientY: 200 });
    expect(screen.getByText("2026년 9월")).toBeInTheDocument();
  });

  it("달력을 가로로 미는 동작은 시트 끌어 닫기에서 뺀다", () => {
    render(
      <DayPickerSheet
        open
        onOpenChange={vi.fn()}
        dateKey={TODAY}
        todayKey={TODAY}
        onPick={vi.fn()}
      />,
    );

    expect(screen.getByTestId("day-picker-swipe-area")).toHaveAttribute(
      "data-base-ui-swipe-ignore",
      "x",
    );
  });

  it("열어도 포커스를 시트 안으로 옮기지 않는다", async () => {
    render(
      <>
        <button type="button">기간</button>
        <DayPickerSheet
          open
          onOpenChange={vi.fn()}
          dateKey={TODAY}
          todayKey={TODAY}
          onPick={vi.fn()}
        />
      </>,
    );
    await act(async () => {});

    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(false);
  });
});
