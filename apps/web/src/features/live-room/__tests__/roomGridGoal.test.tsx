import { createRef } from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RoomMember } from "@focusmakers/types";

import { RoomGrid } from "../components/RoomGrid";

const MEMBER_IDS = [1, 2, 3];

function members(): RoomMember[] {
  return MEMBER_IDS.map((userId) => ({
    userId,
    cameraOn: false,
    focusState: "FOCUS",
    nickname: `멤버${userId}`,
    goal: `목표${userId}`,
  }));
}

function renderGrid(variant: "invite" | "group", goalHidden?: boolean) {
  return render(
    <RoomGrid
      allMembers={members()}
      userId={1}
      myVideo={<div />}
      remoteStreams={new Map()}
      selfSurfaceRef={createRef<HTMLDivElement>()}
      variant={variant}
      goalHidden={goalHidden}
    />,
  );
}

// 초대코드 방과 그룹 공부방이 같은 타일을 쓰므로 두 배치 모두에서 같은 값이 모든 타일에 닿는다.
describe.each(["invite", "group"] as const)("RoomGrid %s 목표 문구 내리기", (variant) => {
  it("goalHidden이면 모든 타일의 목표 문구가 내려가고 닉네임은 남는다", () => {
    renderGrid(variant, true);

    for (const userId of MEMBER_IDS) {
      expect(screen.getByText(`목표${userId}`)).toHaveAttribute("data-hidden", "true");
      expect(screen.getByText(`멤버${userId}`).closest("[data-hidden]")).toBeNull();
    }
  });

  it("넘기지 않으면 모든 타일의 목표 문구가 올라와 있다", () => {
    renderGrid(variant);

    for (const userId of MEMBER_IDS) {
      expect(screen.getByText(`목표${userId}`)).not.toHaveAttribute("data-hidden");
    }
  });
});
