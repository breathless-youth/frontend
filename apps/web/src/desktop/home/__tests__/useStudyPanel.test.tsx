import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clampPanelPosition, useStudyPanel } from "../useStudyPanel";

class Pointer extends MouseEvent {
  readonly pointerId: number;
  constructor(type: string, options: PointerEventInit = {}) {
    super(type, options);
    this.pointerId = options.pointerId ?? 1;
  }
}

const KEY = "focusmakers.pc.studyPanel";
let boxSize = { width: 1200, height: 800 };
let panelHeight = 480;

/** jsdom에는 ResizeObserver가 없어, 지켜보는 콜백을 모아 두고 테스트가 크기 변화를 알린다. */
const resizeCallbacks = new Set<() => void>();
let observersCreated = 0;
class FakeResizeObserver {
  readonly #notify: () => void;
  constructor(callback: () => void) {
    this.#notify = callback;
    observersCreated += 1;
  }
  observe() {
    resizeCallbacks.add(this.#notify);
  }
  unobserve() {}
  disconnect() {
    resizeCallbacks.delete(this.#notify);
  }
}

function resizePanel(height: number) {
  panelHeight = height;
  act(() => {
    for (const notify of resizeCallbacks) notify();
  });
}

function Harness() {
  const { ref, right, top, minimized, toggleMinimized, handleProps } = useStudyPanel();
  return (
    <div data-testid="box">
      <section
        ref={ref}
        data-testid="panel"
        data-minimized={minimized}
        style={{ right: right, top: top }}
      >
        <div data-testid="handle" tabIndex={0} {...handleProps}>
          <button type="button" onClick={toggleMinimized}>
            접기
          </button>
        </div>
      </section>
    </div>
  );
}

function position() {
  const { right, top } = screen.getByTestId("panel").style;
  return { right, top };
}

function drag(from: [number, number], to: [number, number], target = screen.getByTestId("handle")) {
  fireEvent.pointerDown(target, { clientX: from[0], clientY: from[1], pointerId: 1, button: 0 });
  fireEvent.pointerMove(target, { clientX: to[0], clientY: to[1], pointerId: 1 });
  fireEvent.pointerUp(target, { clientX: to[0], clientY: to[1], pointerId: 1 });
}

beforeEach(() => {
  localStorage.clear();
  boxSize = { width: 1200, height: 800 };
  panelHeight = 480;
  resizeCallbacks.clear();
  observersCreated = 0;
  vi.stubGlobal("PointerEvent", Pointer);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const size =
      this.dataset.testid === "box"
        ? boxSize
        : { width: 400, height: this.dataset.minimized === "true" ? 52 : panelHeight };
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: size.width,
      bottom: size.height,
      ...size,
      toJSON() {},
    } as DOMRect;
  });
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useStudyPanel", () => {
  it("처음에는 상자 오른쪽에서 24, 위에서 24에 펼쳐져 있다", () => {
    render(<Harness />);

    expect(position()).toEqual({ right: "24px", top: "24px" });
    expect(screen.getByTestId("panel")).toHaveAttribute("data-minimized", "false");
  });

  it("머리줄을 끌면 따라온다", () => {
    render(<Harness />);

    drag([900, 40], [700, 140]);

    expect(position()).toEqual({ right: "224px", top: "124px" });
  });

  it("상자 가장자리 16px 안쪽까지만 움직인다", () => {
    render(<Harness />);

    drag([900, 40], [3000, -500]);
    expect(position()).toEqual({ right: "16px", top: "16px" });

    drag([900, 40], [-2000, 2000]);
    expect(position()).toEqual({ right: "784px", top: "304px" });
  });

  it("머리줄 안 버튼에서 시작한 누름은 끌지 않는다", () => {
    render(<Harness />);

    drag([900, 40], [700, 140], screen.getByRole("button", { name: "접기" }));

    expect(position()).toEqual({ right: "24px", top: "24px" });
  });

