import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RoomControlBar, roomBarButtonClassName } from "../components/RoomControlBar";

afterEach(cleanup);

function renderBar(props: { hidden?: boolean; inactive?: boolean } = {}) {
  render(
    <RoomControlBar cameraOn {...props} onToggleCamera={() => {}} onExit={() => {}}>
      <button type="button" aria-label="과목">
        과
      </button>
      <button type="button" aria-label="배경음">
        음
      </button>
    </RoomControlBar>,
  );
  return screen.getByTestId("room-control-bar");
}

describe("RoomControlBar 가운데 자리", () => {
  it("과목과 배경음 버튼은 받은 순서대로 카메라와 나가기 사이에 그린다", () => {
    const bar = renderBar();

    expect(
      within(bar)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["카메라 끄기", "과목", "배경음", "나가기"]);
  });

  it("바를 숨기면 가운데 버튼도 inert 안에 들어간다", () => {
    renderBar({ hidden: true });

    for (const name of ["과목", "배경음"]) {
      expect(screen.getByRole("button", { name, hidden: true }).closest("[inert]")).toBe(
        screen.getByTestId("room-control-bar"),
      );
    }
  });

  it("자리에 넣는 버튼 모양은 켜진 카메라 버튼과 같다", () => {
    renderBar();

    expect(screen.getByRole("button", { name: "카메라 끄기" })).toHaveClass(
      ...roomBarButtonClassName.split(" "),
    );
  });
});
