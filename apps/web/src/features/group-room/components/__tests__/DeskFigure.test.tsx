import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DeskFigure } from "../DeskFigure";

describe("DeskFigure", () => {
  it("마스코트를 주지 않으면 지금의 사람과 책상 그림이다", () => {
    const { container } = render(<DeskFigure tone="room" size="md" />);
    expect(container.querySelector("circle")).not.toBeNull();
    expect(container.querySelectorAll("path")).toHaveLength(3);
    expect(container.querySelector("img")).toBeNull();
  });

  it("마스코트를 주면 책상 없이 마스코트와 발밑 그림자만 그린다", () => {
    const { container } = render(<DeskFigure tone="room" size="md" mascot="lamp" />);
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("circle")).toBeNull();
    expect(container.querySelector("path")).toBeNull();
    expect(container.querySelector('[data-slot="mascot-shadow"]')).not.toBeNull();
  });

  it("쉬는 중에는 마스코트가 회색으로 보인다", () => {
    const { container } = render(<DeskFigure tone="rest" size="md" mascot="lamp" />);
    expect(container.querySelector("img")).toHaveClass("grayscale");
  });

  it("빈자리는 마스코트를 줘도 점선 사람 그림 그대로다", () => {
    const { container } = render(<DeskFigure tone="empty" size="md" mascot="lamp" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("circle")).not.toBeNull();
  });
});
