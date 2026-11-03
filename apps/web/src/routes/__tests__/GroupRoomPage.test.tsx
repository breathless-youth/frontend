import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import {
  getGroupHome,
  joinGroupRoom,
  kickGroupMember,
  leaveGroupRoom,
  reportGroupMember,
} from "@/lib/groupRoomApi";
import { groupKeys } from "@/lib/groupRoomQueries";
import { haptic } from "@/lib/haptics";
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
// 내 닉네임은 다른 멤버 닉네임과 겹치지 않게 둔다.
vi.mock("@/lib/profileApi", () => ({
  getProfile: vi.fn(async () => ({
    nickname: "공부하는나",
    goal: null,
    category: null,
    initial: "공",
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

/** SNAPSHOT의 내 멤버 값이고 나는 7번이다. */
function meMember(overrides: Partial<RoomMember> = {}): RoomMember {
  return member(7, overrides);
}

function otherMember(
  userId: number,
  nickname: string,
  overrides: Partial<RoomMember> = {},
): RoomMember {
  return member(userId, { nickname, ...overrides });
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
  myRole = "MEMBER",
  snapshot = [member(7)],
  state,
}: {
  groupId?: number;
  groupName?: string;
  visibility?: GroupHomeResponse["visibility"];
  myRole?: GroupHomeResponse["myRole"];
  snapshot?: RoomMember[];
  state?: unknown;
} = {}) {
  vi.mocked(getGroupHome).mockResolvedValue(
    groupHome({ groupId, name: groupName, visibility, myRole }),
  );
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

/** 끝나는 이벤트를 받을 수 있는 가짜 마이크 트랙 */
function fakeMicTrack() {
  return Object.assign(new EventTarget(), {
    kind: "audio",
    enabled: true,
    readyState: "live",
    stop: vi.fn(),
  }) as unknown as MediaStreamTrack;
}

/** 바의 카메라 버튼과 카메라 켜기 확인 창으로 카메라를 켠다. */
async function turnCameraOn() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "카메라 켜기" }));
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", { name: "카메라 켜기" }),
  );
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
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

describe("GroupRoomPage 시간 규칙과 상태 발행", () => {
  it("들어가면 마이크 꺼짐과 휴식 아님을 한 번씩 보낸다", async () => {
    const { channel } = await enterGroupRoom();

    expect(channel.published.filter((message) => "micOn" in message)).toEqual([{ micOn: false }]);
    expect(channel.published.filter((message) => "onBreak" in message)).toEqual([
      { onBreak: false },
    ]);
  });

  it("마이크를 켠 뒤 서버가 내 마이크를 처음 값으로 돌려 두면 켜짐을 다시 보낸다", async () => {
    const { channel, acquire } = await enterGroupRoom();
    acquire.mockResolvedValue({ kind: "ok", track: fakeMicTrack() });
    await turnCameraOn();
    await userEvent.setup().click(screen.getByRole("button", { name: "마이크 켜기" }));
    await screen.findByRole("button", { name: "마이크 끄기" });
    channel.published.length = 0;

    // 자리를 새로 잡은 서버의 SNAPSHOT은 내 카메라와 마이크를 꺼짐으로 돌려 둔다.
    act(() =>
      channel.emitServerMessage({
        type: "SNAPSHOT",
        members: [meMember({ cameraOn: false, micOn: false, onBreak: false })],
      }),
    );

    expect(channel.published).toEqual([{ cameraOn: true }, { micOn: true }]);
  });

  it("카메라를 끈 채 20분이 지나도 남고 1시간이 되면 공부를 마치고 그룹 홈으로 간다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(submitStudySession).mockResolvedValue([]);
    const { location } = await enterGroupRoom({ groupId: 10 });

    // 일시정지 감시는 벽시계로 경과를 다시 계산해서 타이머를 돌리지 않고 시계만 건너뛴다.
    act(() => vi.setSystemTime(Date.now() + 21 * 60_000));
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(submitStudySession).not.toHaveBeenCalled();
    expect(location().pathname).toBe("/social/groups/10/room");

    act(() => vi.setSystemTime(Date.now() + 39 * 60_000));
    await act(() => vi.advanceTimersByTimeAsync(1_000));

    await waitFor(() => expect(location().pathname).toBe("/social/groups/10"));
    expect(submitStudySession).toHaveBeenCalledOnce();
  });
});

describe("GroupRoomPage 조작 배치", () => {
  it("아래 바는 카메라, 마이크, 타이머, 배경음, 나가기 순서다", async () => {
    await enterGroupRoom({ groupId: 10 });
    const bar = screen.getByTestId("room-control-bar");

    expect(
      within(bar)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "카메라 켜기",
      "마이크 켜기",
      "타이머",
      expect.stringContaining("배경음"),
      "나가기",
    ]);
  });

  it("더보기 메뉴와 초대코드 공유, 바의 과목 버튼이 없다", async () => {
    await enterGroupRoom({ groupId: 10 });

    expect(screen.queryByRole("button", { name: /더보기/ })).toBeNull();
    expect(screen.queryByText(/초대코드/)).toBeNull();
    expect(
      within(screen.getByTestId("room-control-bar")).queryByRole("button", { name: /과목/ }),
    ).toBeNull();
  });

  it("카메라가 꺼진 동안 마이크를 누르면 안내만 하고 켜지 않는다", async () => {
    const { acquire } = await enterGroupRoom({ groupId: 10 });

    await userEvent.setup().click(screen.getByRole("button", { name: "마이크 켜기" }));

    expect(await screen.findByText("카메라를 켜면 마이크를 쓸 수 있어요")).toBeInTheDocument();
    expect(acquire).not.toHaveBeenCalled();
  });

  it("카메라를 켜고 마이크를 켜면 켜짐을 보내고 가벼운 진동을 낸다", async () => {
    const { channel, acquire } = await enterGroupRoom({ groupId: 10 });
    acquire.mockResolvedValue({ kind: "ok", track: fakeMicTrack() });
    await turnCameraOn();
    vi.mocked(haptic).mockClear();

    await userEvent.setup().click(screen.getByRole("button", { name: "마이크 켜기" }));

    expect(await screen.findByRole("button", { name: "마이크 끄기" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(channel.published).toContainEqual({ micOn: true });
    expect(haptic).toHaveBeenCalledWith("light");
  });

  it("다른 사람 소리 끄기는 이 기기에서 모두의 소리를 끈다", async () => {
    const { player } = await enterGroupRoom({ groupId: 10 });

    await userEvent.setup().click(screen.getByRole("button", { name: "다른 사람 소리 끄기" }));

    expect(player.setAllMuted).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("button", { name: "다른 사람 소리 끄기" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("왼쪽 위 과목 글자를 누르면 과목 화면이 열린다", async () => {
    await enterGroupRoom({ groupId: 10 });

    await userEvent.setup().click(screen.getByRole("button", { name: "과목" }));

    expect(await screen.findByRole("dialog", { name: "과목" })).toBeInTheDocument();
  });

  it("가운데 위에 내 순공과 총 시간을 두고 타일 격자는 그룹 배치다", async () => {
    await enterGroupRoom({ groupId: 10 });

    expect(screen.getByTestId("group-room-focus-badge")).toHaveTextContent("00:00:00");
    expect(screen.getByText("총 00:00:00")).toBeInTheDocument();
    expect(screen.getByTestId("room-grid")).toHaveAttribute("data-variant", "group");
  });

  it("닉네임과 그룹 이름이 클릭 분석에 실리지 않게 화면 전체를 가린다", async () => {
    await enterGroupRoom({ groupId: 10 });
    const root = screen.getByTestId("live-room-page");

    expect(root).toHaveAttribute("data-amp-mask");
    expect(root).toHaveAttribute("data-amp-mask-attributes", "aria-label");
  });
});

describe("GroupRoomPage 멤버 메뉴와 타일", () => {
  it("타일을 눌러도 메뉴는 열리지 않고 메뉴 버튼으로만 열린다", async () => {
    await enterGroupRoom({ groupId: 10, snapshot: [meMember(), otherMember(2, "새벽러")] });
    const user = userEvent.setup();

    await user.click(screen.getAllByTestId("room-tile")[1]!);
    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(screen.getByRole("button", { name: "새벽러 메뉴" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("내 타일에는 메뉴 버튼이 없고 내 마이크 상태를 보인다", async () => {
    await enterGroupRoom({ groupId: 10, snapshot: [meMember(), otherMember(2, "새벽러")] });
    const myTile = screen.getAllByTestId("room-tile")[0]!;

    expect(within(myTile).queryByRole("button")).toBeNull();
    expect(within(myTile).getByRole("img", { name: "마이크 꺼짐" })).toBeInTheDocument();
  });

  it("음량 슬라이더는 그 사람 소리만 바꾼다", async () => {
    const { player } = await enterGroupRoom({
      groupId: 10,
      snapshot: [meMember(), otherMember(42, "새벽러")],
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "새벽러 메뉴" }));

    fireEvent.change(screen.getByRole("slider", { name: "새벽러님 음량" }), {
      target: { value: "0" },
    });

    expect(player.setVolume).toHaveBeenLastCalledWith(42, 0);
  });

  it("소리 끄기는 그 사람만 끄고 다시 열면 소리 켜기다", async () => {
    const { player } = await enterGroupRoom({
      groupId: 10,
      snapshot: [meMember(), otherMember(42, "새벽러")],
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "새벽러 메뉴" }));
    await user.click(screen.getByRole("menuitem", { name: "소리 끄기" }));
    expect(player.setMuted).toHaveBeenLastCalledWith(42, true);

    await user.click(screen.getByRole("button", { name: "새벽러 메뉴" }));
    expect(screen.getByRole("menuitem", { name: "소리 켜기" })).toBeInTheDocument();
  });

  it("멤버의 마이크가 켜지면 그 타일의 마이크 아이콘이 켜짐이다", async () => {
    const { channel } = await enterGroupRoom({
      groupId: 10,
      snapshot: [meMember(), otherMember(42, "새벽러")],
    });
    const tile = screen.getAllByTestId("room-tile")[1]!;
    expect(within(tile).getByRole("img", { name: "마이크 꺼짐" })).toBeInTheDocument();

    act(() => channel.emitServerMessage({ type: "MIC_CHANGED", userId: 42, micOn: true }));

    expect(within(tile).getByRole("img", { name: "마이크 켜짐" })).toBeInTheDocument();
  });

  it("말하는 멤버의 타일은 말하는 중으로 읽힌다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { pcs, player } = await enterGroupRoom({
      groupId: 10,
      snapshot: [meMember(), otherMember(42, "새벽러")],
    });
    act(() => pcs[0]?.ontrack?.({ streams: [], track: { kind: "audio" } }));
    player.level.mockReturnValue(1);

    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(screen.getAllByTestId("room-tile")[1]).toHaveAttribute("data-speaking", "true");
  });

  it("메뉴가 열려 있는 동안은 시간이 지나도 조작이 숨지 않는다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await enterGroupRoom({ groupId: 10, snapshot: [meMember(), otherMember(42, "새벽러")] });
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(screen.getByRole("button", { name: "새벽러 메뉴" }));

    await act(() => vi.advanceTimersByTimeAsync(6_000));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByTestId("room-control-bar")).not.toHaveAttribute("inert");
  });

  it("메뉴를 연 멤버가 나가면 메뉴가 닫히고 조작이 다시 저절로 숨는다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { channel } = await enterGroupRoom({
      groupId: 10,
      snapshot: [meMember(), otherMember(42, "새벽러")],
    });
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(screen.getByRole("button", { name: "새벽러 메뉴" }));

    act(() => channel.emitServerMessage({ type: "MEMBER_LEFT", userId: 42 }));
    await act(() => vi.advanceTimersByTimeAsync(6_000));

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByTestId("room-control-bar")).toHaveAttribute("inert");
  });
});

describe("GroupRoomPage 신고와 차단", () => {
  /** 다른 멤버의 메뉴에서 신고하기를 골라 신고 화면을 연다. */
  async function openReport(nickname: string) {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: `${nickname} 메뉴` }));
    await user.click(screen.getByRole("menuitem", { name: "신고하기" }));
    return user;
  }

  it("신고하기는 공부방 위에 신고 화면을 열고 닫으면 공부방이 그대로다", async () => {
    const { channel } = await enterGroupRoom({
      groupId: 10,
      snapshot: [meMember(), otherMember(42, "새벽러")],
    });
    const disconnect = vi.spyOn(channel, "disconnect");
    const user = await openReport("새벽러");
    expect(screen.getByRole("dialog", { name: "신고하기" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("새벽러님을 신고할게요")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "뒤로 가기" }));

    expect(screen.queryByText("새벽러님을 신고할게요")).toBeNull();
    expect(screen.getByTestId("live-room-page")).toBeInTheDocument();
    expect(disconnect).not.toHaveBeenCalled();
    expect(reportGroupMember).not.toHaveBeenCalled();
  });

  it("신고 화면을 닫으면 그 멤버의 메뉴 버튼으로 포커스가 돌아오고 다시 열면 사유가 비어 있다", async () => {
    await enterGroupRoom({ groupId: 10, snapshot: [meMember(), otherMember(42, "새벽러")] });
    const user = await openReport("새벽러");
    await user.type(screen.getByRole("textbox", { name: "신고 사유" }), "불쾌한 행동");

    await user.click(screen.getByRole("button", { name: "뒤로 가기" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "새벽러 메뉴" })).toHaveFocus());

    await openReport("새벽러");
    expect(screen.getByRole("textbox", { name: "신고 사유" })).toHaveValue("");
  });

  it("신고하면 그 사람과의 연결을 닫고 토스트를 띄우며 타일이 프로필로 바뀐다", async () => {
    vi.mocked(reportGroupMember).mockResolvedValue(undefined);
    const { pcs } = await enterGroupRoom({
      groupId: 10,
      snapshot: [meMember(), otherMember(42, "새벽러", { cameraOn: true })],
    });
    expect(screen.getAllByTestId("room-tile")[1]).toHaveAttribute("data-state", "FOCUS");
    const user = await openReport("새벽러");
    await user.type(
      screen.getByRole("textbox", { name: "신고 사유" }),
      "카메라 앞에서 불쾌한 행동을 했어요",
    );

    await user.click(screen.getByRole("button", { name: "신고하기" }));

    expect(reportGroupMember).toHaveBeenCalledWith(10, 42, "카메라 앞에서 불쾌한 행동을 했어요");
    expect(haptic).toHaveBeenCalledWith("medium");
    expect(await screen.findByText("새벽러님을 신고하고 차단했어요")).toBeInTheDocument();
    expect(screen.queryByText("새벽러님을 신고할게요")).toBeNull();
    expect(pcs.find((pc) => pc.closed)).toBeDefined();
    expect(screen.getAllByTestId("room-tile")[1]).toHaveAttribute("data-state", "OFF");
  });

  it("신고하면 차단 목록을 다시 받게 한다", async () => {
    vi.mocked(reportGroupMember).mockResolvedValue(undefined);
    const { client } = await enterGroupRoom({
      groupId: 10,
      snapshot: [meMember(), otherMember(42, "새벽러")],
    });
    client.setQueryData(groupKeys.blocks(7), { blocks: [] });
    const user = await openReport("새벽러");

    await user.click(screen.getByRole("button", { name: "신고하기" }));

    await waitFor(() =>
      expect(client.getQueryState(groupKeys.blocks(7))?.isInvalidated).toBe(true),
    );
  });

  it("신고에 실패하면 다시 시도 안내를 띄우고 신고 화면에 남는다", async () => {
    vi.mocked(reportGroupMember).mockRejectedValue(new ApiError("x", 500));
    const { pcs } = await enterGroupRoom({
      groupId: 10,
      snapshot: [meMember(), otherMember(42, "새벽러")],
    });
    const user = await openReport("새벽러");

    await user.click(screen.getByRole("button", { name: "신고하기" }));

    // 신고 화면이 공부방을 덮어서 안내는 신고 화면 안에 뜬다.
    const layer = screen.getByRole("dialog", { name: "신고하기" });
    expect(await within(layer).findByText("잠시 후 다시 시도해 주세요")).toBeInTheDocument();
    expect(within(layer).getByText("새벽러님을 신고할게요")).toBeInTheDocument();
    expect(pcs.some((pc) => pc.closed)).toBe(false);
  });

  it("그사이 그룹을 떠난 멤버를 신고하면 다시 시도 안내 없이 신고 화면을 닫는다", async () => {
    vi.mocked(reportGroupMember).mockRejectedValue(
      new ApiError("x", 404, "GROUP_MEMBER_NOT_FOUND"),
    );
    const { pcs } = await enterGroupRoom({
      groupId: 10,
      snapshot: [meMember(), otherMember(42, "새벽러")],
    });
    const user = await openReport("새벽러");

    await user.click(screen.getByRole("button", { name: "신고하기" }));

    await waitFor(() => expect(screen.queryByText("새벽러님을 신고할게요")).toBeNull());
    expect(screen.queryByText("잠시 후 다시 시도해 주세요")).toBeNull();
    expect(pcs.some((pc) => pc.closed)).toBe(false);
  });

  it("보내는 중에는 다시 보낼 수 없다", async () => {
    vi.mocked(reportGroupMember).mockImplementation(() => new Promise(() => {}));
    await enterGroupRoom({ groupId: 10, snapshot: [meMember(), otherMember(42, "새벽러")] });
    const user = await openReport("새벽러");

    await user.click(screen.getByRole("button", { name: "신고하기" }));

    expect(screen.getByRole("button", { name: "신고하기" })).toBeDisabled();
    expect(reportGroupMember).toHaveBeenCalledOnce();
  });

  it("신고 화면은 닉네임과 사유가 클릭 분석에 실리지 않게 가린다", async () => {
    await enterGroupRoom({ groupId: 10, snapshot: [meMember(), otherMember(42, "새벽러")] });
    await openReport("새벽러");
    const layer = screen.getByRole("dialog", { name: "신고하기" });

    expect(layer).toHaveAttribute("data-amp-mask");
    expect(layer).toHaveAttribute("data-amp-mask-attributes", "aria-label");
  });

  it("신고 화면이 열린 동안은 시간이 지나도 조작이 숨지 않는다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await enterGroupRoom({ groupId: 10, snapshot: [meMember(), otherMember(42, "새벽러")] });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: "새벽러 메뉴" }));
    await user.click(screen.getByRole("menuitem", { name: "신고하기" }));

    await act(() => vi.advanceTimersByTimeAsync(6_000));

    expect(screen.getByText("새벽러님을 신고할게요")).toBeInTheDocument();
    expect(screen.getByTestId("room-control-bar")).not.toHaveAttribute("inert");
  });

  it("PEER_BLOCKED를 받으면 그 사람 타일이 프로필로 바뀌고 마이크도 꺼짐으로 보인다", async () => {
    const { channel } = await enterGroupRoom({
      groupId: 10,
      snapshot: [meMember(), otherMember(56, "선규", { cameraOn: true, micOn: true })],
    });
    const tile = screen.getAllByTestId("room-tile")[1]!;
    expect(tile).toHaveAttribute("data-state", "FOCUS");
    expect(within(tile).getByRole("img", { name: "마이크 켜짐" })).toBeInTheDocument();

    act(() => channel.emitServerMessage({ type: "PEER_BLOCKED", userId: 56 }));

    expect(screen.getAllByTestId("room-tile")[1]).toHaveAttribute("data-state", "OFF");
    expect(
      within(screen.getAllByTestId("room-tile")[1]!).getByRole("img", { name: "마이크 꺼짐" }),
    ).toBeInTheDocument();
  });

  it("차단한 멤버의 타일은 차단한 순간부터 말하는 중으로 보이지 않는다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { channel, pcs, player } = await enterGroupRoom({
      groupId: 10,
      snapshot: [meMember(), otherMember(56, "선규", { micOn: true })],
    });
    act(() => pcs[0]?.ontrack?.({ streams: [], track: { kind: "audio" } }));
    player.level.mockReturnValue(1);
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(screen.getAllByTestId("room-tile")[1]).toHaveAttribute("data-speaking", "true");

    act(() => channel.emitServerMessage({ type: "PEER_BLOCKED", userId: 56 }));

    expect(screen.getAllByTestId("room-tile")[1]).not.toHaveAttribute("data-speaking");
  });
});

