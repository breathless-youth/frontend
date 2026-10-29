import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PlannerSubjectItem } from "@/features/planner/subjectItems";
import { subjectColorVar } from "@/features/records/recordsTimetable";

import { HomeSubjectList } from "../HomeSubjectList";

const item = (overrides: Partial<PlannerSubjectItem>): PlannerSubjectItem => ({
  subjectId: 1,
  name: "국어",
  colorIndex: 0,
  focusSec: 9600,
  tasks: [],
  live: true,
  ...overrides,
});

const ITEMS = [
  item({}),
  item({ subjectId: 2, name: "수학", colorIndex: 3, focusSec: 0 }),
  item({ subjectId: 9, name: "한국사", colorIndex: 5, focusSec: 600, live: false }),
];

describe("HomeSubjectList", () => {
  it("오늘은 과목마다 재생 버튼과 그날 순공을 보이고, 누르면 그 과목을 알린다", () => {
    const onPlay = vi.fn();
    render(<HomeSubjectList items={ITEMS} isToday onPlay={onPlay} />);

    const rows = within(screen.getByRole("list", { name: "과목" })).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("순공")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("2시간 40분")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("0분")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "수학 공부 시작" }));
    expect(onPlay).toHaveBeenCalledWith(2);
  });

  it("재생 버튼은 과목 색으로 그리고, 글리프는 보조기기에 읽히지 않아 이름만 읽힌다", () => {
    render(<HomeSubjectList items={ITEMS} isToday onPlay={vi.fn()} />);

    const button = screen.getByRole("button", { name: "수학 공부 시작" });
    expect(button).toHaveAttribute("type", "button");
    expect(button.style.color).toBe(subjectColorVar(3));
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("오늘이어도 지운 과목에는 재생 버튼이 없다", () => {
    render(<HomeSubjectList items={ITEMS} isToday onPlay={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "한국사 공부 시작" })).not.toBeInTheDocument();
    expect(screen.getByText("한국사")).toBeInTheDocument();
  });

  it("지난 날에는 재생 버튼이 없다", () => {
    render(<HomeSubjectList items={ITEMS} isToday={false} onPlay={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /공부 시작/ })).not.toBeInTheDocument();
    expect(screen.getByText("국어")).toBeInTheDocument();
    expect(screen.getByText("2시간 40분")).toBeInTheDocument();
  });
});
