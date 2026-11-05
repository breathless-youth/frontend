import { createRef } from "react";

import { render, screen } from "@testing-library/react";
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

function groupGrid(count: number, capsuleShown: boolean) {
  return (
    <RoomGrid
      allMembers={members(count)}
      userId={1}
      myVideo={<div />}
      remoteStreams={new Map()}
      selfSurfaceRef={createRef<HTMLDivElement>()}
      variant="group"
      capsuleShown={capsuleShown}
    />
  );
}

function renderGroupGrid(count: number, capsuleShown: boolean) {
  return render(groupGrid(count, capsuleShown));
}

// jsdom은 미디어 쿼리로 배치를 계산하지 않아서 가로 폰에 걸리는 클래스를 본다.
function landscapeClasses(element: HTMLElement): string[] {
  return [...element.classList].filter((name) => name.startsWith("landscape-compact:"));
}

describe("RoomGrid 가로 폰의 타이머 캡슐 자리", () => {
  it("캡슐이 떠 있는 동안 폭과 상관없이 아래를 캡슐 띠만큼 비운다", () => {
    renderGroupGrid(2, true);

    const classes = landscapeClasses(screen.getByTestId("room-grid"));
    expect(classes).toContain("landscape-compact:pb-(--room-capsule-band)");
    expect(classes).not.toContain("landscape-compact:pb-2");
    // 캡슐이 바 위에 뜨는 좁은 가로 폰과 바 옆에 붙는 넓은 가로 폰이 각자 띠 높이를 갖는다.
    expect(classes.some((name) => name.startsWith("landscape-compact:[--room-capsule-band:"))).toBe(
      true,
    );
    expect(
      classes.some((name) => name.startsWith("landscape-compact:md:[--room-capsule-band:")),
    ).toBe(true);
  });

  it.each([1, 2, 3, 4, 5, 6])(
    "캡슐이 떠 있는 동안 %i명 타일은 캡슐 띠를 뺀 높이를 넘지 않는다",
    (count) => {
      renderGroupGrid(count, true);

      for (const tile of screen.getAllByTestId("room-tile")) {
        const height = landscapeClasses(tile).find((name) =>
          name.startsWith("landscape-compact:h-"),
        );
        expect(height).toContain("var(--room-capsule-band)");
      }
    },
  );

  it.each([5, 6])(
    "캡슐이 떠 있는 동안 %i명은 줄어든 타일 세 장 폭으로 줄을 묶어 3열을 지킨다",
    (count) => {
      renderGroupGrid(count, true);

      const width = landscapeClasses(screen.getByTestId("room-grid-rows")).find((name) =>
        name.startsWith("landscape-compact:max-w-"),
      );
      expect(width).toContain("var(--room-capsule-band)");
    },
  );

  it("캡슐이 없으면 아래 여백과 타일 높이가 캡슐 띠와 무관하다", () => {
    renderGroupGrid(2, false);

    expect(landscapeClasses(screen.getByTestId("room-grid"))).toContain("landscape-compact:pb-2");
    for (const tile of screen.getAllByTestId("room-tile")) {
      expect(tile.className).not.toContain("--room-capsule-band");
    }
  });
});

describe("RoomGrid 태블릿의 타이머 캡슐 자리", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("캡슐이 뜨면 바깥 상자가 그대로여도 줄어든 칸으로 타일 한 변을 다시 정한다", () => {
    // 기본 측정기는 콜백을 부르지 않아서 한 변은 직접 측정한 값에서만 나온다.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ width: 820, height: 1180 }),
    );
    // jsdom은 클래스의 여백을 계산하지 않아서 태블릿 세로 820×1180의 여백을 돌려준다.
    const computedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
      if (!(element instanceof HTMLElement) || element.dataset.testid !== "room-grid") {
        return computedStyle(element);
      }
      return {
        paddingTop: "146px",
        paddingLeft: "16px",
        paddingRight: "16px",
        paddingBottom: element.hasAttribute("data-capsule-reserved") ? "192px" : "132px",
      } as CSSStyleDeclaration;
    });
    const tileSize = () =>
      screen.getByTestId("room-grid-rows").style.getPropertyValue("--room-tile-size");
    const view = renderGroupGrid(2, false);
    expect(tileSize()).toBe("447px");

    view.rerender(groupGrid(2, true));

    expect(tileSize()).toBe("417px");
  });
});
