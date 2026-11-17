import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessorySlot } from "../../../types";
import { SlotChips } from "../SlotChips";

const SLOTS: AccessorySlot[] = [
  "set",
  "head",
  "face",
  "body",
  "wings",
  "held",
  "underfoot",
  "effect",
];
// 폭 360인 칩 줄에 폭 80인 칩이 88 간격으로 놓인 화면을 흉내 낸다(칩 줄 왼쪽 끝이 0).
const CHIP = 80;
const STEP = 88;

let scrollTo: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scrollTo = vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
    this.scrollLeft = options.left ?? this.scrollLeft;
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scrollTo });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(360);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.getAttribute("role") === "group") return new DOMRect(0, 0, 360, 44);
    const group = this.parentElement!;
    const index = Array.from(group.children).indexOf(this);
    return new DOMRect(index * STEP - group.scrollLeft, 0, CHIP, 44);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  Reflect.deleteProperty(window, "matchMedia");
});

describe("SlotChips", () => {
  it("처음 그릴 때 고른 칩이 줄 밖에 있으면 애니메이션 없이 보이는 자리로 민다", () => {
    render(<SlotChips slots={SLOTS} value="effect" onChange={vi.fn()} />);

    // 마지막 칩(616~696)의 오른쪽 끝이 줄 폭 360 안에 들어오게 민다.
    expect(scrollTo).toHaveBeenCalledWith({ left: 696 - 360, behavior: "auto" });
  });

  it("고른 칩이 이미 보이면 밀지 않는다", () => {
    render(<SlotChips slots={SLOTS} value="head" onChange={vi.fn()} />);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("고른 칩이 바뀌면 그 칩이 보이게 부드럽게 밀고 모션 축소면 바로 옮긴다", () => {
    const { rerender } = render(<SlotChips slots={SLOTS} value="head" onChange={vi.fn()} />);

    rerender(<SlotChips slots={SLOTS} value="underfoot" onChange={vi.fn()} />);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 608 - 360, behavior: "smooth" });

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: true }) as MediaQueryList,
    });
    rerender(<SlotChips slots={SLOTS} value="set" onChange={vi.fn()} />);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "auto" });
  });
});
