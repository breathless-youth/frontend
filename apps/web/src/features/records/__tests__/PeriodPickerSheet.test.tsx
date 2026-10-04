import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MonthPickerSheet, WeekPickerSheet } from "../PeriodPickerSheet";

const TODAY = "2026-09-18"; // 금요일

describe("MonthPickerSheet — 월 선택", () => {
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

    expect(screen.getByText("월 선택")).toBeInTheDocument();
    expect(screen.getByText("2026년")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "9월" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "8월" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "10월" })).toBeDisabled();
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
    await userEvent.click(screen.getByRole("button", { name: "12월" }));

    expect(onPick).toHaveBeenCalledWith({ year: 2025, month: 12 }, false);
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
});
