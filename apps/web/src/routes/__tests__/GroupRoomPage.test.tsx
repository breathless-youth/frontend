import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Location } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  GroupHomeResponse,
  GroupRoomJoinResponse,
  RoomMember,
  StudySessionListResponse,
  SubjectResponse,
} from "@focusmakers/types";

import type { MicAcquireResult } from "@/features/live-room/audio/microphone";
import type { RemoteAudioPlayer } from "@/features/live-room/audio/remoteAudio";
import type { CreateChannel } from "@/features/live-room/liveRoomEntryState";
import { createMockRoomChannel } from "@/features/live-room/mockRoomChannel";
import type { MockRoomChannel } from "@/features/live-room/mockRoomChannel";
import { EMPTY_STATS } from "@/features/planner/plannerDay";
import { consumeSocialRoomNotice } from "@/features/social-room/socialRoomNotice";
import { createMockCameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import { submitStudySession } from "@/features/study-session/submitStudySession";
import { useActiveSessionRestore } from "@/features/study-session/useActiveSessionRestore";
import { ApiError } from "@/lib/api";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { getGroupHome, joinGroupRoom, leaveGroupRoom } from "@/lib/groupRoomApi";
import { queryClient as appQueryClient } from "@/lib/queryClient";
import type * as UserId from "@/lib/userId";
import { LocationProbe } from "@/test/LocationProbe";

import { GroupRoomPage } from "../GroupRoomPage";

vi.mock("@/lib/groupRoomApi");
vi.mock("@/features/study-session/closeStaleSession");
vi.mock("@/lib/userId", async (importOriginal) => ({
  ...(await importOriginal<typeof UserId>()),
  useUserId: vi.fn(() => 7),
  useIdentityPending: vi.fn(() => false),
}));

/** 복원 게이트는 자기 테스트가 따로 있어서 여기서는 통과시킨다. */
vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: vi.fn(() => ({ settled: true, restored: null })),
}));
vi.mock("@/lib/profileApi", () => ({
  getProfile: vi.fn(async () => ({
    nickname: "새벽러",
    goal: null,
    category: null,
    initial: "새",
    colorIndex: 0,
  })),
}));
vi.mock("@/features/study-session/submitStudySession", () => ({
  submitStudySession: vi.fn(),
}));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
// 세션에 들어오면 과목 목록과 오늘 기록을 미리 받는데, jsdom은 상대 주소 fetch에서 오류를 낸다.
const listSubjects = vi.hoisted(() => vi.fn(async (): Promise<SubjectResponse[]> => []));
vi.mock("@/lib/subjectApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listSubjects,
}));
const listStudySessionStats = vi.hoisted(() =>
  vi.fn<(date: string) => Promise<StudySessionListResponse>>(),
);
vi.mock("@/lib/statsApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listStudySessionStats,
}));

const GROUP_NAME = "새벽 5시 기상 공시반";

function seat(overrides: Partial<GroupRoomJoinResponse> = {}): GroupRoomJoinResponse {
  return {
    roomId: 123,
    graceRejoin: false,
    cameraOn: null,
    micOn: null,
    onBreak: null,
    iceServers: [],
    iceTtlSeconds: 600,
    ...overrides,
  };
}

function groupHome(overrides: Partial<GroupHomeResponse> = {}): GroupHomeResponse {
  return {
    groupId: 10,
    name: GROUP_NAME,
    visibility: "PUBLIC",
    category: "CSAT",
    description: null,
    memberCount: 3,
    myRole: "MEMBER",
    notifyEnabled: false,
    newApplicationCount: null,
    studyingCount: 0,
    members: [],
    ...overrides,
  };
}

function member(userId: number, overrides: Partial<RoomMember> = {}): RoomMember {
  return {
    userId,
    nickname: `멤버${userId}`,
    goal: null,
    cameraOn: false,
    focusState: "FOCUS",
    focusSec: 0,
    micOn: false,
    onBreak: false,
    owner: false,
    ...overrides,
  };
}

