import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import book from "@/assets/points/mascot-book.png";

import { MascotFigure } from "../MascotFigure";

function layerOrder(container: HTMLElement) {
  return Array.from(container.querySelectorAll("[data-slot]"), (node) =>
    node.getAttribute("data-slot"),
  );
}

describe("MascotFigure", () => {
  it("소품이 없으면 마스코트 그림만 그린다", () => {
    const { container } = render(<MascotFigure id="book" />);

    expect(layerOrder(container)).toEqual(["mascot-body"]);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(book);
  });

  it("몸 뒤 소품, 마스코트, 몸 앞 소품 순서로 겹친다", () => {
    const { container } = render(
      <MascotFigure
        id="book"
        accessories={[
          { slot: "head", imageUrl: "/head.png" },
          { slot: "wings", imageUrl: "/wings.png" },
        ]}
      />,
    );

    expect(layerOrder(container)).toEqual(["accessory-wings", "mascot-body", "accessory-head"]);
  });

  it("몸 자리를 넘기면 기본 그림 대신 그 조각을 소품 사이에 그린다", () => {
    const { container } = render(
      <MascotFigure
        id="book"
        accessories={[{ slot: "head", imageUrl: "/head.png" }]}
        body={<span data-testid="custom-body" />}
      />,
    );

    expect(
      container.querySelector("[data-slot='mascot-body'] [data-testid='custom-body']"),
    ).not.toBeNull();
    expect(container.querySelector(`img[src='${book}']`)).toBeNull();
  });

  it("꾸밈 그림이라 화면 낭독기에서 뺀다", () => {
    const { container } = render(<MascotFigure id="book" />);

    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });
  it("소품 그림은 마스코트 판보다 사방으로 넓은 판에 그린다", () => {
    const { container } = render(
      <MascotFigure id="book" accessories={[{ slot: "head", imageUrl: "/head.png" }]} />,
    );

    const layer = container.querySelector<HTMLElement>("[data-slot='accessory-head']");
    expect(layer?.style.inset).toBe("-20.3125%");
    expect(container.querySelector<HTMLElement>("[data-slot='mascot-body']")?.style.inset).toBe("");
  });

  it("세트를 입으면 낱개 소품은 그리지 않고 세트의 뒤, 몸, 앞, 효과 순서로 그린다", () => {
    const { container } = render(
      <MascotFigure
        id="book"
        accessories={[
          { slot: "head", imageUrl: "/head.png" },
          {
            slot: "set",
            imageUrl: "/set.png",
            backImageUrl: "/set-back.png",
            effectImageUrl: "/set-fx.png",
          },
        ]}
      />,
    );

    expect(layerOrder(container)).toEqual([
      "accessory-set-back",
      "mascot-body",
      "accessory-set",
      "accessory-set-effect",
    ]);
  });

  it("조각 정보가 있으면 효과 그림을 조각마다 잘라 움직임을 붙인다", () => {
    const { container } = render(
      <MascotFigure
        id="book"
        accessories={[
          {
            slot: "effect",
            imageUrl: "/fx.png",
            effectPieces: [
              { x: 0.1, y: 0.2, width: 0.2, height: 0.25, motion: "twinkle" },
              { x: 0.6, y: 0.5, width: 0.1, height: 0.1, motion: "모르는 움직임" },
            ],
          },
        ]}
      />,
    );

    const pieces = container.querySelectorAll<HTMLElement>("[data-effect-piece]");
    expect(pieces).toHaveLength(2);
    expect(pieces[0].style.left).toBe("10%");
    expect(pieces[0].style.width).toBe("20%");
    expect(pieces[0].style.backgroundSize).toBe("500% 400%");
    expect(pieces[0].style.backgroundPosition).toBe("12.5% 26.6667%");
    expect(pieces[0].getAttribute("data-effect-piece")).toBe("twinkle");
    expect(pieces[1].getAttribute("data-effect-piece")).toBe("still");
    expect(container.querySelector("img[src='/fx.png']")).toBeNull();
  });

  it("코드로 그리는 빛 효과는 몸 뒤에 마스코트 윤곽을 따라 그린다", () => {
    const { container } = render(
      <MascotFigure id="book" accessories={[{ slot: "effect", effectType: "aurora" }]} />,
    );

    expect(layerOrder(container)).toEqual(["mascot-glow", "mascot-body"]);
    const glow = container.querySelector<HTMLElement>("[data-slot='mascot-glow']");
    expect(glow?.getAttribute("data-glow")).toBe("aurora");
    expect(glow?.querySelector<HTMLElement>("[data-glow-shape]")?.style.maskImage).toContain(book);
  });

  it("모르는 빛 효과는 그리지 않는다", () => {
    const { container } = render(
      <MascotFigure id="book" accessories={[{ slot: "effect", effectType: "sparkle-storm" }]} />,
    );

    expect(layerOrder(container)).toEqual(["mascot-body"]);
  });
});