  it("창을 줄여 밖으로 나가면 안쪽으로 당기고 저장한 자리는 남긴다", () => {
    localStorage.setItem(KEY, JSON.stringify({ right: 700, top: 300, minimized: false }));
    render(<Harness />);
    expect(position()).toEqual({ right: "700px", top: "300px" });

    boxSize = { width: 900, height: 800 };
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(position()).toEqual({ right: "484px", top: "300px" });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ right: 700, top: 300 });
  });

  it("창을 줄였다가 다시 넓히면 사용자가 둔 자리로 돌아간다", () => {
    localStorage.setItem(KEY, JSON.stringify({ right: 700, top: 300, minimized: false }));
    render(<Harness />);

    boxSize = { width: 900, height: 800 };
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(position()).toEqual({ right: "484px", top: "300px" });

    boxSize = { width: 1200, height: 800 };
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(position()).toEqual({ right: "700px", top: "300px" });
  });

  it("내용이 늘어 패널 아래가 상자를 넘으면 위로 당기고, 줄면 사용자가 둔 자리로 돌아간다", () => {
    localStorage.setItem(KEY, JSON.stringify({ right: 24, top: 300, minimized: false }));
    render(<Harness />);
    expect(position()).toEqual({ right: "24px", top: "300px" });

    resizePanel(600);
    expect(position()).toEqual({ right: "24px", top: "184px" });

    resizePanel(480);
    expect(position()).toEqual({ right: "24px", top: "300px" });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ right: 24, top: 300 });
  });

  it("포인터 붙잡기를 잃으면 끌기를 끝내고 그 자리를 저장한다", () => {
    render(<Harness />);
    const handle = screen.getByTestId("handle");

    fireEvent.pointerDown(handle, { clientX: 900, clientY: 40, pointerId: 1, button: 0 });
    fireEvent.pointerMove(handle, { clientX: 700, clientY: 140, pointerId: 1 });
    fireEvent.lostPointerCapture(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 600, clientY: 240, pointerId: 1 });

    expect(position()).toEqual({ right: "224px", top: "124px" });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ right: 224, top: 124 });
  });

  it("마지막 움직임이 그려지기 전에 놓아도 마지막 자리를 저장한다", () => {
    render(<Harness />);
    const handle = screen.getByTestId("handle");
    fireEvent.pointerDown(handle, { clientX: 900, clientY: 40, pointerId: 1, button: 0 });

    // 한 act 안에서 보내 움직임과 놓기 사이에 다시 그리지 않는다.
    act(() => {
      handle.dispatchEvent(
        new Pointer("pointermove", { bubbles: true, clientX: 700, clientY: 140, pointerId: 1 }),
      );
      handle.dispatchEvent(
        new Pointer("pointerup", { bubbles: true, clientX: 700, clientY: 140, pointerId: 1 }),
      );
    });

    expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ right: 224, top: 124 });
    expect(position()).toEqual({ right: "224px", top: "124px" });
  });

  it("끄는 동안 크기 감시를 다시 만들지 않는다", () => {
    render(<Harness />);
    const created = observersCreated;
    const handle = screen.getByTestId("handle");

    fireEvent.pointerDown(handle, { clientX: 900, clientY: 40, pointerId: 1, button: 0 });
    for (const x of [880, 860, 840, 820]) {
      fireEvent.pointerMove(handle, { clientX: x, clientY: 40, pointerId: 1 });
    }
    fireEvent.pointerUp(handle, { clientX: 820, clientY: 40, pointerId: 1 });

    expect(position()).toEqual({ right: "104px", top: "24px" });
    expect(observersCreated).toBe(created);
  });

  it("당겨진 채 끌면 보이는 자리에서부터 따라온다", () => {
    localStorage.setItem(KEY, JSON.stringify({ right: 700, top: 300, minimized: false }));
    boxSize = { width: 900, height: 800 };
    render(<Harness />);
    expect(position()).toEqual({ right: "484px", top: "300px" });

    drag([500, 320], [600, 320]);

    expect(position()).toEqual({ right: "384px", top: "300px" });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ right: 384, top: 300 });
  });

  it("머리줄에 포커스가 있으면 방향키는 16px, Shift+방향키는 64px씩 옮긴다", () => {
    render(<Harness />);
    const handle = screen.getByTestId("handle");
    handle.focus();

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(position()).toEqual({ right: "40px", top: "24px" });

    fireEvent.keyDown(handle, { key: "ArrowDown", shiftKey: true });
    expect(position()).toEqual({ right: "40px", top: "88px" });

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowUp", shiftKey: true });
    expect(position()).toEqual({ right: "24px", top: "24px" });
  });

  it("머리줄 안 버튼에 포커스가 있을 때의 방향키로는 옮기지 않는다", () => {
    render(<Harness />);

    fireEvent.keyDown(screen.getByRole("button", { name: "접기" }), { key: "ArrowLeft" });

    expect(position()).toEqual({ right: "24px", top: "24px" });
  });

  it("옮긴 자리와 접힘을 이 브라우저에 기억한다", () => {
    const { unmount } = render(<Harness />);
    drag([900, 40], [700, 140]);
    fireEvent.click(screen.getByRole("button", { name: "접기" }));
    unmount();

    render(<Harness />);

    expect(position()).toEqual({ right: "224px", top: "124px" });
    expect(screen.getByTestId("panel")).toHaveAttribute("data-minimized", "true");
  });

  it("펼쳐 아래로 넘치면 안쪽으로 당긴다", () => {
    localStorage.setItem(KEY, JSON.stringify({ right: 24, top: 700, minimized: true }));
    render(<Harness />);
    expect(position()).toEqual({ right: "24px", top: "700px" });

    fireEvent.click(screen.getByRole("button", { name: "접기" }));

    expect(position()).toEqual({ right: "24px", top: "304px" });
  });

  it.each(["{", "null", JSON.stringify({ right: "a", top: 1, minimized: false })])(
    "저장값이 깨졌으면(%s) 기본 자리로 연다",
    (raw) => {
      localStorage.setItem(KEY, raw);

      render(<Harness />);

      expect(position()).toEqual({ right: "24px", top: "24px" });
    },
  );

  it("저장소를 못 쓰면 기본 자리로 열고 옮기기는 그대로 된다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<Harness />);
    expect(position()).toEqual({ right: "24px", top: "24px" });

    drag([900, 40], [700, 140]);

    expect(position()).toEqual({ right: "224px", top: "124px" });
  });
});

