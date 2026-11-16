import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeProgressBand } from "../HomeProgressBand";
import type { HomeV3ContentProps } from "../homeV3ContentTypes";
import type { HomeBand } from "../homeV3Model";

function actions(): HomeV3ContentProps["actions"] {
  return {
    selectSubject: vi.fn(),
    startStudy: vi.fn(),
    openPlanner: vi.fn(),
    completeMission: vi.fn(),
    claimMissionReward: vi.fn(),
    editGoal: vi.fn(),
    openTimelapses: vi.fn(),
    openTimelapseSettings: vi.fn(),
    openAppLock: vi.fn(),
    openContact: vi.fn(),
  };
}

function band(value: HomeBand, handlers: HomeV3ContentProps["actions"]) {
  return <HomeProgressBand band={value} completing={false} starting={false} actions={handlers} />;
}

const REWARD: HomeBand = { kind: "mission-reward", points: 150 };
const GOAL_EMPTY: HomeBand = { kind: "goal-empty" };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HomeProgressBand", () => {
  it("처음 그려진 띠의 버튼은 바로 눌린다", () => {
    const handlers = actions();
    render(band(GOAL_EMPTY, handlers));

    fireEvent.click(screen.getByRole("button", { name: "설정하기" }));

    expect(handlers.editGoal).toHaveBeenCalledOnce();
  });

  it("보상을 받아 띠가 바뀐 직후에는 같은 자리에 나타난 버튼이 눌리지 않는다", () => {
    const handlers = actions();
    const view = render(band(REWARD, handlers));
    fireEvent.click(screen.getByRole("button", { name: "받기" }));
    expect(handlers.claimMissionReward).toHaveBeenCalledOnce();

    // 받기를 연달아 누르면 두 번째 탭이 그 자리에 새로 나타난 목표 버튼에 닿는다.
    view.rerender(band(GOAL_EMPTY, handlers));
    fireEvent.click(screen.getByRole("button", { name: "설정하기" }));
    vi.advanceTimersByTime(400);
    fireEvent.click(screen.getByRole("button", { name: "설정하기" }));

    expect(handlers.editGoal).not.toHaveBeenCalled();
  });

  it("띠가 바뀌고 조금 지나면 새 버튼이 눌린다", () => {
    const handlers = actions();
    const view = render(band(REWARD, handlers));
    view.rerender(band(GOAL_EMPTY, handlers));

    vi.advanceTimersByTime(500);
    fireEvent.click(screen.getByRole("button", { name: "설정하기" }));

    expect(handlers.editGoal).toHaveBeenCalledOnce();
  });

  it("미션을 완료해 다음 단계로 바뀐 직후에도 새 버튼이 눌리지 않는다", () => {
    const handlers = actions();
    const view = render(band({ kind: "mission", step: 1, ready: true, progress: 0.5 }, handlers));
    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    expect(handlers.completeMission).toHaveBeenCalledWith(1);

    view.rerender(band({ kind: "mission", step: 2, ready: false, progress: 0.5 }, handlers));
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));

    expect(handlers.startStudy).not.toHaveBeenCalled();
  });

  it("같은 띠가 값만 바뀌어 다시 그려질 때는 버튼을 막지 않는다", () => {
    const handlers = actions();
    const goal = (percent: number): HomeBand => ({
      kind: "goal",
      targetSeconds: 3600,
      remainingSeconds: 1800,
      percent,
    });
    const view = render(band(goal(40), handlers));
    view.rerender(band(goal(50), handlers));

    fireEvent.click(screen.getByRole("button", { name: "변경하기" }));

    expect(handlers.editGoal).toHaveBeenCalledOnce();
  });
});
