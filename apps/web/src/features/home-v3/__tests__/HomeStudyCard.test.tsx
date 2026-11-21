import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HomeStudyCard } from "../HomeStudyCard";
import type { StudyTone } from "../studyTone";

const STATS = {
  status: "success",
  value: { studySeconds: 15512, focusSeconds: 13337, focusRate: 86 },
} as const;

function renderCard(tone?: StudyTone) {
  render(
    <HomeStudyCard stats={STATS} tone={tone}>
      <span />
    </HomeStudyCard>,
  );
  return {
    total: screen.getByLabelText(/4:18:32/),
    focus: screen.getByText("3:42:17"),
    rate: screen.getByText("86%"),
  };
}

describe("HomeStudyCard 공부 상태 색", () => {
  it("상태가 없거나 집중이면 지금 색 그대로다", () => {
    const { total, focus, rate } = renderCard("focus");

    expect(total).toHaveClass("text-foreground");
    expect(focus).not.toHaveClass("text-state-pause");
    expect(rate).toHaveClass("text-primary");
  });

  it("비집중이면 집중률만 주황으로 칠한다", () => {
    const { total, focus, rate } = renderCard("distract");

    expect(total).toHaveClass("text-foreground");
    expect(focus).not.toHaveClass("text-state-pause");
    expect(rate).toHaveClass("text-state-distract");
  });

  it("일시정지면 오늘 공부시간·순공시간·집중률을 모두 회색으로 칠한다", () => {
    const { total, focus, rate } = renderCard("pause");

    expect(total).toHaveClass("text-state-pause");
    expect(focus).toHaveClass("text-state-pause");
    expect(rate).toHaveClass("text-state-pause");
  });
});
