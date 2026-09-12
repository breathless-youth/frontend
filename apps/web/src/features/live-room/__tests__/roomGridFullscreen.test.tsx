import { createRef } from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RoomMember } from "@focusmakers/types";

import { RoomGrid } from "../components/RoomGrid";

const member: RoomMember = {
  userId: 1,
  cameraOn: false,
  focusState: "FOCUS",
  nickname: "홍길동",
};

function renderFullscreen(cameraOn: boolean) {
  const selfSurfaceRef = createRef<HTMLDivElement>();
  return render(
    <RoomGrid
      grid={{ mode: "fullscreen" }}
      allMembers={[{ ...member, cameraOn }]}
      userId={1}
      controlsVisible={true}
      selfState="FOCUS"
      focusSec={0}
      cameraOn={cameraOn}
      myVideo={<div data-testid="my-video" />}
      remoteStreams={new Map()}
      selfSurfaceRef={selfSurfaceRef}
    />,
  );
}

describe("RoomGrid 풀스크린(1인)", () => {
  it("카메라가 꺼지면 검은 화면 대신 내 닉네임 아바타를 그린다", () => {
    renderFullscreen(false);

    expect(screen.getByText("홍")).toBeInTheDocument();
    expect(screen.queryByTestId("my-video")).not.toBeInTheDocument();
  });

  it("카메라가 켜지면 내 영상을 그린다", () => {
    renderFullscreen(true);

    expect(screen.getByTestId("my-video")).toBeInTheDocument();
    expect(screen.queryByText("홍")).not.toBeInTheDocument();
  });
});
