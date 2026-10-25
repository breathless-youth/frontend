import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RoomTile } from "../components/RoomTile";

describe("RoomTile 폴백", () => {
  it("nickname·focusSec가 없으면 이름을 생략하고 시간은 --:--로 보여준다", () => {
    render(<RoomTile member={{ userId: 8, cameraOn: false, focusState: "FOCUS" }} />);

    expect(screen.getByTestId("room-tile")).toHaveTextContent("--:--");
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });

  it("카메라를 끈 타일에서 이모지 닉네임 이니셜이 깨지지 않는다", () => {
    render(
      <RoomTile
        member={{
          userId: 8,
          cameraOn: false,
          focusState: "FOCUS",
          nickname: "🧑‍💻코딩",
        }}
      />,
    );

    expect(screen.getByText("🧑‍💻")).toBeInTheDocument();
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
          focusSec: 3660,
        }}
      />,
    );

    expect(screen.getByText("포메1")).toBeInTheDocument();
    expect(screen.getByText("01:01")).toBeInTheDocument();
  });
});

describe("RoomTile 상대 타일 시간 뱃지", () => {
  it("상대 타일은 순공 시간을 HH:MM으로 보여 준다", () => {
    render(
      <RoomTile member={{ userId: 8, cameraOn: true, focusState: "FOCUS", focusSec: 3725 }} />,
    );

    expect(screen.getByTestId("tile-time-badge")).toHaveTextContent("01:02");
  });

  it.each([
    ["FOCUS", { cameraOn: true, focusState: "FOCUS" }, "border-(--state-focus)", "집중 중"],
    [
      "DISTRACTED",
      { cameraOn: true, focusState: "DISTRACTED" },
      "border-(--state-distract)",
      "휴식",
    ],
    ["OFF", { cameraOn: false, focusState: "FOCUS" }, "border-(--text-tertiary)", "카메라 꺼짐"],
  ] as const)("%s 상태 테두리와 sr-only 상태 문구를 그린다", (state, fields, border, label) => {
    render(<RoomTile member={{ userId: 8, focusSec: 60, ...fields }} />);

    const badge = screen.getByTestId("tile-time-badge");
    expect(badge).toHaveAttribute("data-state", state);
    expect(badge).toHaveClass(border);
    expect(within(badge).getByText(label)).toHaveClass("sr-only");
    // 상태 문구는 뱃지 한 곳에만 있다.
    expect(screen.getAllByText(label)).toHaveLength(1);
  });

  it("focusSec가 아직 없으면 --:--다", () => {
    render(<RoomTile member={{ userId: 8, cameraOn: true, focusState: "FOCUS" }} />);

    expect(screen.getByTestId("tile-time-badge")).toHaveTextContent("--:--");
  });

  it("내 타일에는 뱃지가 없다", () => {
    render(
      <RoomTile
        member={{ userId: 7, cameraOn: true, focusState: "FOCUS", focusSec: 3725 }}
        isSelf
      />,
    );

    expect(screen.queryByTestId("tile-time-badge")).not.toBeInTheDocument();
    expect(screen.queryByText("01:02")).not.toBeInTheDocument();
  });
});

describe("RoomTile 이름·목표", () => {
  it("긴 이름과 목표는 각각 한 줄로 줄이고 타일 오른쪽 여백 안에 머문다", () => {
    render(
      <RoomTile
        member={{
          userId: 8,
          cameraOn: true,
          focusState: "FOCUS",
          nickname: "아주아주긴닉네임을가진사람",
          goal: "목표 문구가 아주 길어서 타일 폭을 넘어가는 경우",
        }}
      />,
    );

    expect(screen.getByTestId("tile-info")).toHaveClass("right-3");
    expect(screen.getByText("아주아주긴닉네임을가진사람")).toHaveClass("truncate");
    expect(screen.getByText("목표 문구가 아주 길어서 타일 폭을 넘어가는 경우")).toHaveClass(
      "truncate",
    );
  });
});

describe("RoomTile 하단 스크림 (BY-427)", () => {
  it("카메라 영상이 보일 때만 하단 스크림을 그린다 — 아바타 타일에는 없다", () => {
    const { rerender } = render(
      <RoomTile
        member={{ userId: 8, cameraOn: true, focusState: "FOCUS" }}
        media={<div data-testid="media" />}
      />,
    );

    expect(screen.getByTestId("tile-scrim")).toBeInTheDocument();

    rerender(
      <RoomTile
        member={{ userId: 8, cameraOn: false, focusState: "FOCUS" }}
        media={<div data-testid="media" />}
      />,
    );

    expect(screen.queryByTestId("tile-scrim")).not.toBeInTheDocument();
  });
});
