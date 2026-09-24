import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DdayCalendar } from "../DdayCalendar";

// 오늘을 2026-09-23(수)으로 고정한다 — 달력은 todayKey만 보고 시계를 읽지 않는다.
const TODAY = "2026-09-23";

function renderCalendar(value: string | null = null) {
  const onChange = vi.fn();
  render(<DdayCalendar value={value} todayKey={TODAY} onChange={onChange} />);
  return { onChange };
}

describe("DdayCalendar — 날짜 고르기", () => {
  it("오늘 달을 열고, 지난 날은 못 누르고 오늘부터 고를 수 있다", () => {
    const { onChange } = renderCalendar();

    expect(screen.getByText("2026년 9월")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "9월 22일" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "9월 23일" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "9월 30일" }));
    expect(onChange).toHaveBeenCalledWith("2026-09-30");
  });

  it("고른 날은 눌린 상태로 표시되고 그 달이 먼저 열린다", () => {
    renderCalendar("2027-11-18");

    expect(screen.getByText("2027년 11월")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "11월 18일" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("지난 D-Day를 편집할 땐 그 달이 아니라 이번 달부터 연다", () => {
    renderCalendar("2020-09-20");

    expect(screen.getByText("2026년 9월")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "9월 23일" })).toBeEnabled();
  });

  it("화살표로 달을 넘긴다", () => {
    renderCalendar();

    fireEvent.click(screen.getByRole("button", { name: "다음 달" }));
    expect(screen.getByText("2026년 10월")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이전 달" }));
    fireEvent.click(screen.getByRole("button", { name: "이전 달" }));
    expect(screen.getByText("2026년 8월")).toBeInTheDocument();
  });
});

describe("DdayCalendar — 연/월 선택기", () => {
  it("월 라벨을 누르면 선택기가 열리고 지난 달은 못 고르며, 고르면 그 달로 간다", () => {
    renderCalendar();

    fireEvent.click(screen.getByRole("button", { name: "연도·월 바로 가기" }));
    expect(screen.getByRole("button", { name: "이전 연도" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "8월" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "9월" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "12월" }));
    expect(screen.getByText("2026년 12월")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "12월" })).not.toBeInTheDocument();
  });

  it("다음 연도로 넘기면 모든 달을 고를 수 있다", () => {
    renderCalendar();

    fireEvent.click(screen.getByRole("button", { name: "연도·월 바로 가기" }));
    fireEvent.click(screen.getByRole("button", { name: "다음 연도" }));
    expect(screen.getByText("2027")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1월" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "1월" }));
    expect(screen.getByText("2027년 1월")).toBeInTheDocument();
  });

  it("빠른 이동 칩은 오늘 기준으로 달을 옮긴다", () => {
    renderCalendar();

    fireEvent.click(screen.getByRole("button", { name: "연도·월 바로 가기" }));
    fireEvent.click(screen.getByRole("button", { name: "1년 후" }));
    expect(screen.getByText("2027년 9월")).toBeInTheDocument();
  });
});
