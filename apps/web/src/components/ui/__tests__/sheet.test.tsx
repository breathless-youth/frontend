import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Sheet, SheetContent, SheetTitle, sheetVariants } from "../sheet";

/**
 * 열린 상태로 그려도 닫힘용 클래스는 className 문자열에 그대로 들어 있다.
 * `data-[state=closed]:` 는 CSS 쪽 조건이라 실제 적용만 상태에 따라 갈린다.
 *
 * 닫는 모션이 끝난 뒤에 요소가 걷히는지는 여기서 확인할 수 없다. Radix 는
 * `getComputedStyle(node).animationName` 을 보는데 jsdom 은 CSS 를 계산하지 않아 늘
 * `none` 을 돌려주고, 그래서 애니메이션 유무와 상관없이 바로 언마운트된다.
 * 그 동작은 실제 브라우저에서 확인한다.
 */
function renderOpenSheet() {
  render(
    <Sheet open>
      <SheetContent side="right">
        <SheetTitle>배경음</SheetTitle>
      </SheetContent>
    </Sheet>,
  );

  const panel = screen.getByRole("dialog");
  const dim = document.querySelector<HTMLElement>('[data-state="open"]:not([role="dialog"])');

  if (dim === null) {
    throw new Error("딤을 찾지 못했다");
  }

  return { panel, dim };
}

describe("sheetVariants", () => {
  // 들어온 쪽과 나가는 쪽이 어긋나면 패널이 반대편으로 빨려 들어가듯 사라진다.
  // 네 방향에 각각 두 클래스라 좌우·상하를 바꿔 적기 쉬워 표로 돌린다.
  const sides = [
    { side: "top", opposite: "bottom" },
    { side: "bottom", opposite: "top" },
    { side: "left", opposite: "right" },
    { side: "right", opposite: "left" },
  ] as const;

  it.each(sides)("$side에서 들어온 패널은 $side로 나간다", ({ side, opposite }) => {
    const className = sheetVariants({ side });

    expect(className).toContain(`slide-in-from-${side}`);
    expect(className).toContain(`slide-out-to-${side}`);
    expect(className).not.toContain(`slide-in-from-${opposite}`);
    expect(className).not.toContain(`slide-out-to-${opposite}`);
  });
});

describe("Sheet 모션", () => {
  it("패널과 딤이 같은 시간 동안 움직인다", () => {
    const { panel, dim } = renderOpenSheet();

    expect(panel.className).toContain("duration-300");
    expect(dim.className).toContain("duration-300");
  });

  it("패널과 딤 모두 나가는 애니메이션을 가진다", () => {
    const { panel, dim } = renderOpenSheet();

    // 트랜지션이 아니라 애니메이션이어야 Radix 가 끝날 때까지 기다렸다 걷어낸다.
    expect(panel.className).toContain("data-[state=closed]:animate-out");
    expect(dim.className).toContain("data-[state=closed]:animate-out");
  });

  it("딤은 페이드만 하고 미끄러지지 않는다", () => {
    const { dim } = renderOpenSheet();

    expect(dim.className).toContain("data-[state=open]:fade-in-0");
    expect(dim.className).toContain("data-[state=closed]:fade-out-0");
    expect(dim.className).not.toContain("slide-in-from");
    expect(dim.className).not.toContain("slide-out-to");
  });
});
