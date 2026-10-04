import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RhythmCard } from "../RhythmCard";

describe("RhythmCard — 나의 공부 리듬 예상 화면", () => {
  it("제목과 준비 중 칩, 가운데 안내 문구를 보여준다", () => {
    render(<RhythmCard />);

    expect(screen.getByRole("heading", { name: "나의 공부 리듬" })).toBeInTheDocument();
    expect(screen.getByText("집중 리포트 준비 중")).toBeInTheDocument();
    expect(screen.getByText("기록이 쌓이면 나의 공부 리듬을 알려드려요")).toBeInTheDocument();
    expect(
      screen.getByText("요일 × 시간대로 언제 가장 집중하는지 보여드릴게요"),
    ).toBeInTheDocument();
  });

  it("예시 히트맵(요일 7 × 시간 24)은 장식이라 보조 기술에서 숨긴다", () => {
    const { container } = render(<RhythmCard />);

    const ghost = container.querySelector('[aria-hidden="true"]');
    expect(ghost).not.toBeNull();
    expect(ghost?.querySelectorAll(".h-\\[18px\\]")).toHaveLength(7 * 24);
  });
});
