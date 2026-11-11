import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DeskFigure } from "../DeskFigure";

describe("DeskFigure", () => {
  it("마스코트를 주지 않으면 지금의 사람 그림이다", () => {
    const { container } = render(<DeskFigure tone="room" size="md" />);
    expect(container.querySelector("circle")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("마스코트를 주면 사람 대신 마스코트 그림이 책상 위에 나온다", () => {
    const { container } = render(<DeskFigure tone="room" size="md" mascot="lamp" />);
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("circle")).toBeNull();
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
