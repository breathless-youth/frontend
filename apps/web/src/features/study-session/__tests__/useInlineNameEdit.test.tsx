import { act, renderHook } from "@testing-library/react";
import type { KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { useInlineNameEdit } from "../subjectInteractions";

function setup() {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  const hook = renderHook(() => useInlineNameEdit({ maxLength: 3, onCommit, onCancel }));
  return { ...hook, onCommit, onCancel };
}

describe("useInlineNameEdit 한도", () => {
  it("한도를 넘으면 확정이 저장도 취소도 하지 않고, 줄이면 다시 확정된다", () => {
    const { result, onCommit, onCancel } = setup();
    act(() => result.current.setValue("가나다라"));
    expect(result.current.over).toBe(true);

    act(() => result.current.commit());
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    act(() => result.current.setValue("가나다"));
    expect(result.current.over).toBe(false);
    act(() => result.current.commit());
    expect(onCommit).toHaveBeenCalledWith("가나다");
  });

  it("한도를 넘어도 Escape는 취소한다", () => {
    const { result, onCancel } = setup();
    act(() => result.current.setValue("가나다라"));
    act(() => result.current.handleKeyDown({ key: "Escape" } as KeyboardEvent<HTMLInputElement>));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
