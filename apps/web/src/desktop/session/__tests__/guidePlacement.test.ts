import { afterEach, describe, expect, it, vi } from "vitest";

import { GUIDE_CARD_WIDTH, guideCardPosition, spotOf } from "../guidePlacement";

const BOX = { width: 1200, height: 800 };

describe("guideCardPosition", () => {
  it("비출 자리가 없으면 가운데에 둔다", () => {
    expect(guideCardPosition(null, BOX)).toBeNull();
  });

  it("오른쪽 위 패널이면 패널 왼쪽에 위 끝을 맞춘다", () => {
    expect(guideCardPosition({ left: 776, top: 24, width: 400, height: 300 }, BOX)).toEqual({
      left: 776 - 16 - GUIDE_CARD_WIDTH,
      top: 24,
    });
  });

  it("아래쪽 반에 있으면 아래 끝을 맞춘다", () => {
    expect(guideCardPosition({ left: 888, top: 622, width: 288, height: 162 }, BOX)).toEqual({
      left: 888 - 16 - GUIDE_CARD_WIDTH,
      bottom: 16,
    });
  });

  it("왼쪽에 틈이 없으면 오른쪽에 두고 상자 안으로 당긴다", () => {
    expect(guideCardPosition({ left: 100, top: 24, width: 400, height: 300 }, BOX)).toEqual({
      left: 516,
      top: 24,
    });
    expect(guideCardPosition({ left: 100, top: 24, width: 1000, height: 300 }, BOX)).toEqual({
      left: 1200 - GUIDE_CARD_WIDTH - 16,
      top: 24,
    });
  });
});

describe("spotOf", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  function rect(left: number, top: number, width: number, height: number) {
    return {
      x: left,
      y: top,
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      toJSON() {},
    } as DOMRect;
  }

  it("상자 기준 자리를 재고, 막혔거나 크기가 없으면 없는 것으로 본다", () => {
    document.body.innerHTML = `
      <div id="box">
        <div data-pc-guide="stats"></div>
        <div inert><div data-pc-guide="camera"></div></div>
      </div>`;
    const box = document.getElementById("box") as HTMLElement;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.id === "box") return rect(100, 50, 1200, 800);
      return rect(900, 80, 300, 200);
    });

    expect(spotOf(box, "stats")).toEqual({ left: 800, top: 30, width: 300, height: 200 });
    expect(spotOf(box, "camera")).toBeNull();
    expect(spotOf(box, "controls")).toBeNull();
    expect(spotOf(box, null)).toBeNull();
  });
});
