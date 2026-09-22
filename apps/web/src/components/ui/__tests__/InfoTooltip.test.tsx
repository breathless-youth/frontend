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

  it("hover로 열리지 않는다 — 마우스 위에서 클릭이 토글로 닫아 깜빡이는 것을 막는다", () => {
    render(<InfoTooltip label="안내">본문</InfoTooltip>);
    const trigger = screen.getByRole("button", { name: "안내" });

    fireEvent.pointerMove(trigger);
    expect(screen.queryByText("본문", CONTENT_QUERY)).not.toBeInTheDocument();
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
