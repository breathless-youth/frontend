import type { DailyStudyStat } from "@focusmakers/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WeekHeader } from "../WeekHeader";

/** focusSec만 라벨·합계에 쓰이므로 나머지는 0으로 채운다. */
function day(date: string, focusSec: number): DailyStudyStat {
  return { date, studySec: 0, focusSec };
}

function renderHeader(props: Partial<Parameters<typeof WeekHeader>[0]> = {}) {
  return render(
    <WeekHeader
      weekAnchorKey="2026-09-16"
      daily={[]}
      compareDaily={[]}
      onPrevWeek={vi.fn()}
      onNextWeek={vi.fn()}
      {...props}
    />,
  );
}

describe("WeekHeader", () => {
  it("같은 달 주는 끝을 일만으로 라벨한다 (9월 14일 ~ 20일)", () => {
    renderHeader({ weekAnchorKey: "2026-09-16" });
    expect(screen.getByText("9월 14일 ~ 20일")).toBeInTheDocument();
  });

  it("달을 넘는 주는 끝도 월·일로 라벨한다", () => {
    // 2026-08-31이 속한 주(월~일)는 8/31 ~ 9/6.
    renderHeader({ weekAnchorKey: "2026-08-31" });
    expect(screen.getByText("8월 31일 ~ 9월 6일")).toBeInTheDocument();
  });

  it("이번 주 순공 합계를 보여준다", () => {
    renderHeader({
      daily: [day("2026-09-14", 6 * 3600), day("2026-09-15", 48 * 60)],
    });
    expect(screen.getByText("이번 주 순공시간")).toBeInTheDocument();
    expect(screen.getByText("6시간 48분")).toBeInTheDocument();
  });

  it("늘었으면 증가 문구를 보여준다", () => {
    renderHeader({
      daily: [day("2026-09-14", 6 * 3600)],
      compareDaily: [day("2026-09-07", 3600)],
    });
    expect(screen.getByText(/지난주보다 5시간 늘었어요/)).toBeInTheDocument();
  });

  it("줄었으면 감소 문구를 빨강 토큰으로 보여준다", () => {
    renderHeader({
      daily: [day("2026-09-14", 3600)],
      compareDaily: [day("2026-09-07", 2 * 3600)],
    });
    expect(screen.getByText(/지난주보다 1시간 줄었어요/)).toHaveClass("text-feedback-danger");
  });

  it("증감이 0이면 같아요 문구를 보여준다", () => {
    renderHeader({
      daily: [day("2026-09-14", 3600)],
      compareDaily: [day("2026-09-07", 3600)],
    });
    expect(screen.getByText("지난주와 같아요")).toBeInTheDocument();
  });

  it("좌우 네비 버튼이 콜백을 부른다", () => {
    const onPrevWeek = vi.fn();
    const onNextWeek = vi.fn();
    renderHeader({ onPrevWeek, onNextWeek });

    fireEvent.click(screen.getByRole("button", { name: "이전 주" }));
    fireEvent.click(screen.getByRole("button", { name: "다음 주" }));

    expect(onPrevWeek).toHaveBeenCalledTimes(1);
    expect(onNextWeek).toHaveBeenCalledTimes(1);
  });
});
