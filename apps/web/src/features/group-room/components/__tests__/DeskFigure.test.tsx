import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MascotLook } from "@/components/mascot/types";

import { DeskFigure } from "../DeskFigure";

const lamp: MascotLook = { id: "lamp", accessories: [] };

const slot = (container: HTMLElement, name: string) =>
  container.querySelector(`[data-slot="${name}"]`);

describe("DeskFigure 사람 그림", () => {
  it("마스코트 자리가 아니면 지금의 사람과 책상 그림이다", () => {
    const { container } = render(<DeskFigure tone="room" size="md" />);
    expect(container.querySelector("circle")).not.toBeNull();
    expect(container.querySelectorAll("path")).toHaveLength(3);
    expect(container.querySelector("img")).toBeNull();
    expect(slot(container, "seat-lamp")).toBeNull();
  });

  it("마스코트 자리가 아니면 빈자리는 점선 사람 그림이다", () => {
    const { container } = render(<DeskFigure tone="empty" size="md" />);
    expect(container.querySelector("g")).toHaveAttribute("stroke-dasharray", "3 3");
    expect(container.querySelector("circle")).not.toBeNull();
    expect(slot(container, "vacant-mascot")).toBeNull();
  });
});

describe("DeskFigure 마스코트 자리", () => {
  it("마스코트를 주면 책상 없이 천장 전등, 마스코트, 바닥 그림자를 그린다", () => {
    const { container } = render(<DeskFigure tone="room" size="md" mascot={lamp} />);
    expect(container.querySelector("circle")).toBeNull();
    expect(slot(container, "seat-lamp")).not.toBeNull();
    expect(slot(container, "seat-shadow")).not.toBeNull();
    expect(slot(container, "mascot-body")?.querySelector("img")).not.toBeNull();
  });

  // 범례의 색과 같은 색으로 전등갓을 칠해 공부 상태를 알린다.
  it.each([
    ["room", "bg-primary"],
    ["elsewhere", "bg-feedback-success"],
  ] as const)("%s 상태는 전등이 켜지고 빛줄기가 내려온다", (tone, shade) => {
    const { container } = render(<DeskFigure tone={tone} size="md" mascot={lamp} />);
    expect(slot(container, "seat-lamp")).toHaveAttribute("data-lamp", "on");
    expect(slot(container, "seat-lamp")).toHaveClass(shade);
    expect(slot(container, "seat-light")).not.toBeNull();
  });

  it("쉬는 중에는 전등이 꺼지고 마스코트가 회색이며 쉼 표시를 둔다", () => {
    const { container } = render(<DeskFigure tone="rest" size="md" mascot={lamp} />);
    expect(slot(container, "seat-lamp")).toHaveAttribute("data-lamp", "off");
    expect(slot(container, "seat-light")).toBeNull();
    expect(container.querySelector("[data-resting]")).not.toBeNull();
    expect(container.querySelectorAll("text")).toHaveLength(2);
  });

  it("작은 자리에서는 쉼 표시를 그리지 않는다", () => {
    const { container } = render(<DeskFigure tone="rest" size="sm" mascot={lamp} />);
    expect(container.querySelector("text")).toBeNull();
  });

  it("마스코트 자리인데 모습이 비어 있으면 타이미를 앉힌다", () => {
    const { container } = render(<DeskFigure tone="room" size="md" mascotSeat />);
    expect(container.querySelector("circle")).toBeNull();
    expect(slot(container, "mascot-body")?.querySelector("img")?.getAttribute("src")).toContain(
      "stopwatch",
    );
  });

  it("빈자리는 꺼진 전등 아래 타이미 모양 동그란 점선 윤곽만 그리고 속은 비운다", () => {
    const { container } = render(<DeskFigure tone="empty" size="md" mascotSeat />);
    expect(slot(container, "seat-lamp")).toHaveAttribute("data-lamp", "off");
    expect(slot(container, "seat-light")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    const outline = slot(container, "vacant-mascot")?.querySelector("path");
    expect(outline).toHaveAttribute("fill", "none");
    // 점 수를 경로 길이로 두고 한 칸마다 점 하나를 찍어 점이 둘레를 고르게 나눈다.
    expect(outline).toHaveAttribute("stroke-dasharray", "0 1");
    expect(outline).toHaveAttribute("stroke-linecap", "round");
    expect(Number(outline?.getAttribute("pathLength"))).toBeGreaterThan(0);
  });

  it.each(["sm", "md", "lg"] as const)("빈자리 윤곽은 %s 크기에도 그린다", (size) => {
    const { container } = render(<DeskFigure tone="empty" size={size} mascotSeat />);
    expect(slot(container, "vacant-mascot")).not.toBeNull();
  });

  it("바닥 소품을 끼면 그림자 대신 바닥 소품을 그린다", () => {
    const { container } = render(
      <DeskFigure
        tone="room"
        size="md"
        mascot={{ id: "planner", accessories: [{ slot: "underfoot", imageUrl: "/mat.png" }] }}
      />,
    );
    expect(slot(container, "seat-shadow")).toBeNull();
    expect(slot(container, "accessory-underfoot")).toHaveAttribute("src", "/mat.png");
    expect(slot(container, "seat-light")).not.toBeNull();
  });

  it("세트를 입으면 함께 온 바닥 소품은 그리지 않으므로 그림자를 둔다", () => {
    const { container } = render(
      <DeskFigure
        tone="room"
        size="md"
        mascot={{
          id: "stopwatch",
          accessories: [
            { slot: "set", imageUrl: "/hero.png" },
            { slot: "underfoot", imageUrl: "/mat.png" },
          ],
        }}
      />,
    );
    expect(slot(container, "accessory-underfoot")).toBeNull();
    expect(slot(container, "seat-shadow")).not.toBeNull();
  });

  it("입은 소품을 마스코트 위에 겹쳐 그린다", () => {
    const { container } = render(
      <DeskFigure
        tone="room"
        size="md"
        mascot={{ id: "stopwatch", accessories: [{ slot: "head", imageUrl: "/crown.png" }] }}
      />,
    );
    expect(slot(container, "accessory-head")).toHaveAttribute("src", "/crown.png");
    expect(container.querySelectorAll("img")).toHaveLength(2);
  });

  it("날개는 마스코트 뒤에, 머리 소품은 앞에 그린다", () => {
    const { container } = render(
      <DeskFigure
        tone="room"
        size="md"
        mascot={{
          id: "book",
          accessories: [
            { slot: "head", imageUrl: "/beret.png" },
            { slot: "wings", imageUrl: "/wings.png" },
          ],
        }}
      />,
    );
    const order = Array.from(container.querySelectorAll("img"), (img) => img.getAttribute("src"));
    expect(order[0]).toBe("/wings.png");
    expect(order[2]).toBe("/beret.png");
  });
});
