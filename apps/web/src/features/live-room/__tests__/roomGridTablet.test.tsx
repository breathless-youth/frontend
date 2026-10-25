import { Profiler, createRef } from "react";
import type { ReactNode } from "react";

import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RoomMember } from "@focusmakers/types";

import { RoomGrid } from "../components/RoomGrid";

function members(count: number): RoomMember[] {
  return Array.from({ length: count }, (_, index) => ({
    userId: index + 1,
    cameraOn: false,
    focusState: "FOCUS",
    nickname: `멤버${index + 1}`,
  }));
}

/** observe하자마자 바깥 상자 크기를 한 번 알려 주는 측정기 */
function stubResizeObserver(inlineSize: number, blockSize: number) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      readonly callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe() {
        this.callback(
          [{ borderBoxSize: [{ inlineSize, blockSize }] } as unknown as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      disconnect() {}
    },
  );
}

/** 콜백을 붙잡아 두었다가 테스트가 원할 때 크기를 알려 주는 측정기 */
function stubManualResizeObserver() {
  let notify: ((inlineSize: number, blockSize: number) => void) | undefined;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      readonly callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe() {
        notify = (inlineSize, blockSize) =>
          this.callback(
            [{ borderBoxSize: [{ inlineSize, blockSize }] } as unknown as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
      }
      disconnect() {}
    },
  );
  return (inlineSize: number, blockSize: number) => act(() => notify?.(inlineSize, blockSize));
}

function renderGrid(count: number, wrapper?: (props: { children: ReactNode }) => ReactNode) {
  return render(
    <RoomGrid
      allMembers={members(count)}
      userId={1}
      myVideo={<div />}
      remoteStreams={new Map()}
      selfSurfaceRef={createRef<HTMLDivElement>()}
    />,
    { wrapper },
  );
}

const tileSize = () =>
  screen.getByTestId("room-grid-rows").style.getPropertyValue("--room-tile-size");
const gridWidth = () =>
  screen.getByTestId("room-grid-rows").style.getPropertyValue("--room-grid-width");

describe("RoomGrid 태블릿 격자", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // jsdom은 클래스의 여백을 계산하지 않아 측정기가 여백을 뺀 칸 크기를 바로 준다.
  it("가로 1180×820에서 4명은 2열 342px이다", () => {
    stubResizeObserver(1148, 692);
    renderGrid(4);

    expect(tileSize()).toBe("342px");
    expect(gridWidth()).toBe("692px");
  });

  it("가로 6명은 3열이라 한 줄 폭이 타일 세 장과 간격 둘이다", () => {
    stubResizeObserver(1148, 692);
    renderGrid(6);

    expect(tileSize()).toBe("342px");
    expect(gridWidth()).toBe("1042px");
  });

  // 세로는 위로 시간 글자와 과목 알약, 아래로 바 자리를 비워 위 122 · 아래 112를 뺀다.
  it.each([
    [2, "469px", "469px"],
    [3, "390px", "788px"],
    [6, "310px", "628px"],
  ])("세로 820×1180에서 %i명은 한 변 %s이다", (count, size, width) => {
    stubResizeObserver(788, 946);
    renderGrid(count);

    expect(tileSize()).toBe(size);
    expect(gridWidth()).toBe(width);
  });

  // 짧은 변이 1000 이상인 창은 아래를 136 비우고, 세로에서는 위를 148 비운다.
  it("큰 태블릿 가로 1376×1032에서 6명은 3열 436px이다", () => {
    stubResizeObserver(1344, 880);
    renderGrid(6);

    expect(tileSize()).toBe("436px");
    expect(gridWidth()).toBe("1324px");
  });

  it("큰 태블릿 세로 1032×1376에서 6명은 2열 358px이다", () => {
    stubResizeObserver(1000, 1092);
    renderGrid(6);

    expect(tileSize()).toBe("358px");
    expect(gridWidth()).toBe("724px");
  });

  it("측정기 콜백이 오기 전에도 마운트 직후 칸을 재서 변수를 쓴다", () => {
    // 기본 측정기는 콜백을 부르지 않는다.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ width: 1148, height: 692 }),
    );
    renderGrid(4);

    expect(tileSize()).toBe("342px");
    expect(gridWidth()).toBe("692px");
  });

  it("측정기가 바깥 상자 크기를 주지 않으면 대상 요소를 직접 잰다", () => {
    let observed = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() =>
      DOMRect.fromRect(observed ? { width: 1148, height: 692 } : { width: 0, height: 0 }),
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        readonly callback: ResizeObserverCallback;
        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
        }
        observe(target: Element) {
          observed = true;
          this.callback(
            [{ target } as unknown as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
        }
        disconnect() {}
      },
    );
    renderGrid(4);

    expect(tileSize()).toBe("342px");
    expect(gridWidth()).toBe("692px");
  });

  it("같은 크기를 다시 알려 주면 다시 그리지 않는다", () => {
    const notify = stubManualResizeObserver();
    const onRender = vi.fn();
    renderGrid(4, ({ children }) => (
      <Profiler id="room-grid" onRender={onRender}>
        {children}
      </Profiler>
    ));
    notify(1148, 692);
    // React는 갱신 직후 같은 값 하나는 한 번 그려 본 뒤에야 건너뛴다.
    notify(1148, 692);
    const commits = onRender.mock.calls.length;

    notify(1148, 692);
    notify(1148, 692);

    expect(onRender).toHaveBeenCalledTimes(commits);
    expect(tileSize()).toBe("342px");
  });

  it("재기 전에는 변수를 쓰지 않아 폰 배치를 그대로 쓴다", () => {
    renderGrid(4);

    expect(tileSize()).toBe("");
    expect(gridWidth()).toBe("");
  });
});
