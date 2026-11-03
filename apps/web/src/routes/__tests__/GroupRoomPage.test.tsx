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
import { ApiError } from "@/lib/api";
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

  it("그룹 공부방 연결은 소리와 영상을 한 전송 경로로 묶는다", async () => {
    const { pcConfigs } = renderGroupRoom({ snapshot: [member(7), member(42)] });
    await waitFor(() => expect(pcConfigs).toHaveLength(1));
    expect(pcConfigs[0]).toMatchObject({ bundlePolicy: "max-bundle" });
  });

  it("상대 소리가 오면 공부방의 재생기에 붙인다", async () => {
    const { pcs, player } = renderGroupRoom({ snapshot: [member(7), member(42)] });
    await waitFor(() => expect(pcs).toHaveLength(1));
    const voice = { kind: "audio" };

    act(() => pcs[0]?.ontrack?.({ streams: [], track: voice }));

    expect(player.attach).toHaveBeenCalledWith(42, voice);
  });
});