function fakePlayer() {
  return {
    attach: vi.fn(),
    detach: vi.fn(),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
    setAllMuted: vi.fn(),
    level: vi.fn<(userId: number) => number>().mockReturnValue(0),
    setLocalMeter: vi.fn(),
    localLevel: vi.fn<() => number>().mockReturnValue(0),
    needsResume: vi.fn(() => false),
    setMicOnUsers: vi.fn(),
    resume: vi.fn(async () => undefined),
    close: vi.fn(),
  } satisfies RemoteAudioPlayer;
}

function createFakePc() {
  const pc = {
    closed: false,
    iceConnectionState: "new",
    onicecandidate: null as ((e: { candidate: unknown }) => void) | null,
    ontrack: null as ((e: { streams: unknown[]; track?: unknown }) => void) | null,
    oniceconnectionstatechange: null as (() => void) | null,
    restartIce: () => undefined,
    async createOffer() {
      return { type: "offer", sdp: "offer-sdp" };
    },
    async createAnswer() {
      return { type: "answer", sdp: "answer-sdp" };
    },
    async setLocalDescription() {},
    async setRemoteDescription() {},
    async addIceCandidate() {},
    addTrack() {
      return {
        replaceTrack: async () => undefined,
        setParameters: async () => undefined,
        getParameters: () => ({ encodings: [{}] }),
      };
    },
    getSenders() {
      return [];
    },
    close() {
      pc.closed = true;
    },
  };
  return pc;
}

type FakePc = ReturnType<typeof createFakePc>;

function renderGroupRoom({
  path = "/social/groups/10/room",
  state,
  snapshot = [],
}: {
  path?: string;
  state?: unknown;
  snapshot?: RoomMember[];
} = {}) {
  let channel: MockRoomChannel | null = null;
  let options: Parameters<CreateChannel>[0] | null = null;
  const pcs: FakePc[] = [];
  const pcConfigs: RTCConfiguration[] = [];
  const player = fakePlayer();
  const acquire = vi.fn(async (): Promise<MicAcquireResult> => ({ kind: "denied" }));
  let current: Location | null = null;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[{ pathname: path, state }]}>
        <Routes>
          <Route
            path="/social/groups/:groupId/room"
            element={
              <GroupRoomPage
                createChannel={(next) => {
                  options = next;
                  channel = createMockRoomChannel({ snapshot });
                  return channel;
                }}
                createCamera={() => createMockCameraAdapter()}
                createPeerConnection={(config) => {
                  pcConfigs.push(config);
                  const pc = createFakePc();
                  pcs.push(pc);
                  return pc as unknown as RTCPeerConnection;
                }}
                audioDeps={{ acquire, createPlayer: () => player }}
              />
            }
          />
          <Route path="/social" element={<div data-testid="group-tab-stub" />} />
          <Route path="/social/groups/:groupId" element={<div data-testid="group-home-stub" />} />
          <Route
            path="/social/groups/:groupId/room/result"
            element={<div data-testid="group-result-stub" />}
          />
        </Routes>
        <LocationProbe
          onLocation={(location) => {
            current = location;
          }}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return {
    channel: () => {
      if (channel === null) {
        throw new Error("채널이 아직 열리지 않았다");
      }
      return channel;
    },
    channelOptions: () => options,
    location: () => {
      if (current === null) {
        throw new Error("라우터 주소를 아직 읽지 못했다");
      }
      return current;
    },
    pcs,
    pcConfigs,
    player,
    acquire,
    client,
  };
}

/**
 * 그룹 공부방에 들어가 SNAPSHOT과 그룹 홈 조회까지 받은 상태
 *
 * 공부방은 내보내짐 안내와 그룹장 판단에 그룹 홈 캐시를 쓰므로 그 조회가 끝날 때까지 기다린다.
 */
async function enterGroupRoom({
  groupId = 10,
  groupName = GROUP_NAME,
  visibility = "PUBLIC",
  snapshot = [member(7)],
  state,
}: {
  groupId?: number;
  groupName?: string;
  visibility?: GroupHomeResponse["visibility"];
  snapshot?: RoomMember[];
  state?: unknown;
} = {}) {
  vi.mocked(getGroupHome).mockResolvedValue(groupHome({ groupId, name: groupName, visibility }));
  const rendered = renderGroupRoom({ path: `/social/groups/${groupId}/room`, snapshot, state });
  await screen.findByRole("button", { name: "나가기" });
  await waitFor(() => expect(getGroupHome).toHaveBeenCalledWith(groupId, expect.anything()));
  // 채널 연결, 카메라 끄고 입장, SNAPSHOT 반영, 그룹 홈 응답까지 흘려보낸다.
  await act(async () => {});
  return { ...rendered, channel: rendered.channel() };
}

