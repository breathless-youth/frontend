import { render, screen, within } from "@testing-library/react";
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

describe("RoomTile 내 타일 상태 뱃지 (BY-427)", () => {
  it.each([
    ["FOCUS", "집중 측정 중"],
    ["DISTRACTED", "비집중"],
    ["PAUSED", "일시정지"],
  ] as const)(
    "selfState=%s면 도트+sr-only 상태 텍스트를 가진 뱃지로 타이머를 그린다",
    (state, label) => {
      render(
        <RoomTile
          member={{ userId: 7, cameraOn: true, focusState: "FOCUS", studySeconds: 3660 }}
          selfState={state}
        />,
      );

      const badge = screen.getByTestId("self-state-badge");
      expect(badge).toHaveAttribute("data-state", state);
      expect(within(badge).getByTestId("self-state-dot")).toBeInTheDocument();
      expect(within(badge).getByText(label)).toHaveClass("sr-only");
      expect(badge).toHaveTextContent("01:01");
    },
  );

  it("selfState가 없으면(타 참가자) 서버 발행 집중 상태 색을 쓴다 (2026-08-25 BY-435 개정)", () => {
    render(
      <RoomTile member={{ userId: 8, cameraOn: true, focusState: "FOCUS", studySeconds: 60 }} />,
    );

    expect(screen.getByTestId("self-state-badge")).toHaveAttribute("data-state", "FOCUS");
    expect(screen.getByText("00:01")).toBeInTheDocument();
  });

  it("타 참가자 비집중은 DISTRACTED 색 뱃지다", () => {
    render(
      <RoomTile
        member={{ userId: 8, cameraOn: true, focusState: "DISTRACTED", studySeconds: 60 }}
      />,
    );

    expect(screen.getByTestId("self-state-badge")).toHaveAttribute("data-state", "DISTRACTED");
  });

  it("타 참가자 카메라 꺼짐은 OFF(회색) 뱃지다", () => {
    render(
      <RoomTile member={{ userId: 8, cameraOn: false, focusState: "FOCUS", studySeconds: 125 }} />,
    );

    expect(screen.getByTestId("self-state-badge")).toHaveAttribute("data-state", "OFF");
    expect(screen.getByText("00:02")).toBeInTheDocument();
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
