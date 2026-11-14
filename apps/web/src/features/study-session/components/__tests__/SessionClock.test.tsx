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

describe("SessionClock 유예", () => {
  const GRACE = { state: "grace" as const, statusLabel: "공부 상태를 확인 중이에요" };
  const number = () => screen.getByTestId("session-clock-number");

  it("유예면 라벨 자리에 유예 문구를 흰색 85%로 보이고 2초 주기로 옅어진다", () => {
    renderClock(GRACE);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("공부 상태를 확인 중이에요");
    expect(status).toHaveClass("text-white/85");
    expect(status.className).toContain("animate-[session-grace-label_2s_ease-in-out_infinite]");
  });

  it("유예면 순공이 흐르므로 숫자는 회색이 아닌 흰색으로 두고 0.6까지 옅어졌다 돌아온다", () => {
    renderClock(GRACE);

    expect(number()).toHaveClass("text-white");
    expect(number()).not.toHaveClass("text-text-tertiary");
    expect(number().className).toContain("animate-[session-grace-number_2s_ease-in-out_infinite]");
  });

  it("움직임 줄이기에서는 라벨과 숫자 모두 깜빡이지 않는다", () => {
    renderClock(GRACE);

    expect(screen.getByRole("status")).toHaveClass("motion-reduce:animate-none");
    expect(number()).toHaveClass("motion-reduce:animate-none");
  });

  it("비집중은 회색 문구와 회색 숫자로 멈춰 있고 깜빡이지 않는다", () => {
    renderClock({ state: "distract", statusLabel: "자리를 확인해 주세요" });

    expect(screen.getByRole("status")).toHaveClass("text-text-tertiary");
    expect(number()).toHaveClass("text-text-tertiary");
    expect(screen.getByRole("status").className).not.toContain("session-grace");
    expect(number().className).not.toContain("session-grace");
  });
});
