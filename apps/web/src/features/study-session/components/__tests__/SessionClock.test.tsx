import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SessionClock, type SessionClockProps } from "../SessionClock";

const BASE: SessionClockProps = {
  view: "focus",
  studySec: 3792,
  focusSec: 3600,
  todayStudySec: 15320,
  todayFocusSec: 13700,
  state: "focus",
  statusLabel: "",
  simple: false,
};

function renderClock(over: Partial<SessionClockProps> = {}) {
  return render(<SessionClock {...BASE} {...over} />);
}

describe("SessionClock 보기 형식", () => {
  it("순공 보기는 이번 세션 순공을 크게, 오늘 순공을 아래 줄에 보인다", () => {
    renderClock();

    expect(screen.getByRole("status")).toHaveTextContent("현재 집중");
    expect(screen.getByText("01:00:00")).toBeInTheDocument();
    expect(screen.getByText("오늘 집중")).toBeInTheDocument();
    expect(screen.getByText("03:48:20")).toBeInTheDocument();
  });

  it("공부 보기는 이번 세션 공부 시간과 오늘 공부 시간을 보인다", () => {
    renderClock({ view: "study" });

    expect(screen.getByRole("status")).toHaveTextContent("현재 공부");
    expect(screen.getByText("01:03:12")).toBeInTheDocument();
    expect(screen.getByText("오늘 공부")).toBeInTheDocument();
    expect(screen.getByText("04:15:20")).toBeInTheDocument();
  });

  it("집중하지 않을 때는 라벨 자리에 상태 문구를 보인다", () => {
    renderClock({ state: "distract", statusLabel: "자리를 확인해 주세요" });

    expect(screen.getByRole("status")).toHaveTextContent("자리를 확인해 주세요");
  });

  it("심플 모드는 오늘 줄을 보이지 않는다", () => {
    renderClock({ simple: true });

    expect(screen.queryByText("오늘 집중")).not.toBeInTheDocument();
  });

  it("월페이퍼 위에서도 라벨·큰 숫자·오늘 줄만 보인다", () => {
    renderClock({ corner: true });

    expect(screen.getByRole("status")).toHaveTextContent("현재 집중");
    expect(screen.getByText("01:00:00")).toBeInTheDocument();
    expect(screen.getByText("오늘 집중")).toBeInTheDocument();
    expect(screen.queryByText("집중률")).not.toBeInTheDocument();
  });

  it("순공·집중률 카드를 여는 버튼이 없다", () => {
    renderClock();

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