/** 나가기 버튼과 종료 확인 창의 확인 */
async function exitRoom() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "나가기" }));
  await user.click(screen.getByRole("button", { name: "공부 종료" }));
}

function noticeHandoffOf(location: Location): boolean {
  return (location.state as { noticeHandoff?: boolean } | null)?.noticeHandoff === true;
}

beforeEach(() => {
  vi.mocked(joinGroupRoom).mockResolvedValue(seat());
  vi.mocked(leaveGroupRoom).mockResolvedValue(undefined);
  vi.mocked(getGroupHome).mockResolvedValue(groupHome());
  listSubjects.mockResolvedValue([]);
  listStudySessionStats.mockResolvedValue(EMPTY_STATS);
  appQueryClient.clear();
  localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("GroupRoomPage 입장", () => {
  it("그룹 공부방은 그룹 경로로 자리를 잡고 받은 방 번호로 채널을 연다", async () => {
    vi.mocked(joinGroupRoom).mockResolvedValue(seat({ roomId: 123 }));
    const { channelOptions } = renderGroupRoom({ path: "/social/groups/10/room" });
    await waitFor(() => expect(channelOptions()).toMatchObject({ roomId: 123 }));
    expect(joinGroupRoom).toHaveBeenCalledWith(10);
  });

  it("그룹 홈에서 자리를 잡고 넘어와도 공부방 화면이 자리를 한 번 더 잡는다", async () => {
    vi.mocked(joinGroupRoom).mockResolvedValue(seat({ roomId: 124 }));
    const { channelOptions } = renderGroupRoom({
      state: { roomId: 124, graceRejoin: false, iceServers: [] },
    });
    await waitFor(() => expect(channelOptions()).toMatchObject({ roomId: 124 }));
    expect(joinGroupRoom).toHaveBeenCalledOnce();
  });

  it("유예 재입장은 자리를 다시 잡지 않고 넘겨받은 방 번호로 들어간다", async () => {
    const { channelOptions } = renderGroupRoom({
      state: { roomId: 125, graceRejoin: true, iceServers: [] },
    });
    await waitFor(() => expect(channelOptions()).toMatchObject({ roomId: 125 }));
    expect(joinGroupRoom).not.toHaveBeenCalled();
  });

  it("멤버가 아니면 그룹 탭으로 돌아가 안내한다", async () => {
    vi.mocked(joinGroupRoom).mockRejectedValue(new ApiError("x", 403, "NOT_GROUP_MEMBER"));
    const { location } = renderGroupRoom({ path: "/social/groups/10/room" });
    await waitFor(() => expect(location().pathname).toBe("/social"));
    expect(consumeSocialRoomNotice()).toEqual({
      kind: "failure",
      message: "이 그룹의 멤버가 아니에요",
    });
  });

  it("다시 시도할 수 있는 실패는 그 자리에 남고 그룹 홈으로 갈 수 있다", async () => {
    vi.mocked(joinGroupRoom).mockRejectedValueOnce(new ApiError("x", 500));
    const { location } = renderGroupRoom({ path: "/social/groups/10/room" });
    expect(await screen.findByRole("button", { name: "그룹 홈으로" })).toBeInTheDocument();
    expect(screen.getByText("잠시 후 다시 시도해 주세요")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "그룹 홈으로" }));

    expect(location().pathname).toBe("/social/groups/10");
  });

  it("다시 시도는 자리 잡기부터 다시 한다", async () => {
    vi.mocked(joinGroupRoom).mockRejectedValueOnce(new ApiError("x", 500));
    const { channelOptions } = renderGroupRoom();
    await userEvent.setup().click(await screen.findByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(channelOptions()).toMatchObject({ roomId: 123 }));
    expect(joinGroupRoom).toHaveBeenCalledTimes(2);
  });

  it("카메라 권한을 거부하면 자리를 잡지 않고 그 그룹의 그룹 홈으로 돌아간다", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    const { location } = renderGroupRoom();
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(expect.stringContaining('"request-camera-gate"')),
    );

    const entry = (globalThis as unknown as Record<string, (raw: string) => void>)[
      NATIVE_MESSAGE_ENTRY
    ];
    act(() => entry?.(JSON.stringify({ type: "camera-gate-result", granted: false, atMs: 1 })));

    await waitFor(() => expect(location().pathname).toBe("/social/groups/10"));
    expect(joinGroupRoom).not.toHaveBeenCalled();
  });

  it("그룹 공부방에 들어가도 소셜룸 입장 Meta 전환은 보내지 않는다", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    renderGroupRoom();
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(expect.stringContaining('"request-camera-gate"')),
    );
    const entry = (globalThis as unknown as Record<string, (raw: string) => void>)[
      NATIVE_MESSAGE_ENTRY
    ];
    act(() => entry?.(JSON.stringify({ type: "camera-gate-result", granted: true, atMs: 1 })));
    await screen.findByRole("button", { name: "나가기" });
    await act(async () => {});

    const metaEvents = postMessage.mock.calls
      .map(([raw]) => JSON.parse(raw as string) as { type: string; name?: string })
      .filter((message) => message.type === "meta-app-event")
      .map((message) => message.name);
    expect(metaEvents).not.toContain("social_room_entered");
  });

  it("그룹 공부방 연결은 소리와 영상을 한 전송 경로로 묶는다", async () => {
    const { pcConfigs } = renderGroupRoom({ snapshot: [member(7), member(42)] });
    await waitFor(() => expect(pcConfigs).toHaveLength(1));
    expect(pcConfigs[0]).toMatchObject({ bundlePolicy: "max-bundle" });
  });

  it("마이크를 켠 멤버를 재생기에 알리고 마이크를 끄면 뺀다", async () => {
    const { channel, player } = await enterGroupRoom({
      snapshot: [member(7, { micOn: true }), member(42, { micOn: true }), member(43)],
    });
    expect(player.setMicOnUsers).toHaveBeenLastCalledWith(new Set([42]));

    act(() => channel.emitServerMessage({ type: "MIC_CHANGED", userId: 42, micOn: false }));

    expect(player.setMicOnUsers).toHaveBeenLastCalledWith(new Set());
  });

  it("상대 소리가 오면 공부방의 재생기에 붙인다", async () => {
    const { pcs, player } = renderGroupRoom({ snapshot: [member(7), member(42)] });
    await waitFor(() => expect(pcs).toHaveLength(1));
    const voice = { kind: "audio" };

    act(() => pcs[0]?.ontrack?.({ streams: [], track: voice }));

    expect(player.attach).toHaveBeenCalledWith(42, voice);
  });
});

