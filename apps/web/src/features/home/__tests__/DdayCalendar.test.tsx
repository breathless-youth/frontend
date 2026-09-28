import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DdayCalendar } from "../DdayCalendar";

// jsdom에는 `PointerEvent` 구현이 없다 — 폴리필이 없으면 스와이프 판정에 쓰는 `clientX`/`clientY`가
// 사라진다(`recordsComponents.test.tsx`와 같은 이유·같은 최소 폴리필).
if (typeof window.PointerEvent === "undefined") {
  window.PointerEvent = MouseEvent as unknown as typeof PointerEvent;
}

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

describe("DdayCalendar — 스와이프", () => {
  function swipe(dx: number, dy = 0) {
    const area = screen.getByTestId("dday-calendar-swipe-area");
    fireEvent.pointerDown(area, { clientX: 200, clientY: 300 });
    fireEvent.pointerUp(area, { clientX: 200 + dx, clientY: 300 + dy });
  }

  it("왼쪽으로 밀면 다음 달, 오른쪽으로 밀면 이전 달이다", () => {
    renderCalendar();

    swipe(-80);
    expect(screen.getByText("2026년 10월")).toBeInTheDocument();
    swipe(80);
    swipe(80);
    expect(screen.getByText("2026년 8월")).toBeInTheDocument();
  });

  it("임계 미만이거나 세로가 우세하면 달을 넘기지 않는다 — 탭과 스크롤을 뺏지 않는다", () => {
    renderCalendar();

    swipe(-30);
    swipe(-80, 120);
    expect(screen.getByText("2026년 9월")).toBeInTheDocument();
  });

  it("스와이프 뒤 마우스가 놓은 자리의 셀에 내는 click은 삼키고, 다음 탭은 그대로 먹힌다", () => {
    const { onChange } = renderCalendar();

    // `detail: 1` — 마우스가 낸 click이다. `fireEvent.click` 기본값 0은 키보드 쪽이라 구분된다.
    swipe(-80);
    fireEvent.click(screen.getByRole("button", { name: "10월 15일" }), { detail: 1 });
    expect(onChange).not.toHaveBeenCalled();

    swipe(-10);
    fireEvent.click(screen.getByRole("button", { name: "10월 15일" }), { detail: 1 });
    expect(onChange).toHaveBeenCalledWith("2026-10-15");
  });

  it("스와이프 뒤라도 키보드로 누른 날짜는 삼키지 않는다", () => {
    const { onChange } = renderCalendar();

    // 터치 스와이프는 뒤따르는 click이 없어 플래그가 다음 pointerdown까지 남는다. 그 사이
    // 키보드로 고른 날(Enter·Space는 `detail === 0`)까지 삼키면 키보드로는 못 고른다.
    swipe(-80);
    fireEvent.click(screen.getByRole("button", { name: "10월 15일" }));
    expect(onChange).toHaveBeenCalledWith("2026-10-15");
  });

  it("스와이프 영역이 요일 줄과 날짜 그리드 사이 간격을 들고 있다", () => {
    renderCalendar();

    // 래퍼가 바깥 `flex flex-col gap-2`를 끊으므로 여기서 같은 간격을 다시 만든다.
    expect(screen.getByTestId("dday-calendar-swipe-area").className).toContain("flex-col");
    expect(screen.getByTestId("dday-calendar-swipe-area").className).toContain("gap-2");
  });

  it("스와이프 영역이 비활성 셀을 포인터에 투명하게 만든다", () => {
    renderCalendar();

    // disabled 버튼은 포인터 이벤트를 디스패치하지 않는다 — 지난 날짜에서 시작한 스와이프가
    // 컨테이너까지 오게 하려면 비활성 자식이 포인터를 통과시켜야 한다. jsdom은 그 규칙을
    // 흉내 내지 않아 동작으로는 못 잡고, 규칙이 붙어 있는지로 확인한다.
    fireEvent.click(screen.getByRole("button", { name: "연도·월 바로 가기" }));
    expect(screen.getByTestId("dday-year-picker-swipe-area").className).toContain(
      "[&_button:disabled]:pointer-events-none",
    );
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

  it("선택기에서 좌우로 밀면 연도가 바뀌고, 올해보다 앞으로는 못 간다", () => {
    renderCalendar();
    fireEvent.click(screen.getByRole("button", { name: "연도·월 바로 가기" }));
    const area = screen.getByTestId("dday-year-picker-swipe-area");

    fireEvent.pointerDown(area, { clientX: 200, clientY: 300 });
    fireEvent.pointerUp(area, { clientX: 120, clientY: 300 });
    expect(screen.getByText("2027")).toBeInTheDocument();

    fireEvent.pointerDown(area, { clientX: 200, clientY: 300 });
    fireEvent.pointerUp(area, { clientX: 280, clientY: 300 });
    fireEvent.pointerDown(area, { clientX: 200, clientY: 300 });
    fireEvent.pointerUp(area, { clientX: 280, clientY: 300 });
    expect(screen.getByText("2026")).toBeInTheDocument();
  });

  it("빠른 이동 칩은 오늘 기준으로 달을 옮긴다", () => {
    renderCalendar();

    fireEvent.click(screen.getByRole("button", { name: "연도·월 바로 가기" }));
    fireEvent.click(screen.getByRole("button", { name: "1년 후" }));
    expect(screen.getByText("2027년 9월")).toBeInTheDocument();
  });
});
