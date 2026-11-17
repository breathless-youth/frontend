import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InfoTooltip } from "../InfoTooltip";
import type * as TooltipModule from "../tooltip";

/** 말풍선 본문이 Radix에 넘긴 자리 잡기 값 */
const placed: ComponentProps<typeof TooltipModule.TooltipContent>[] = [];

vi.mock("../tooltip", async (importOriginal) => {
  const actual = await importOriginal<typeof TooltipModule>();
  const { forwardRef } = await import("react");
  const TooltipContent = forwardRef<HTMLDivElement, ComponentProps<typeof actual.TooltipContent>>(
    (props, ref) => {
      placed.push(props);
      return <actual.TooltipContent ref={ref} {...props} />;
    },
  );
  return { ...actual, TooltipContent };
});

afterEach(() => {
  placed.length = 0;
});

/** ⓘ를 눌러 연 말풍선 본문 */
async function open(name = "안내") {
  const trigger = screen.getByRole("button", { name });
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
  return screen.findByText("본문", { selector: "[data-state]" });
}

describe("ⓘ 말풍선 자리", () => {
  it("화면 양옆 16px 안에 머물고, 밀려도 ⓘ를 가리키는 꼬리를 단다", async () => {
    render(<InfoTooltip label="안내">본문</InfoTooltip>);

    const content = await open();

    expect(placed.at(-1)).toMatchObject({ collisionPadding: 16, arrowPadding: 12, sideOffset: 8 });
    // 지금 폭(262px)과 화면 폭에서 양옆 16px을 뺀 값 가운데 작은 값까지만 넓어진다.
    expect(content).toHaveClass("max-w-[min(16.375rem,calc(100vw-2rem))]");
    expect(content.querySelector("svg")).toHaveClass("fill-foreground");
  });

  it("경계를 따로 주면 그 경계에서 12px 안쪽에 머문다", async () => {
    const boundary = document.createElement("div");
    render(
      <InfoTooltip label="안내" collisionBoundary={boundary}>
        본문
      </InfoTooltip>,
    );

    await open();

    expect(placed.at(-1)).toMatchObject({ collisionPadding: 12 });
  });

  it("본문 바탕색을 바꾼 곳은 꼬리도 같은 색으로 칠한다", async () => {
    render(
      <InfoTooltip
        label="안내"
        contentClassName="bg-(--session-dialog-cancel-bg) text-white"
        arrowClassName="fill-(--session-dialog-cancel-bg)"
      >
        본문
      </InfoTooltip>,
    );

    const content = await open();

    expect(content.querySelector("svg")).toHaveClass("fill-(--session-dialog-cancel-bg)");
    expect(content.querySelector("svg")).not.toHaveClass("fill-foreground");
  });
});
