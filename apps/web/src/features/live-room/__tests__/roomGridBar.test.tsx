import { createRef } from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RoomMember } from "@focusmakers/types";

import { RoomGrid } from "../components/RoomGrid";

function members(count: number): RoomMember[] {
  return Array.from({ length: count }, (_, index) => ({
    userId: index + 1,
    cameraOn: false,
    focusState: "FOCUS",
    nickname: `멤버${index + 1}`,
    goal: `목표${index + 1}`,
  }));
}

function renderGrid(
  variant: "invite" | "group",
  count: number,
  props: { barHidden?: boolean; capsuleShown?: boolean } = {},
) {
  return render(
    <RoomGrid
      allMembers={members(count)}
      userId={1}
      myVideo={<div />}
      remoteStreams={new Map()}
      selfSurfaceRef={createRef<HTMLDivElement>()}
      variant={variant}
      {...props}
    />,
  );
}

/** 이름 줄을 올린 타일이 몇 번째인지(0부터)를 순서대로 모은다. */
function liftedTileIndexes(): number[] {
  return screen
    .getAllByTestId("tile-info")
    .flatMap((info, index) => (info.hasAttribute("data-lifted") ? [index] : []));
}

// 초대코드 방과 그룹 공부방이 같은 타일을 쓰므로 두 배치 모두에서 같은 값이 모든 타일에 닿는다.
describe.each(["invite", "group"] as const)("RoomGrid %s 아래 바 상태", (variant) => {
  it("바가 내려가 있으면 모든 타일의 목표 문구가 내려가고 닉네임은 남는다", () => {
    renderGrid(variant, 3, { barHidden: true });

    for (const userId of [1, 2, 3]) {
      expect(screen.getByText(`목표${userId}`)).toHaveAttribute("data-hidden", "true");
      expect(screen.getByText(`멤버${userId}`).closest("[data-hidden]")).toBeNull();
    }
  });

  it("바가 내려가 있으면 모든 타일의 닉네임 줄이 목표 자리로 내려오고 아니면 제자리다", () => {
    const { unmount } = renderGrid(variant, 3, { barHidden: true });
    for (const userId of [1, 2, 3]) {
      expect(screen.getByText(`멤버${userId}`).closest("p")).toHaveAttribute(
        "data-dropped",
        "true",
      );
    }
    unmount();

    renderGrid(variant, 3);
    for (const userId of [1, 2, 3]) {
      expect(screen.getByText(`멤버${userId}`).closest("p")).not.toHaveAttribute("data-dropped");
    }
  });

  it("바가 내려가 있지 않으면 모든 타일의 목표 문구가 올라와 있다", () => {
    renderGrid(variant, 3);

    for (const userId of [1, 2, 3]) {
      expect(screen.getByText(`목표${userId}`)).not.toHaveAttribute("data-hidden");
    }
  });

  it.each([1, 2, 3])("바가 떠 있는 동안 %i명은 모든 타일의 이름 줄을 올린다", (count) => {
    renderGrid(variant, count);

    expect(liftedTileIndexes()).toEqual(Array.from({ length: count }, (_, index) => index));
  });

  // 4명은 타일이 작아 한 줄 아래 끝이 일반 가로 폰의 바 윗변보다 위에서 끝나 바가 닿지 않는다.
  it("바가 떠 있어도 4명은 바가 닿지 않으므로 이름 줄을 올리지 않는다", () => {
    renderGrid(variant, 4);

    expect(liftedTileIndexes()).toEqual([]);
  });

  // 가로에서 5~6명은 3열 2줄이고 아래 바는 맨 아랫줄만 덮는다.
  it.each([
    { count: 5, expected: [3, 4] },
    { count: 6, expected: [3, 4, 5] },
  ])("바가 떠 있는 동안 $count명은 맨 아랫줄만 올린다", ({ count, expected }) => {
    renderGrid(variant, count);

    expect(liftedTileIndexes()).toEqual(expected);
  });

  it("바가 내려가면 어느 타일도 이름 줄을 올리지 않는다", () => {
    renderGrid(variant, 2, { barHidden: true });

    expect(liftedTileIndexes()).toEqual([]);
  });
});

describe("RoomGrid 타이머 캡슐 띠", () => {
  it("캡슐 띠를 비운 그룹 공부방은 타일이 바 위에서 끝나서 바가 떠 있어도 이름 줄을 올리지 않는다", () => {
    renderGrid("group", 2, { capsuleShown: true });

    expect(liftedTileIndexes()).toEqual([]);
  });

  it("캡슐이 없으면 같은 그룹 공부방도 이름 줄을 올린다", () => {
    renderGrid("group", 2, { capsuleShown: false });

    expect(liftedTileIndexes()).toEqual([0, 1]);
  });
});
