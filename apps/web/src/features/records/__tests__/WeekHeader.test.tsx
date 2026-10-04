import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WeekHeader } from "../WeekHeader";

const day = (date: string, focusSec: number, studySec = focusSec) => ({ date, studySec, focusSec });

describe("WeekHeader", () => {
  it("주 범위 라벨과 주간 순공시간·총 공부시간을 보여준다(증감 줄은 없다)", () => {
    render(
      <WeekHeader
        weekAnchorKey="2026-09-18"
        metricsStatus="success"
        daily={[day("2026-09-14", 2 * 3600, 3 * 3600), day("2026-09-15", 3600, 3600)]}
        canGoNext={false}
        onPrevWeek={vi.fn()}
        onNextWeek={vi.fn()}
        onOpenPicker={vi.fn()}
      />,
    );

    expect(screen.getByText("9월 14일 ~ 20일")).toBeInTheDocument();
    expect(screen.getByText("주간 순공시간")).toBeInTheDocument();
    // 숫자는 크게, 단위는 작게 적어 요소가 나뉜다 — 줄 전체로 읽는다.
    expect(screen.getByText("3").closest("p")).toHaveTextContent(/^3시간$/);
    expect(screen.getByText("주간 순공시간").parentElement).toHaveTextContent("총 4시간");
    expect(screen.queryByText(/지난주보다/)).not.toBeInTheDocument();
  });

  it("달이 바뀌는 주는 끝 날짜에도 달을 적는다", () => {
    render(
      <WeekHeader
        weekAnchorKey="2026-10-01"
        metricsStatus="pending"
        canGoNext
        onPrevWeek={vi.fn()}
        onNextWeek={vi.fn()}
        onOpenPicker={vi.fn()}
      />,
    );

    expect(screen.getByText("9월 28일 ~ 10월 4일")).toBeInTheDocument();
  });

  it("오류면 숫자를 그리지 않고 범위·네비만 남긴다", () => {
    render(
      <WeekHeader
        weekAnchorKey="2026-09-18"
        metricsStatus="error"
        canGoNext
        onPrevWeek={vi.fn()}
        onNextWeek={vi.fn()}
        onOpenPicker={vi.fn()}
      />,
    );

    expect(screen.getByText("9월 14일 ~ 20일")).toBeInTheDocument();
    expect(screen.queryByText("주간 순공시간")).not.toBeInTheDocument();
  });

  it("좌우 네비 버튼이 콜백을 부르고, 오늘이 속한 주에서는 다음 주 버튼이 비활성이다", async () => {
    const onPrevWeek = vi.fn();
    const onNextWeek = vi.fn();
    const { rerender } = render(
      <WeekHeader
        weekAnchorKey="2026-09-18"
        metricsStatus="pending"
        canGoNext
        onPrevWeek={onPrevWeek}
        onNextWeek={onNextWeek}
        onOpenPicker={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "이전 주" }));
    await userEvent.click(screen.getByRole("button", { name: "다음 주" }));
    expect(onPrevWeek).toHaveBeenCalledTimes(1);
    expect(onNextWeek).toHaveBeenCalledTimes(1);

    rerender(
      <WeekHeader
        weekAnchorKey="2026-09-18"
        metricsStatus="pending"
        canGoNext={false}
        onPrevWeek={onPrevWeek}
        onNextWeek={onNextWeek}
        onOpenPicker={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "다음 주" })).toBeDisabled();
  });
});