describe("GroupRoomPage 나가기", () => {
  it("1분 미만이면 결과 없이 그룹 홈으로 가고 그룹 나가기 API를 부른다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    const { channel, location } = await enterGroupRoom({ groupId: 10 });
    await exitRoom();
    await waitFor(() => expect(location().pathname).toBe("/social/groups/10"));
    expect(leaveGroupRoom).toHaveBeenCalledWith(10);
    expect(channel.status).toBe("closed");
  });

  it("수동 종료로 순공 1분 이상이면 그 그룹의 결과 화면으로 가고 그룹 나가기 API를 부른다", async () => {
    vi.mocked(useActiveSessionRestore).mockReturnValue({
      settled: true,
      restored: {
        startedAtMs: Date.now() - 130_000,
        reportedAtMs: Date.now(),
        baseStudySec: 130,
        baseFocusSec: 120,
        events: [],
      },
    });
    vi.mocked(submitStudySession).mockResolvedValue([
      {
        id: 1,
        userId: 7,
        statDate: "2026-11-03",
        startedAt: "2026-11-03T12:00:00.000Z",
        endedAt: "2026-11-03T12:02:10.000Z",
        studySec: 130,
        focusSec: 120,
        focusRate: 92.3,
        events: [],
      },
    ]);
    try {
      const { location } = await enterGroupRoom({ groupId: 10 });
      await exitRoom();
      await waitFor(() => expect(location().pathname).toBe("/social/groups/10/room/result"));
      expect(leaveGroupRoom).toHaveBeenCalledWith(10);
      expect(location().state).toMatchObject({ sessions: [expect.objectContaining({ id: 1 })] });
    } finally {
      vi.mocked(useActiveSessionRestore).mockReturnValue({ settled: true, restored: null });
    }
  });

  it("내보내지면 기록을 보내고 그룹 탭에서 내보내졌다는 안내를 본다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    const { channel, location } = await enterGroupRoom({
      groupId: 10,
      groupName: "새벽 5시 기상 공시반",
    });
    act(() => channel.emitServerMessage({ type: "KICKED", groupId: 10 }));
    await waitFor(() => expect(location().pathname).toBe("/social"));
    expect(submitStudySession).toHaveBeenCalled();
    expect(leaveGroupRoom).not.toHaveBeenCalled();
    expect(channel.status).toBe("closed");
    expect(noticeHandoffOf(location())).toBe(false);
    expect(consumeSocialRoomNotice()).toEqual({
      kind: "failure",
      message: "새벽 5시 기상 공시반에서 내보내졌어요",
    });
  });

  it("내보내진 뒤 기록을 보내지 못해도 그룹 탭으로 가서 안내를 본다", async () => {
    vi.mocked(submitStudySession).mockRejectedValue(new Error("네트워크"));
    const { channel, location } = await enterGroupRoom({ groupId: 10 });
    act(() => channel.emitServerMessage({ type: "KICKED", groupId: 10 }));
    await waitFor(() => expect(location().pathname).toBe("/social"));
    expect(leaveGroupRoom).not.toHaveBeenCalled();
    expect(consumeSocialRoomNotice()).toEqual({
      kind: "failure",
      message: `${GROUP_NAME}에서 내보내졌어요`,
    });
  });

  it("다른 그룹의 KICKED는 무시한다", async () => {
    const { channel, location } = await enterGroupRoom({ groupId: 10 });
    act(() => channel.emitServerMessage({ type: "KICKED", groupId: 99 }));
    await act(() => Promise.resolve());
    expect(location().pathname).toBe("/social/groups/10/room");
  });

  it("방에 다시 들어갈 수 없으면 기록을 보내고 그룹 홈에서 안내를 본다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    const { channel, location } = await enterGroupRoom({ groupId: 10 });
    vi.mocked(joinGroupRoom).mockRejectedValue(new ApiError("x", 409, "CONFLICT"));

    act(() => channel.emitServerMessage({ type: "ROOM_UNAVAILABLE", roomId: 123 }));

    await waitFor(() => expect(location().pathname).toBe("/social/groups/10"));
    expect(noticeHandoffOf(location())).toBe(false);
    expect(leaveGroupRoom).not.toHaveBeenCalled();
    const notice = consumeSocialRoomNotice();
    expect(notice?.kind).toBe("grace-end");
    expect(notice?.message).toContain("방이 종료되어");
  });

  it("다시 잡은 자리가 다른 방이면 그 자리를 비우고 공부를 마친다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    const { channel, location } = await enterGroupRoom({ groupId: 10 });
    vi.mocked(joinGroupRoom).mockResolvedValue(seat({ roomId: 999 }));

    act(() => channel.emitServerMessage({ type: "ROOM_UNAVAILABLE", roomId: 123 }));

    await waitFor(() => expect(location().pathname).toBe("/social/groups/10"));
    expect(leaveGroupRoom).toHaveBeenCalledOnce();
    expect(leaveGroupRoom).toHaveBeenCalledWith(10);
    expect(consumeSocialRoomNotice()?.kind).toBe("grace-end");
  });

  it("PEER_BLOCKED를 받으면 그 사람과의 연결을 닫는다", async () => {
    const { channel, pcs } = await enterGroupRoom({ snapshot: [member(7), member(42)] });
    expect(pcs).toHaveLength(1);

    act(() => channel.emitServerMessage({ type: "PEER_BLOCKED", userId: 42 }));

    expect(pcs[0]?.closed).toBe(true);
  });

  it("공부방에 있는 동안에는 그룹 홈을 주기적으로 다시 받지 않는다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await enterGroupRoom({ groupId: 10 });
    vi.mocked(getGroupHome).mockClear();

    await act(() => vi.advanceTimersByTimeAsync(61_000));

    expect(getGroupHome).not.toHaveBeenCalled();
  });
});