describe("GroupRoomPage 멤버 내보내기", () => {
  /** 다른 멤버의 메뉴에서 그룹에서 내보내기를 골라 확인 창을 연다. */
  async function openKick(nickname: string) {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: `${nickname} 메뉴` }));
    await user.click(screen.getByRole("menuitem", { name: "그룹에서 내보내기" }));
    return {
      user,
      dialog: screen.getByRole("alertdialog", { name: `${nickname}님을 내보낼까요?` }),
    };
  }

  it("그룹장만 멤버 메뉴에 내보내기가 있다", async () => {
    await enterGroupRoom({
      groupId: 10,
      snapshot: [meMember({ owner: false }), otherMember(42, "새벽러")],
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "새벽러 메뉴" }));
    expect(screen.queryByRole("menuitem", { name: "그룹에서 내보내기" })).toBeNull();
  });

  it("SNAPSHOT의 내 그룹장 값이 그룹 홈의 내 역할보다 먼저다", async () => {
    await enterGroupRoom({
      groupId: 10,
      myRole: "MEMBER",
      snapshot: [meMember({ owner: true }), otherMember(42, "새벽러")],
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "새벽러 메뉴" }));
    expect(screen.getByRole("menuitem", { name: "그룹에서 내보내기" })).toBeInTheDocument();
  });

  it("SNAPSHOT에 그룹장 값이 없으면 그룹 홈의 내 역할로 정한다", async () => {
    await enterGroupRoom({
      groupId: 10,
      myRole: "OWNER",
      snapshot: [meMember({ owner: undefined }), otherMember(42, "새벽러")],
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "새벽러 메뉴" }));
    expect(screen.getByRole("menuitem", { name: "그룹에서 내보내기" })).toBeInTheDocument();
  });

  it("내보내기는 세션 모양 확인 창을 거치고 비공개 그룹이면 코드가 바뀌었다고 알린다", async () => {
    vi.mocked(kickGroupMember).mockResolvedValue(undefined);
    const { client } = await enterGroupRoom({
      groupId: 11,
      visibility: "PRIVATE",
      snapshot: [meMember({ owner: true }), otherMember(42, "새벽러")],
    });
    client.setQueryData(groupKeys.invite(7, 11), { inviteCode: "K7Q2M9" });
    const { user, dialog } = await openKick("새벽러");
    expect(dialog).toHaveAccessibleDescription("새벽러님은 3일 동안 다시 들어올 수 없어요");
    expect(within(dialog).getByRole("button", { name: "내보내기" })).toHaveAttribute(
      "data-tone",
      "danger",
    );
    vi.mocked(haptic).mockClear();

    await user.click(within(dialog).getByRole("button", { name: "내보내기" }));

    expect(kickGroupMember).toHaveBeenCalledWith(11, 42);
    expect(haptic).toHaveBeenCalledWith("medium");
    expect(await screen.findByText("초대코드가 새로 바뀌었어요")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(client.getQueryState(groupKeys.invite(7, 11))?.isInvalidated).toBe(true);
  });

  it("공개 그룹에서 내보내면 코드 안내 없이 멤버 목록을 다시 받게 한다", async () => {
    vi.mocked(kickGroupMember).mockResolvedValue(undefined);
    const { client } = await enterGroupRoom({
      groupId: 10,
      visibility: "PUBLIC",
      snapshot: [meMember({ owner: true }), otherMember(42, "새벽러")],
    });
    client.setQueryData(groupKeys.members(7, 10), { members: [] });
    const { user, dialog } = await openKick("새벽러");

    await user.click(within(dialog).getByRole("button", { name: "내보내기" }));

    await waitFor(() =>
      expect(client.getQueryState(groupKeys.members(7, 10))?.isInvalidated).toBe(true),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByText("초대코드가 새로 바뀌었어요")).toBeNull();
  });

  it("내보내기 확인 창은 닉네임이 클릭 분석에 실리지 않게 가린다", async () => {
    await enterGroupRoom({
      groupId: 10,
      snapshot: [meMember({ owner: true }), otherMember(42, "새벽러")],
    });
    const { dialog } = await openKick("새벽러");

    expect(dialog).toHaveAttribute("data-amp-mask");
    expect(dialog).toHaveAttribute("data-amp-mask-attributes", "aria-label");
  });

  it("취소하면 내보내지 않는다", async () => {
    await enterGroupRoom({
      groupId: 10,
      snapshot: [meMember({ owner: true }), otherMember(42, "새벽러")],
    });
    const { user, dialog } = await openKick("새벽러");

    await user.click(within(dialog).getByRole("button", { name: "취소" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(kickGroupMember).not.toHaveBeenCalled();
  });

  it("그룹장이 바뀌면 메뉴의 내보내기가 사라진다", async () => {
    const { channel } = await enterGroupRoom({
      groupId: 10,
      snapshot: [meMember({ owner: true }), otherMember(42, "새벽러")],
    });
    act(() => channel.emitServerMessage({ type: "OWNER_CHANGED", userId: 42 }));
    await userEvent.setup().click(screen.getByRole("button", { name: "새벽러 메뉴" }));
    expect(screen.queryByRole("menuitem", { name: "그룹에서 내보내기" })).toBeNull();
  });

  it("보내는 중에는 다시 내보낼 수 없다", async () => {
    vi.mocked(kickGroupMember).mockImplementation(() => new Promise(() => {}));
    await enterGroupRoom({
      groupId: 10,
      snapshot: [meMember({ owner: true }), otherMember(42, "새벽러")],
    });
    const { user, dialog } = await openKick("새벽러");

    await user.click(within(dialog).getByRole("button", { name: "내보내기" }));

    expect(within(dialog).getByRole("button", { name: "내보내기" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "취소" })).toBeDisabled();
    expect(kickGroupMember).toHaveBeenCalledOnce();
  });

  it("내보내기에 실패하면 다시 시도 안내를 띄운다", async () => {
    vi.mocked(kickGroupMember).mockRejectedValue(new ApiError("x", 500));
    await enterGroupRoom({
      groupId: 10,
      snapshot: [meMember({ owner: true }), otherMember(42, "새벽러")],
    });
    const { user, dialog } = await openKick("새벽러");

    await user.click(within(dialog).getByRole("button", { name: "내보내기" }));

    expect(await screen.findByText("잠시 후 다시 시도해 주세요")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("그사이 그룹을 떠난 멤버를 내보내면 다시 시도 안내 없이 창을 닫는다", async () => {
    vi.mocked(kickGroupMember).mockRejectedValue(new ApiError("x", 404, "GROUP_MEMBER_NOT_FOUND"));
    await enterGroupRoom({
      groupId: 10,
      snapshot: [meMember({ owner: true }), otherMember(42, "새벽러")],
    });
    const { user, dialog } = await openKick("새벽러");

    await user.click(within(dialog).getByRole("button", { name: "내보내기" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.queryByText("잠시 후 다시 시도해 주세요")).toBeNull();
  });

  it("내보내기 확인 창이 열린 동안은 시간이 지나도 조작이 숨지 않는다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await enterGroupRoom({
      groupId: 10,
      snapshot: [meMember({ owner: true }), otherMember(42, "새벽러")],
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: "새벽러 메뉴" }));
    await user.click(screen.getByRole("menuitem", { name: "그룹에서 내보내기" }));

    await act(() => vi.advanceTimersByTimeAsync(6_000));

    expect(screen.getByRole("alertdialog", { name: "새벽러님을 내보낼까요?" })).toBeInTheDocument();
    expect(screen.getByTestId("room-control-bar")).not.toHaveAttribute("inert");
  });
});
