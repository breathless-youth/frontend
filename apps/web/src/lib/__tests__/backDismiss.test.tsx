import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useBackDismiss } from "../backDismiss";

/** 뒤로 가기를 누르고 popstate가 올 때까지 기다린다. */
async function pressBack() {
  await act(async () => {
    const arrived = new Promise((resolve) =>
      window.addEventListener("popstate", resolve, { once: true }),
    );
    window.history.back();
    await arrived;
  });
}

/** 예약해 둔 뒷정리와 그 뒤의 popstate까지 흘려보낸다. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

function marker(): unknown {
  return (window.history.state as { sheetBack?: number } | null)?.sheetBack;
}

afterEach(async () => {
  await settle();
});

describe("useBackDismiss", () => {
  it("열려 있을 때 뒤로 가기를 누르면 화면은 그대로 두고 닫기만 부른다", async () => {
    window.history.pushState({ idx: 3 }, "", "/points/accessories");
    const onClose = vi.fn();
    const view = renderHook(({ open }) => useBackDismiss(open, onClose), {
      initialProps: { open: true },
    });
    expect(marker()).toBeDefined();

    await pressBack();

    expect(onClose).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe("/points/accessories");
    expect(marker()).toBeUndefined();
    view.rerender({ open: false });
    await settle();
    // 닫힌 뒤에 기록을 한 번 더 되돌리지 않는다.
    expect(window.location.pathname).toBe("/points/accessories");
    expect((window.history.state as { idx?: number }).idx).toBe(3);
  });

  it("닫혀 있으면 기록에 아무것도 쌓지 않는다", () => {
    window.history.pushState({}, "", "/points");
    const before = window.history.length;
    renderHook(() => useBackDismiss(false, vi.fn()));
    expect(window.history.length).toBe(before);
    expect(marker()).toBeUndefined();
  });

  it("화면에서 닫으면 쌓아 둔 항목을 걷어 다음 뒤로 가기가 헛돌지 않는다", async () => {
    window.history.pushState({}, "", "/points/list");
    window.history.pushState({}, "", "/points/accessories");
    const onClose = vi.fn();
    const view = renderHook(({ open }) => useBackDismiss(open, onClose), {
      initialProps: { open: true },
    });

    view.rerender({ open: false });
    await settle();
    expect(marker()).toBeUndefined();
    expect(onClose).not.toHaveBeenCalled();

    await pressBack();
    expect(window.location.pathname).toBe("/points/list");
  });

  it("닫자마자 다른 화면으로 넘어가면 그 화면을 되돌리지 않고, 돌아올 때 남은 항목을 건너뛴다", async () => {
    window.history.pushState({}, "", "/points/list");
    window.history.pushState({}, "", "/points/earn");
    const view = renderHook(({ open }) => useBackDismiss(open, vi.fn()), {
      initialProps: { open: true },
    });

    view.rerender({ open: false });
    window.history.pushState({}, "", "/points/shop");
    await settle();
    expect(window.location.pathname).toBe("/points/shop");

    await pressBack();
    await settle();
    expect(window.location.pathname).toBe("/points/earn");
    expect(marker()).toBeUndefined();

    await pressBack();
    expect(window.location.pathname).toBe("/points/list");
  });

  it("시트 위에 시트가 열려 있으면 뒤로 가기 한 번에 위의 것만 닫는다", async () => {
    window.history.pushState({}, "", "/points/accessories");
    const closeLower = vi.fn();
    const closeUpper = vi.fn();
    renderHook(() => useBackDismiss(true, closeLower));
    renderHook(() => useBackDismiss(true, closeUpper));

    await pressBack();

    expect(closeUpper).toHaveBeenCalledOnce();
    expect(closeLower).not.toHaveBeenCalled();
  });
});
