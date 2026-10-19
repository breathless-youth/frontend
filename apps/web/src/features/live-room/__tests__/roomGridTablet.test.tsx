import { createRef } from "react";

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RoomMember } from "@focusmakers/types";

import { RoomGrid } from "../components/RoomGrid";
import { roomGridSpec } from "../roomGrid";

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

function renderGrid(count: number) {
  return render(
    <RoomGrid
      grid={roomGridSpec(count)}
      allMembers={members(count)}
      userId={1}
      controlsVisible={true}
      selfState="FOCUS"
      focusSec={0}
      cameraOn={false}
      myVideo={<div />}
      remoteStreams={new Map()}
      selfSurfaceRef={createRef<HTMLDivElement>()}
    />,
  );
}

const tileSize = () =>
  screen.getByTestId("room-grid-rows").style.getPropertyValue("--room-tile-size");
const gridWidth = () =>
  screen.getByTestId("room-grid-rows").style.getPropertyValue("--room-grid-width");

describe("RoomGrid 태블릿 격자", () => {
  afterEach(() => vi.unstubAllGlobals());

  // jsdom은 클래스의 여백을 계산하지 않아 측정기가 여백을 뺀 칸 크기를 바로 준다.
  it("가로 1180×820에서 4명은 2열 344px이다", () => {
    stubResizeObserver(1148, 692);
    renderGrid(4);

    expect(tileSize()).toBe("344px");
    expect(gridWidth()).toBe("692px");
  });

  it("가로 6명은 3열이라 한 줄 폭이 타일 세 장과 간격 둘이다", () => {
    stubResizeObserver(1148, 692);
    renderGrid(6);

    expect(tileSize()).toBe("344px");
    expect(gridWidth()).toBe("1040px");
  });

  it("세로 820×1180에서 3명은 2열 392px이다", () => {
    stubResizeObserver(788, 1052);
    renderGrid(3);

    expect(tileSize()).toBe("392px");
    expect(gridWidth()).toBe("788px");
  });

  it("재기 전에는 변수를 쓰지 않아 폰 배치를 그대로 쓴다", () => {
    renderGrid(4);

    expect(tileSize()).toBe("");
    expect(gridWidth()).toBe("");
  });
});
