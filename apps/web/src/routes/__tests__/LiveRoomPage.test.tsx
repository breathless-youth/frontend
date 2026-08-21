import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RoomMember } from "@focusmakers/types";

import { createMockRoomChannel } from "@/features/live-room/mockRoomChannel";
import type { MockRoomScenario } from "@/features/live-room/mockRoomChannel";
import { createMockCameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import type { CameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import { submitStudySession } from "@/features/study-session/submitStudySession";
import { ApiError } from "@/lib/api";
import { joinRoom, leaveRoom } from "@/lib/roomApi";
import { LiveRoomPage } from "../LiveRoomPage";

vi.mock("@/lib/roomApi", () => ({
  joinRoom: vi.fn(),
  leaveRoom: vi.fn(),
}));

vi.mock("@/lib/profileApi", () => ({
  getProfile: vi.fn(async () => ({
    nickname: "포메3721",
    goal: "올해 안에 이직 성공",
    category: null,
    initial: "포",
    colorIndex: 0,
  })),
}));

vi.mock("@/features/study-session/submitStudySession", () => ({
  submitStudySession: vi.fn(),
}));

const mockedJoinRoom = vi.mocked(joinRoom);
const mockedLeaveRoom = vi.mocked(leaveRoom);

const joinResponse = {
  roomId: 42,
  graceRejoin: false,
  cameraOn: null,
  iceServers: [],
  iceTtlSeconds: 7200,
};

function member(userId: number, overrides: Partial<RoomMember> = {}): RoomMember {
  return {
    userId,
    nickname: `멤버${userId}`,
    goal: null,
    category: null,
    cameraOn: true,
    focusState: "FOCUS",
    studySeconds: 0,
    ...overrides,
  };
}

function renderRoom({
  state = { inviteCode: "0712" },
  scenario = { snapshot: [] },
  camera = createMockCameraAdapter(),
}: {
  state?: unknown;
  scenario?: MockRoomScenario;
  camera?: CameraAdapter;
} = {}) {
  const channel = createMockRoomChannel(scenario);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: "/social/room/42", search: "?userId=7", state }]}>
        <Routes>
          <Route
            path="/social/room/:roomId"
            element={<LiveRoomPage createChannel={() => channel} createCamera={() => camera} />}
          />
          <Route path="/social" element={<div data-testid="social-home-stub" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { channel };
}

/** 입장 확인 모달의 [카메라 켜기]를 눌러 룸으로 들어간다. */
async function enterRoom() {
  mockedJoinRoom.mockResolvedValue(joinResponse);
  await userEvent.click(screen.getByRole("button", { name: "카메라 켜기" }));
  await screen.findByRole("button", { name: "나가기" });
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("LiveRoomPage — 입장", () => {
  it("router state 없이 열리면 소셜 홈으로 돌려보낸다", () => {
    renderRoom({ state: null });

    expect(screen.getByTestId("social-home-stub")).toBeInTheDocument();
  });

  it("진입하면 카메라 켜기 확인 모달이 먼저 뜬다", () => {
    renderRoom();

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("카메라를 켤까요?")).toBeInTheDocument();
    expect(
      screen.getByText("영상은 룸에 있는 멤버에게만 전달돼요. 서버에 저장되지 않아요."),
    ).toBeInTheDocument();
  });

  it("카메라 켜기 확정 시 join을 재호출하고 채널을 연결해 룸에 들어간다", async () => {
    const { channel } = renderRoom();

    await enterRoom();

    expect(mockedJoinRoom).toHaveBeenCalledWith(7, "0712");
    expect(channel.status).toBe("open");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("입장 모달에 카메라 미리보기 비디오가 있고 amp-block으로 세션 리플레이에서 가려진다", () => {
    renderRoom();

    expect(screen.getByTestId("entry-preview-video")).toHaveClass("amp-block");
  });

  it("입장 모달은 Esc로 입장이 확정되지 않는다 — 끄고 입장으로 오인되면 안 된다", async () => {
    renderRoom();

    await userEvent.keyboard("{Escape}");

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(mockedJoinRoom).not.toHaveBeenCalled();
  });

  it("유예 재입장이면 모달 없이 이전 카메라 상태(끔)로 바로 들어간다", async () => {
    renderRoom({ state: { inviteCode: "0712", graceRejoin: true, cameraOn: false } });

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "카메라 켜기" })).toBeInTheDocument();
    expect(mockedJoinRoom).not.toHaveBeenCalled();
  });

  it("join 처리 중에는 모달의 두 버튼이 잠긴다 — 연타로 다른 cameraOn 결정이 겹치지 않게", async () => {
    mockedJoinRoom.mockReturnValue(new Promise(() => undefined));
    renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "카메라 켜기" }));

    expect(screen.getByRole("button", { name: "카메라 켜기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "끄고 입장" })).toBeDisabled();
    expect(mockedJoinRoom).toHaveBeenCalledTimes(1);
  });

  it("재-join이 실패하면 모달을 유지하고 인라인 오류를 보여준다", async () => {
    mockedJoinRoom.mockRejectedValue(new ApiError("가득 참", 409, "ROOM_FULL"));
    renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "카메라 켜기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("방이 가득 찼어요");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("끄고 입장하면 카메라 끔(측정 일시정지) 상태로 들어가고 CAMERA_CHANGED(false)를 발행한다", async () => {
    mockedJoinRoom.mockResolvedValue(joinResponse);
    const { channel } = renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "끄고 입장" }));

    expect(await screen.findByRole("button", { name: "카메라 켜기" })).toBeInTheDocument();
    await waitFor(() => {
      expect(channel.published).toContainEqual({ type: "CAMERA_CHANGED", cameraOn: false });
    });
  });
});

