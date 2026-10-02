import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InfoTooltip } from "../InfoTooltip";

const CONTENT_QUERY = { selector: "[data-state]" } as const;

describe("InfoTooltip", () => {
  it("탭 한 번으로 열리고, 열린 채로 다시 탭하면 닫힌다 — 터치의 pointerdown이 먼저 와도", async () => {
    render(<InfoTooltip label="안내">본문</InfoTooltip>);
    const trigger = screen.getByRole("button", { name: "안내" });

    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    expect(await screen.findByText("본문", CONTENT_QUERY)).toBeInTheDocument();

    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByText("본문", CONTENT_QUERY)).not.toBeInTheDocument();
  });

  it("pointerdown의 기본 동작을 막지 않는다 — 터치에서 뒤따르는 click이 살아 있어야 한다", () => {
    render(<InfoTooltip label="안내">본문</InfoTooltip>);
    const trigger = screen.getByRole("button", { name: "안내" });

    // jsdom에는 PointerEvent가 없다. React는 이벤트 타입 이름으로 핸들러를 고르므로 Event면 된다.
    const event = new Event("pointerdown", { bubbles: true, cancelable: true });
    trigger.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("hover로 열리지 않는다 — 마우스 위에서 클릭이 토글로 닫아 깜빡이는 것을 막는다", () => {
    render(<InfoTooltip label="안내">본문</InfoTooltip>);
    const trigger = screen.getByRole("button", { name: "안내" });

    fireEvent.pointerMove(trigger);
    expect(screen.queryByText("본문", CONTENT_QUERY)).not.toBeInTheDocument();
  });

  it(":focus-visible을 모르는 환경에서는 포커스로 열지 않는다 — 터치 탭이 깜빡이지 않게", () => {
    const matches = Element.prototype.matches;
    const patched = function patched(this: Element, selector: string) {
      if (selector === ":focus-visible") throw new SyntaxError("unsupported");
      return matches.call(this, selector);
    };
    Element.prototype.matches = patched as Element["matches"];
    try {
      render(<InfoTooltip label="안내">본문</InfoTooltip>);
      const trigger = screen.getByRole("button", { name: "안내" });
      act(() => trigger.focus());
      expect(screen.queryByText("본문", CONTENT_QUERY)).not.toBeInTheDocument();
    } finally {
      Element.prototype.matches = matches;
    }
  });

  it("키보드 포커스로 열리고 blur로 닫힌다", async () => {
    render(<InfoTooltip label="안내">본문</InfoTooltip>);
    const trigger = screen.getByRole("button", { name: "안내" });

    // 실제로 포커스를 옮겨야 :focus-visible 판정이 선다. fireEvent.focus는 이벤트만 흘린다.
    act(() => trigger.focus());
    expect(await screen.findByText("본문", CONTENT_QUERY)).toBeInTheDocument();

    act(() => trigger.blur());
    expect(screen.queryByText("본문", CONTENT_QUERY)).not.toBeInTheDocument();
  });
});