function TapHarness({ onTap }: { onTap: () => void }) {
  const { ref, right, top, handleProps } = useStudyPanel({
    storageKey: "focusmakers.test.window",
    tapSlop: 5,
    onTap,
  });
  return (
    <div data-testid="box">
      <section ref={ref} data-testid="panel" style={{ right, top }}>
        <div data-testid="handle" tabIndex={0} {...handleProps} />
      </section>
    </div>
  );
}

describe("useStudyPanel 누름과 끌기", () => {
  it("누름 거리 안에서 놓으면 옮기지 않고 누름으로 본다", () => {
    const onTap = vi.fn();
    render(<TapHarness onTap={onTap} />);

    drag([900, 40], [903, 44]);

    expect(onTap).toHaveBeenCalledTimes(1);
    expect(position()).toEqual({ right: "24px", top: "24px" });
  });

  it("누름 거리를 넘기면 끌기이고 누름으로 보지 않는다", () => {
    const onTap = vi.fn();
    render(<TapHarness onTap={onTap} />);

    drag([900, 40], [890, 40]);

    expect(onTap).not.toHaveBeenCalled();
    expect(position()).toEqual({ right: "34px", top: "24px" });
    expect(JSON.parse(localStorage.getItem("focusmakers.test.window") ?? "null")).toEqual({
      right: 34,
      top: 24,
      minimized: false,
    });
  });
});

describe("clampPanelPosition", () => {
  it("상자 크기를 아직 모르면 받은 자리를 그대로 둔다", () => {
    expect(
      clampPanelPosition(
        { right: 5, top: 5 },
        { width: 0, height: 0 },
        { width: 400, height: 480 },
      ),
    ).toEqual({ right: 5, top: 5 });
  });
});
