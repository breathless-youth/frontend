import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FocusDeltaLabel } from "../FocusDeltaLabel";

describe("FocusDeltaLabel", () => {
  it("증가: 초록 토큰·▲·늘었어요", () => {
    render(<FocusDeltaLabel delta={3600} unit="주" />);
    const line = screen.getByText("▲ 지난주보다 1시간 늘었어요");
    expect(line).toHaveClass("text-feedback-success");
  });

  it("감소: 빨강 토큰·▼·줄었어요", () => {
    render(<FocusDeltaLabel delta={-3600} unit="달" />);
    const line = screen.getByText("▼ 지난달보다 1시간 줄었어요");
    expect(line).toHaveClass("text-feedback-danger");
  });

  it("증감이 0이면 문구를 아예 그리지 않는다(null 반환 — 빈 공간이 안 생긴다)", () => {
    const { container } = render(<FocusDeltaLabel delta={0} unit="주" />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/같아요/)).not.toBeInTheDocument();
  });
});
