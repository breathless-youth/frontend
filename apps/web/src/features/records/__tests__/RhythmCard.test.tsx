import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RhythmCard } from "../RhythmCard";

describe("RhythmCard", () => {
  it("제목·기준·준비 중 안내 문구를 표시한다", () => {
    render(<RhythmCard />);

    expect(screen.getByText("나의 공부 리듬")).toBeInTheDocument();
    expect(screen.getByText("최근 4주 기준")).toBeInTheDocument();
    expect(screen.getByText("공부 기록을 모으는 중이에요")).toBeInTheDocument();
  });

  it("플레이스홀더 막대 영역을 aria 라벨로 묶고 막대를 그린다", () => {
    render(<RhythmCard />);

    const bars = screen.getByRole("img", { name: "공부 기록을 모으는 중" });
    expect(bars).toBeInTheDocument();
    expect(bars.children.length).toBeGreaterThan(0);
  });
});
