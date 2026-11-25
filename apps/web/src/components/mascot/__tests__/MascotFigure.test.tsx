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

  it("소품 그림은 전역 img의 폭 제한을 받지 않는다", () => {
    const { container } = render(
      <MascotFigure id="book" accessories={[{ slot: "head", imageUrl: "/head.png" }]} />,
    );

    // 넓은 판(140.625%)이 상자 폭으로 잘리면 소품이 가로로 눌려 그려진다.
    expect(container.querySelector('[data-slot="accessory-head"]')?.className).toContain(
      "max-w-none",
    );
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

  it("세트를 입으면 낱개 소품은 그리지 않고 세트의 효과, 뒤, 몸, 앞 순서로 그린다", () => {
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
      "accessory-set-effect",
      "accessory-set-back",
      "mascot-body",
      "accessory-set",
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

  it("뒤 그림이 따로 온 날개는 본체를 몸 뒤에, 앞 조각을 몸 앞에 그린다", () => {
    const { container } = render(
      <MascotFigure
        id="book"
        accessories={[{ slot: "wings", imageUrl: "/straps.png", backImageUrl: "/bag.png" }]}
      />,
    );

    expect(layerOrder(container)).toEqual([
      "accessory-wings-back",
      "mascot-body",
      "accessory-wings",
    ]);
    expect(container.querySelector("[data-slot='accessory-wings-back']")).toHaveAttribute(
      "src",
      "/bag.png",
    );
  });

  it("뒤 그림만 있는 효과는 몸 뒤에서 조각마다 움직인다", () => {
    const { container } = render(
      <MascotFigure
        id="book"
        accessories={[
          {
            slot: "effect",
            backImageUrl: "/aura.png",
            effectPieces: [{ x: 0, y: 0, width: 0.5, height: 0.5, motion: "pulse" }],
          },
        ]}
      />,
    );

    expect(layerOrder(container)).toEqual(["accessory-effect-back", "mascot-body"]);
    const piece = container.querySelector<HTMLElement>("[data-effect-piece]");
    expect(piece?.getAttribute("data-effect-piece")).toBe("pulse");
    expect(piece?.style.backgroundImage).toContain("/aura.png");
    expect(piece?.className).toContain("motion-reduce:animate-none");
  });

  it("뒤 그림만 있고 조각이 없는 효과는 통째로 떠오르내리고 모션 축소에서는 멈춘다", () => {
    const { container } = render(
      <MascotFigure id="book" accessories={[{ slot: "effect", backImageUrl: "/backdrop.png" }]} />,
    );

    const layer = container.querySelector<HTMLElement>("[data-slot='accessory-effect-back']");
    expect(layer).toHaveAttribute("src", "/backdrop.png");
    expect(layer?.className).toContain("mascot-effect-float");
    expect(layer?.className).toContain("motion-reduce:animate-none");
  });

  it("앞뒤 그림이 다 있는 효과의 뒤 그림은 움직이지 않는다", () => {
    const { container } = render(
      <MascotFigure
        id="book"
        accessories={[{ slot: "effect", imageUrl: "/stars.png", backImageUrl: "/sky.png" }]}
      />,
    );

    // 효과는 몸을 가리지 않게 앞 그림까지 몸 뒤에 둔다.
    expect(layerOrder(container)).toEqual([
      "accessory-effect-back",
      "accessory-effect",
      "mascot-body",
    ]);
    expect(container.querySelector("[data-slot='accessory-effect-back']")?.className).not.toContain(
      "mascot-effect-float",
    );
    expect(container.querySelector("[data-slot='accessory-effect']")?.className).toContain(
      "mascot-effect-float",
    );
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

  it("소품 층 상자를 넘기면 몸 뒤 층과 몸 앞 층을 따로 감싸고 몸은 감싸지 않는다", () => {
    const { container } = render(
      <MascotFigure
        id="book"
        accessories={[
          { slot: "head", imageUrl: "/head.png" },
          { slot: "wings", imageUrl: "/wings.png" },
          { slot: "effect", effectType: "glow" },
        ]}
        layerFrame={{ className: "tilt", style: { transform: "rotate(-6deg)" } }}
      />,
    );

    const frames = container.querySelectorAll<HTMLElement>("[data-layer-frame]");
    expect(Array.from(frames, (frame) => frame.getAttribute("data-layer-frame"))).toEqual([
      "behind",
      "front",
    ]);
    for (const frame of frames) {
      expect(frame.className).toContain("tilt");
      expect(frame.style.transform).toBe("rotate(-6deg)");
    }
    expect(layerOrder(frames[0])).toEqual(["mascot-glow", "accessory-wings"]);
    expect(layerOrder(frames[1])).toEqual(["accessory-head"]);
    expect(container.querySelector("[data-layer-frame] [data-slot='mascot-body']")).toBeNull();
    expect(layerOrder(container)).toEqual([
      "mascot-glow",
      "accessory-wings",
      "mascot-body",
      "accessory-head",
    ]);
  });

  it("소품 층 상자를 넘겨도 비어 있는 쪽은 상자를 만들지 않는다", () => {
    const { container } = render(
      <MascotFigure id="book" layerFrame={{ style: { transform: "rotate(-6deg)" } }} />,
    );

    expect(container.querySelector("[data-layer-frame]")).toBeNull();
  });

  it("모르는 빛 효과는 그리지 않는다", () => {
    const { container } = render(
      <MascotFigure id="book" accessories={[{ slot: "effect", effectType: "sparkle-storm" }]} />,
    );

    expect(layerOrder(container)).toEqual(["mascot-body"]);
  });
});
