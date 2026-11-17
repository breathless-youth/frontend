import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SpotlightDim } from "../SpotlightDim";

function targetAt(rect: DOMRect) {
  const element = document.createElement("div");
  element.getBoundingClientRect = () => rect;
  return { current: element };
}

describe("SpotlightDim", () => {
  it("구멍마다 여백을 더한 자리를 마스크에서 뚫고 알약 모양은 높이 절반으로 둥글린다", () => {
    const ref = targetAt(new DOMRect(100, 200, 80, 16));
    const { container } = render(
      <SpotlightDim holes={[{ ref, padX: 14, padY: 8, radius: 9999 }]} opacity={0.6} />,
    );
    const hole = container.querySelector("[data-hole]")!;
    expect(hole.getAttribute("x")).toBe("86");
    expect(hole.getAttribute("y")).toBe("192");
    expect(hole.getAttribute("width")).toBe("108");
    expect(hole.getAttribute("height")).toBe("32");
    expect(hole.getAttribute("rx")).toBe("16");
  });

  it("구멍 둘을 한 덮개에 함께 뚫는다", () => {
    const { container } = render(
      <SpotlightDim
        holes={[
          { ref: targetAt(new DOMRect(0, 0, 44, 44)), padX: 0, padY: 0, radius: 9999 },
          { ref: targetAt(new DOMRect(16, 22, 108, 144)), padX: 0, padY: 0, radius: 16 },
        ]}
        opacity={0.6}
      />,
    );
    expect(container.querySelectorAll("[data-hole]")).toHaveLength(2);
    expect(container.querySelectorAll("[data-dim]")).toHaveLength(1);
  });

  it("구멍이 없으면 화면 전체를 정해진 진하기로 덮는다", () => {
    const { container } = render(<SpotlightDim holes={[]} opacity={0.4} />);
    expect(container.querySelector("[data-dim]")).toHaveAttribute("fill-opacity", "0.4");
    expect(container.querySelector("[data-hole]")).toBeNull();
  });
});
