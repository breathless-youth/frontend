import { createRef } from "react";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RoomMember } from "@focusmakers/types";

import { RoomGrid } from "../components/RoomGrid";

const member: RoomMember = {
  userId: 1,
  cameraOn: false,
  focusState: "FOCUS",
  nickname: "홍길동",
};

function renderSolo(cameraOn: boolean) {
  const selfSurfaceRef = createRef<HTMLDivElement>();
  const view = render(
    <RoomGrid
      allMembers={[{ ...member, cameraOn }]}
      userId={1}
      myVideo={<div data-testid="my-video" />}
      remoteStreams={new Map()}
      selfSurfaceRef={selfSurfaceRef}
    />,
  );
  return { ...view, selfSurfaceRef };
}

describe("RoomGrid 1명", () => {
  it("풀스크린 대신 그리드 안에 내 타일 한 장을 그린다", () => {
    renderSolo(true);

    const tiles = within(screen.getByTestId("room-grid")).getAllByTestId("room-tile");
    expect(tiles).toHaveLength(1);
    expect(within(tiles[0] as HTMLElement).getByTestId("my-video")).toBeInTheDocument();
  });

  it("미리보기 비율을 재는 서피스가 내 타일이다", () => {
    const { selfSurfaceRef } = renderSolo(true);

    expect(selfSurfaceRef.current).toBe(screen.getByTestId("room-tile"));
  });

  it("카메라가 꺼지면 검은 화면 대신 내 닉네임 아바타를 그린다", () => {
    renderSolo(false);

    expect(screen.getByText("홍")).toBeInTheDocument();
    expect(screen.queryByTestId("my-video")).not.toBeInTheDocument();
  });
});
