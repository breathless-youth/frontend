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
    expect(container.querySelector("img")?.closest(".grayscale")).not.toBeNull();
  });

  it("빈자리는 마스코트를 줘도 점선 사람 그림 그대로다", () => {
    const { container } = render(<DeskFigure tone="empty" size="md" mascot="lamp" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("circle")).not.toBeNull();
  });

  it("입은 소품을 마스코트 위에 겹쳐 그린다", () => {
    const { container } = render(
      <DeskFigure
        tone="room"
        size="md"
        mascot="stopwatch"
        accessories={[{ slot: "head", code: "STOPWATCH_HEAD_CROWN", imageUrl: "/crown.png" }]}
      />,
    );
    const accessory = container.querySelector('[data-slot="accessory-head"]');
    expect(accessory).toHaveAttribute("src", "/crown.png");
    expect(container.querySelectorAll("img")).toHaveLength(2);
  });

  it("날개는 마스코트 뒤에, 머리 소품은 앞에 그린다", () => {
    const { container } = render(
      <DeskFigure
        tone="room"
        size="md"
        mascot="book"
        accessories={[
          { slot: "head", code: "BOOK_HEAD_BERET", imageUrl: "/beret.png" },
          { slot: "wings", code: "BOOK_WINGS_ANGEL", imageUrl: "/wings.png" },
        ]}
      />,
    );
    const order = Array.from(container.querySelectorAll("img"), (img) => img.getAttribute("src"));
    expect(order[0]).toBe("/wings.png");
    expect(order[2]).toBe("/beret.png");
  });
});
