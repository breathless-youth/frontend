import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTO_HIDE_MS, useAutoHideControls } from "../useAutoHideControls";

/** 세션 화면처럼 화면 전체에 핸들러를 걸고, 조작 영역은 누름 버블을 끊고 숨으면 inert가 된다. */
function Harness({ alwaysVisible = false }: { alwaysVisible?: boolean }) {
  const { controlsVisible, surfaceProps } = useAutoHideControls(alwaysVisible);
  return (
    <main data-testid="surface" {...surfaceProps}>
      <div
        data-testid="controls"
        data-room-controls=""
        inert={!controlsVisible}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button type="button">조작</button>
      </div>
      <button type="button">조작 밖</button>
      <output data-testid="state">{controlsVisible ? "shown" : "hidden"}</output>
    </main>
  );
}

const state = () => screen.getByTestId("state").textContent;

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

// jsdom의 PointerEvent 폴백은 좌표를 싣지 않아 MouseEvent로 만들어 보낸다.
function press(target: Element, from: [number, number], to: [number, number] = from) {
  fireEvent(
    target,
    new MouseEvent("pointerdown", { bubbles: true, clientX: from[0], clientY: from[1] }),
  );
  fireEvent(target, new MouseEvent("pointerup", { bubbles: true, clientX: to[0], clientY: to[1] }));
}

const tapSurface = () => press(screen.getByTestId("surface"), [10, 10]);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAutoHideControls", () => {
  it("처음에는 보이고 마지막 조작 뒤 5초가 지나면 숨는다", () => {
    render(<Harness />);
    expect(state()).toBe("shown");

    advance(AUTO_HIDE_MS - 1);
    expect(state()).toBe("shown");

    advance(1);
    expect(state()).toBe("hidden");
  });

  it("숨은 상태의 탭은 조작을 보이고 다시 5초를 센다", () => {
    render(<Harness />);
    advance(AUTO_HIDE_MS);

    tapSurface();
    expect(state()).toBe("shown");

    advance(AUTO_HIDE_MS - 1);
    expect(state()).toBe("shown");
    advance(1);
    expect(state()).toBe("hidden");
  });

  it("보이는 상태의 탭은 바로 숨긴다", () => {
    render(<Harness />);

    tapSurface();
    expect(state()).toBe("hidden");
  });

  it("10px 넘게 움직인 누름은 탭이 아니다", () => {
    render(<Harness />);
    advance(AUTO_HIDE_MS);

    press(screen.getByTestId("surface"), [10, 10], [10, 21]);
    expect(state()).toBe("hidden");
  });

  it("조작 영역 안의 누름은 숨김을 뒤집지 않고 5초를 새로 센다", () => {
    render(<Harness />);
    advance(AUTO_HIDE_MS - 1000);

    press(screen.getByTestId("controls"), [10, 10]);
    expect(state()).toBe("shown");

    advance(AUTO_HIDE_MS - 1);
    expect(state()).toBe("shown");
    advance(1);
    expect(state()).toBe("hidden");
  });

  it("강제 표시 동안은 숨지 않고, 끝나면 보이는 상태에서 5초를 새로 센다", () => {
    const { rerender } = render(<Harness alwaysVisible />);

    advance(AUTO_HIDE_MS * 3);
    expect(state()).toBe("shown");

    rerender(<Harness />);
    advance(AUTO_HIDE_MS - 1);
    expect(state()).toBe("shown");
    advance(1);
    expect(state()).toBe("hidden");
  });

  it("숨은 채 강제 표시가 시작돼도 끝난 뒤에는 보이는 상태에서 시작한다", () => {
    const { rerender } = render(<Harness />);
    advance(AUTO_HIDE_MS);
    expect(state()).toBe("hidden");

    rerender(<Harness alwaysVisible />);
    expect(state()).toBe("shown");

    rerender(<Harness />);
    expect(state()).toBe("shown");
  });

  it("강제 표시 동안의 탭은 숨김 상태를 뒤집지 않는다", () => {
    const { rerender } = render(<Harness alwaysVisible />);

    tapSurface();
    rerender(<Harness />);
    expect(state()).toBe("shown");
  });

  it("키보드로 들어온 포커스가 조작 안에 있는 동안은 숨지 않고, 나간 뒤 5초에 숨는다", () => {
    render(<Harness />);
    const button = screen.getByRole("button", { name: "조작" });

    fireEvent.keyDown(window, { key: "Tab" });
    act(() => button.focus());
    advance(AUTO_HIDE_MS * 3);
    expect(state()).toBe("shown");

    act(() => button.blur());
    advance(AUTO_HIDE_MS - 1);
    expect(state()).toBe("shown");
    advance(1);
    expect(state()).toBe("hidden");
  });

  it("누름 뒤 스크립트가 조작에 돌려준 포커스는 숨김을 막지 않는다", () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: "Tab" });

    // 메뉴나 다이얼로그가 닫히며 Radix가 트리거로 포커스를 돌려주는 경우다.
    press(screen.getByTestId("controls"), [10, 10]);
    act(() => screen.getByRole("button", { name: "조작" }).focus());
    advance(AUTO_HIDE_MS);
    expect(state()).toBe("hidden");
  });

  it("숨은 상태에서 키를 누르면 보이고, 들어온 포커스가 숨김을 막는다", () => {
    render(<Harness />);
    advance(AUTO_HIDE_MS);
    expect(state()).toBe("hidden");
    expect(screen.getByTestId("controls")).toHaveAttribute("inert");

    fireEvent.keyDown(window, { key: "Tab" });
    expect(state()).toBe("shown");
    expect(screen.getByTestId("controls")).not.toHaveAttribute("inert");

    act(() => screen.getByRole("button", { name: "조작" }).focus());
    advance(AUTO_HIDE_MS * 3);
    expect(state()).toBe("shown");
  });

  it("키 입력으로 보인 조작도 5초 뒤에 숨는다", () => {
    render(<Harness />);
    advance(AUTO_HIDE_MS);

    fireEvent.keyDown(window, { key: "Tab" });
    advance(AUTO_HIDE_MS - 1);
    expect(state()).toBe("shown");
    advance(1);
    expect(state()).toBe("hidden");
  });

  it("보이는 상태의 키 입력은 5초를 새로 센다", () => {
    render(<Harness />);
    advance(AUTO_HIDE_MS - 1000);

    fireEvent.keyDown(window, { key: "Tab" });
    advance(AUTO_HIDE_MS - 1000);
    expect(state()).toBe("shown");
    advance(1000);
    expect(state()).toBe("hidden");
  });

  it("조작 밖의 포커스는 숨김을 막지 않는다", () => {
    render(<Harness />);

    act(() => screen.getByRole("button", { name: "조작 밖" }).focus());
    advance(AUTO_HIDE_MS);
    expect(state()).toBe("hidden");
  });

  it("언마운트하면 키 입력 감시를 정리한다", () => {
    const { unmount } = render(<Harness />);
    advance(AUTO_HIDE_MS);
    const remove = vi.spyOn(window, "removeEventListener");

    unmount();
    expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function));
    remove.mockRestore();
  });

  it("언마운트하면 숨김 타이머를 정리한다", () => {
    const { unmount } = render(<Harness />);
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
