import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RoomTile } from "../components/RoomTile";

describe("RoomTile 폴백", () => {
  it("nickname·studySeconds가 없으면 이름을 생략하고 시간은 --:--로 보여준다", () => {
    render(<RoomTile member={{ userId: 8, cameraOn: false, focusState: "FOCUS" }} />);

    expect(screen.getByTestId("room-tile")).toHaveTextContent("--:--");
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });

  it("필드가 있으면 기존처럼 전부 표시한다", () => {
    render(
      <RoomTile
        member={{
          userId: 8,
          cameraOn: true,
          focusState: "FOCUS",
          nickname: "포메1",
          goal: "목표",
          studySeconds: 3660,
        }}
      />,
    );

    expect(screen.getByText("포메1")).toBeInTheDocument();
    expect(screen.getByText("01:01")).toBeInTheDocument();
  });
});
