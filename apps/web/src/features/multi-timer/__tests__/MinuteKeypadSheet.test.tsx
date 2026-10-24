import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MinuteKeypadSheet } from "../components/MinuteKeypadSheet";

function renderKeypad(kind: "focus" | "break", current: number) {
  const onApply = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <MinuteKeypadSheet
      open
      kind={kind}
      current={current}
      container={null}
      onApply={onApply}
      onOpenChange={onOpenChange}
    />,
  );
  return { onApply, onOpenChange };
}

function press(...keys: string[]) {
  for (const key of keys) {
    fireEvent.click(screen.getByRole("button", { name: key }));
  }
}

describe("MinuteKeypadSheet", () => {
  it("shows_title_range_and_current_value", () => {
    renderKeypad("focus", 25);

    expect(screen.getByRole("dialog", { name: "집중 시간" })).toBeInTheDocument();
    expect(screen.getByText("1–180분")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
  });

  it("break_shows_its_own_range", () => {
    renderKeypad("break", 5);

    expect(screen.getByRole("dialog", { name: "휴식 시간" })).toBeInTheDocument();
    expect(screen.getByText("1–60분")).toBeInTheDocument();
  });

  it("typing_digits_and_apply", () => {
    const { onApply, onOpenChange } = renderKeypad("focus", 25);

    press("4", "5");
    expect(screen.getByText("45")).toBeInTheDocument();
    press("확인");

    expect(onApply).toHaveBeenCalledWith(45);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("zero_or_empty_keeps_value", () => {
    const { onApply, onOpenChange } = renderKeypad("focus", 25);

    press("0", "확인");

    expect(onApply).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("leading_zero_is_dropped", () => {
    const { onApply } = renderKeypad("focus", 25);

    press("0", "7", "확인");

    expect(onApply).toHaveBeenCalledWith(7);
  });

  it("clamps_to_max", () => {
    const { onApply } = renderKeypad("break", 5);

    press("9", "9", "확인");

    expect(onApply).toHaveBeenCalledWith(60);
  });

  it("backspace_removes_digit", () => {
    const { onApply } = renderKeypad("focus", 25);

    press("4", "5", "지우기", "확인");

    expect(onApply).toHaveBeenCalledWith(4);
  });

  it("max_three_digits", () => {
    const { onApply } = renderKeypad("focus", 25);

    press("1", "2", "3", "4", "확인");

    expect(onApply).toHaveBeenCalledWith(123);
  });
});