describe("LiveRoomPage — 그리드·타일", () => {
  it("혼자면 풀스크린이라 타일 크롬이 없고, 내 비디오는 amp-block으로 가려진다", async () => {
    renderRoom();

    await enterRoom();

    expect(screen.queryAllByTestId("room-tile")).toHaveLength(0);
    expect(screen.getByTestId("room-my-video")).toHaveClass("amp-block");
  });

  it("SNAPSHOT 멤버가 타일로 렌더되고 내 타일이 첫 번째다", async () => {
    renderRoom({ scenario: { snapshot: [member(8), member(9)] } });

    await enterRoom();

    const tiles = screen.getAllByTestId("room-tile");
    expect(tiles).toHaveLength(3);
    expect(tiles[0]).toHaveAttribute("data-user-id", "7");
  });

  it("멤버 입장 메시지가 오면 그리드가 재배치된다", async () => {
    renderRoom({
      scenario: {
        snapshot: [member(8)],
        steps: [{ afterMs: 30, message: { type: "MEMBER_JOINED", member: member(9) } }],
      },
    });

    await enterRoom();
    expect(screen.getAllByTestId("room-tile")).toHaveLength(2);

    await waitFor(() => {
      expect(screen.getAllByTestId("room-tile")).toHaveLength(3);
    });
  });

  it("카메라 획득에 실패하면 내 타일은 꺼짐으로 표시된다 — 검은 화면을 켜짐으로 그리지 않는다", async () => {
    renderRoom({
      scenario: { snapshot: [member(8)] },
      camera: createMockCameraAdapter({ failToStart: true }),
    });

    await enterRoom();

    const myTile = screen
      .getAllByTestId("room-tile")
      .find((tile) => tile.getAttribute("data-user-id") === "7");
    expect(myTile).toHaveAttribute("data-state", "OFF");
  });

  it("카메라 끔 멤버 타일은 OFF 상태(아바타)로 표시된다", async () => {
    renderRoom({ scenario: { snapshot: [member(8, { cameraOn: false })] } });

    await enterRoom();

    const offTile = screen
      .getAllByTestId("room-tile")
      .find((tile) => tile.getAttribute("data-user-id") === "8");
    expect(offTile).toHaveAttribute("data-state", "OFF");
  });
});

describe("LiveRoomPage — 카메라 토글·나가기", () => {
  it("카메라 끄기는 측정 일시정지가 되고, 다시 켜기는 확인 모달을 거쳐 재개된다", async () => {
    const { channel } = renderRoom();
    await enterRoom();
    channel.published.length = 0;

    await userEvent.click(screen.getByRole("button", { name: "카메라 끄기" }));
    expect(channel.published).toContainEqual({ type: "CAMERA_CHANGED", cameraOn: false });

    await userEvent.click(screen.getByRole("button", { name: "카메라 켜기" }));
    const dialog = screen.getByRole("alertdialog");

    await userEvent.click(within(dialog).getByRole("button", { name: "카메라 켜기" }));
    await waitFor(() => {
      expect(channel.published).toContainEqual({ type: "CAMERA_CHANGED", cameraOn: true });
    });
  });

  it("나가기는 종료 확인 후 제출하고 leave를 부른 뒤 소셜 홈으로 복귀한다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    mockedLeaveRoom.mockResolvedValue(undefined);
    renderRoom();
    await enterRoom();

    await userEvent.click(screen.getByRole("button", { name: "나가기" }));
    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));

    await waitFor(() => {
      expect(mockedLeaveRoom).toHaveBeenCalledWith(42, 7);
    });
    expect(await screen.findByTestId("social-home-stub")).toBeInTheDocument();
  });

  it("제출 중에는 컨트롤이 잠긴다 — 이중 종료·토글을 막는다", async () => {
    vi.mocked(submitStudySession).mockReturnValue(new Promise(() => undefined));
    renderRoom();
    await enterRoom();

    await userEvent.click(screen.getByRole("button", { name: "나가기" }));
    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));

    expect(await screen.findByText("저장 중...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "나가기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "카메라 끄기" })).toBeDisabled();
  });

  it("제출이 실패하면 룸에 남아 다시 제출을 노출하고 leave를 부르지 않는다", async () => {
    vi.mocked(submitStudySession).mockRejectedValue(new Error("일시적 오류"));
    renderRoom();
    await enterRoom();

    await userEvent.click(screen.getByRole("button", { name: "나가기" }));
    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));

    expect(await screen.findByRole("button", { name: "다시 제출" })).toBeInTheDocument();
    expect(mockedLeaveRoom).not.toHaveBeenCalled();
  });
});
