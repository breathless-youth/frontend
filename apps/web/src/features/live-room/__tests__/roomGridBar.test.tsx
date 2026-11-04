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
});
