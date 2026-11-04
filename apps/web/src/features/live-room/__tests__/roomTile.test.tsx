import { isInaccessible, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RoomMember } from "@focusmakers/types";

import { stubImageLoad } from "@/test/imageStub";

import { RoomTile } from "../components/RoomTile";

/** 그룹 공부방 멤버이고 카메라는 꺼져 있다. */
function member(userId: number): RoomMember {
  return {
    userId,
    nickname: `멤버${userId}`,
    goal: null,
    cameraOn: false,
    focusState: "FOCUS",
    focusSec: 600,
    micOn: false,
    onBreak: false,
    owner: false,
  };
}

describe("RoomTile 그룹 공부방 휴식", () => {
  it("휴식 중인 멤버의 시간 뱃지는 휴식 상태로 읽힌다", () => {
    render(<RoomTile member={{ ...member(2), cameraOn: true, onBreak: true }} />);

    expect(screen.getByTestId("tile-time-badge")).toHaveAttribute("data-state", "BREAK");
    expect(screen.getByText("휴식 중")).toBeInTheDocument();
  });

  it("카메라를 끈 멤버도 휴식 중이면 휴식으로 읽힌다", () => {
    render(<RoomTile member={{ ...member(2), cameraOn: false, onBreak: true }} />);

    expect(screen.getByTestId("tile-time-badge")).toHaveAttribute("data-state", "BREAK");
  });

  it("휴식이 끝나면 지금 집중 상태로 돌아간다", () => {
    render(<RoomTile member={{ ...member(2), cameraOn: true, onBreak: false }} />);

    expect(screen.getByTestId("tile-time-badge")).toHaveAttribute("data-state", "FOCUS");
    expect(screen.queryByText("휴식 중")).toBeNull();
  });
});

describe("RoomTile 그룹 공부방 표시", () => {
  it("다른 사람 타일에만 메뉴 버튼이 있다", () => {
    const { rerender } = render(
      <RoomTile member={member(2)} menuButton={<button type="button" aria-label="멤버2 메뉴" />} />,
    );
    expect(screen.getByRole("button", { name: "멤버2 메뉴" })).toBeInTheDocument();

    rerender(<RoomTile member={member(7)} isSelf />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("말하는 멤버 타일은 말하는 중으로 읽히고 마이크 아이콘은 켜짐과 꺼짐이 다르다", () => {
    const { rerender } = render(<RoomTile member={member(2)} speaking micOn />);
    expect(screen.getByTestId("room-tile")).toHaveAttribute("data-speaking", "true");
    expect(screen.getByText("말하는 중")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "마이크 켜짐" })).toBeInTheDocument();

    rerender(<RoomTile member={member(2)} micOn={false} />);

    expect(screen.getByTestId("room-tile")).not.toHaveAttribute("data-speaking");
    expect(screen.queryByText("말하는 중")).toBeNull();
    expect(screen.getByRole("img", { name: "마이크 꺼짐" })).toBeInTheDocument();
  });

  it("초대코드 방 타일은 마이크 아이콘을 그리지 않는다", () => {
    render(<RoomTile member={{ userId: 8, cameraOn: true, focusState: "FOCUS" }} />);

    expect(screen.queryByRole("img", { name: /마이크/ })).toBeNull();
  });

  it("차단한 멤버는 카메라를 켜 둬도 프로필로 그린다", () => {
    render(
      <RoomTile
        member={{ ...member(2), cameraOn: true }}
        media={<video data-testid="remote" />}
        blocked
      />,
    );

    expect(screen.queryByTestId("remote")).toBeNull();
    expect(screen.getByTestId("room-tile")).toHaveAttribute("data-state", "OFF");
    expect(screen.getByTestId("tile-time-badge")).toHaveAttribute("data-state", "OFF");
  });
});

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

  it("카메라를 끈 타일은 사진이 있으면 이니셜 대신 사진을 그린다", async () => {
    stubImageLoad();
    const { container } = render(
      <RoomTile
        member={{
          userId: 8,
          cameraOn: false,
          focusState: "FOCUS",
          nickname: "포메1",
          profileImageUrl: "/avatars/8.jpg",
        }}
      />,
    );

    await waitFor(() =>
      expect(container.querySelector("img")).toHaveAttribute("src", "/avatars/8.jpg"),
    );
    expect(screen.queryByText("포")).toBeNull();
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

  it.each(["", "   "])("목표가 %j이면 목표 줄을 그리지 않는다", (goal) => {
    render(
      <RoomTile
        member={{ userId: 8, cameraOn: true, focusState: "FOCUS", nickname: "포메1", goal }}
      />,
    );

    expect(screen.getByTestId("tile-info").querySelectorAll("p")).toHaveLength(1);
  });

  it("목표 문구가 있으면 이름 아래에 보인다", () => {
    render(
      <RoomTile
        member={{ userId: 8, cameraOn: true, focusState: "FOCUS", nickname: "포메1", goal: "합격" }}
      />,
    );

    expect(screen.getByTestId("tile-info").querySelectorAll("p")).toHaveLength(2);
    expect(screen.getByText("합격")).toBeInTheDocument();
  });
});

describe("RoomTile 목표 문구 내리기", () => {
  const withGoal = {
    userId: 8,
    cameraOn: true,
    focusState: "FOCUS",
    nickname: "포메1",
    goal: "합격",
  } as const;

  it("기본은 목표 문구가 올라와 있다", () => {
    render(<RoomTile member={withGoal} />);

    expect(screen.getByText("합격")).not.toHaveAttribute("data-hidden");
  });

  it("목표 문구만 내려가고 닉네임과 마이크 아이콘은 그대로 보인다", () => {
    render(<RoomTile member={withGoal} micOn goalHidden />);

    expect(screen.getByText("합격")).toHaveAttribute("data-hidden", "true");
    const nickname = screen.getByText("포메1");
    expect(nickname).toBeVisible();
    expect(nickname.closest("[data-hidden]")).toBeNull();
    const mic = screen.getByRole("img", { name: "마이크 켜짐" });
    expect(mic.closest("[data-hidden]")).toBeNull();
  });

  it("내려간 목표 줄도 자리를 지켜 닉네임이 따라 내려가지 않고, 낭독기는 목표를 읽는다", () => {
    render(<RoomTile member={withGoal} goalHidden />);

    const goal = screen.getByText("합격");
    expect(screen.getByTestId("tile-info").querySelectorAll("p")).toHaveLength(2);
    expect(goal).not.toHaveAttribute("aria-hidden");
    expect(isInaccessible(goal)).toBe(false);
  });

  it("다시 올라오면 목표 문구가 원래 상태로 돌아온다", () => {
    const { rerender } = render(<RoomTile member={withGoal} goalHidden />);
    expect(screen.getByText("합격")).toHaveAttribute("data-hidden", "true");

    rerender(<RoomTile member={withGoal} goalHidden={false} />);

    expect(screen.getByText("합격")).not.toHaveAttribute("data-hidden");
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
