import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RoomControlBar, roomBarButtonClassName } from "../components/RoomControlBar";

afterEach(cleanup);

function renderBar(props: { hidden?: boolean; inactive?: boolean } = {}) {
  render(
    <RoomControlBar
      cameraOn
      {...props}
      ambient={
        <button type="button" aria-label="배경음">
          음
        </button>
      }
      onToggleCamera={() => {}}
      onExit={() => {}}
    />,
  );
  return screen.getByTestId("room-control-bar");
}

describe("RoomControlBar 배경음 자리", () => {
  it("배경음 버튼은 카메라와 나가기 사이에 그린다", () => {
    const bar = renderBar();

    expect(
      within(bar)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["카메라 끄기", "배경음", "나가기"]);
  });

  it("바를 숨기면 배경음 버튼도 inert 안에 들어간다", () => {
    renderBar({ hidden: true });

    expect(screen.getByRole("button", { name: "배경음", hidden: true }).closest("[inert]")).toBe(
      screen.getByTestId("room-control-bar"),
    );
  });

  it("자리에 넣는 버튼 모양은 켜진 카메라 버튼과 같다", () => {
    renderBar();

    expect(screen.getByRole("button", { name: "카메라 끄기" })).toHaveClass(
      ...roomBarButtonClassName.split(" "),
    );
  });
});
