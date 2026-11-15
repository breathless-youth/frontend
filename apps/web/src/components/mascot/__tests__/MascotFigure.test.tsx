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
});
