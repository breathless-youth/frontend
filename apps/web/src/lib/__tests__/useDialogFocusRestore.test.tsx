import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useDialogFocusRestore } from "@/lib/useDialogFocusRestore";

function button(name: string) {
  const el = document.createElement("button");
  el.textContent = name;
  document.body.append(el);
  return el;
}

/** 열 때 `focused`에 포커스가 있던 것으로 두고 닫는다. */
function openThenClose(focused: HTMLElement | null, fallback?: () => HTMLElement | null) {
  const { result } = renderHook(() => useDialogFocusRestore(fallback));
  focused?.focus();
  result.current.onOpenAutoFocus();
  // 다이얼로그 안으로 포커스가 옮겨간 상태를 흉내 낸다.
  button("내용").focus();
  const event = new Event("focusout", { cancelable: true });
  result.current.onCloseAutoFocus(event);
  return event;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("useDialogFocusRestore", () => {
  it("열 때 포커스가 있던 요소가 남아 있으면 그 요소로 돌려준다", () => {
    const opener = button("열기");
    const fallback = button("대신");

    const event = openThenClose(opener, () => fallback);

    expect(event.defaultPrevented).toBe(true);
    expect(opener).toHaveFocus();
  });

  it("열었던 요소가 사라졌으면 대신 받을 요소로 보낸다", () => {
    const opener = button("열기");
    const fallback = button("대신");
    const { result } = renderHook(() => useDialogFocusRestore(() => fallback));
    opener.focus();
    result.current.onOpenAutoFocus();
    opener.remove();

    result.current.onCloseAutoFocus(new Event("focusout", { cancelable: true }));

    expect(fallback).toHaveFocus();
  });

  it("열 때 포커스가 body에 있었으면 대신 받을 요소로 보낸다", () => {
    const fallback = button("대신");

    openThenClose(document.body, () => fallback);

    expect(fallback).toHaveFocus();
  });

  it("대신 받을 요소가 없고 열었던 요소가 사라졌으면 포커스를 옮기지 않는다", () => {
    const opener = button("열기");
    const inside = button("남은 버튼");
    const { result } = renderHook(() => useDialogFocusRestore());
    opener.focus();
    result.current.onOpenAutoFocus();
    opener.remove();
    inside.focus();

    result.current.onCloseAutoFocus(new Event("focusout", { cancelable: true }));

    expect(inside).toHaveFocus();
  });
});
