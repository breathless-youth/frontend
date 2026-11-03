import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RoomMember, StudySessionListResponse, SubjectResponse } from "@focusmakers/types";

import type { MicAcquireResult } from "@/features/live-room/audio/microphone";
import type { RemoteAudioPlayer } from "@/features/live-room/audio/remoteAudio";
import { createMockRoomChannel } from "@/features/live-room/mockRoomChannel";
import { EMPTY_STATS } from "@/features/planner/plannerDay";
import { createMockCameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import { renewLiveRoomSeat } from "@/lib/roomApi";
import type * as UserId from "@/lib/userId";

import { LiveRoomPage } from "../LiveRoomPage";

// 이 파일은 초대코드 방이 소리를 쓰지 않는지만 본다. 신원은 주소 대신 훅을 바꿔 정한다.
vi.mock("@/lib/userId", async (importOriginal) => ({
  ...(await importOriginal<typeof UserId>()),
  useUserId: vi.fn(() => 7),
  useIdentityPending: vi.fn(() => false),
}));
vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: vi.fn(() => ({ settled: true, restored: null })),
}));
vi.mock("@/lib/roomApi", () => ({ renewLiveRoomSeat: vi.fn(), leaveRoom: vi.fn() }));
vi.mock("@/lib/profileApi", () => ({
  getProfile: vi.fn(async () => ({
    nickname: "포메3721",
    goal: null,
    category: null,
    initial: "포",
    colorIndex: 0,
  })),
}));
vi.mock("@/features/study-session/submitStudySession", () => ({ submitStudySession: vi.fn() }));
vi.mock("@/lib/subjectApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listSubjects: vi.fn(async (): Promise<SubjectResponse[]> => []),
}));
vi.mock("@/lib/statsApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listStudySessionStats: vi.fn(async (): Promise<StudySessionListResponse> => EMPTY_STATS),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function member(userId: number): RoomMember {
  return { userId, nickname: `멤버${userId}`, cameraOn: true, focusState: "FOCUS", focusSec: 0 };
}

function createFakePc() {
  return {
    iceConnectionState: "new",
    onicecandidate: null,
    ontrack: null,
    oniceconnectionstatechange: null,
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
    close() {},
  };
}

describe("LiveRoomPage 초대코드 방의 소리", () => {
  it("소리 칸을 협상하지 않고 상대 소리 재생기와 마이크를 만들지 않는다", async () => {
    vi.mocked(renewLiveRoomSeat).mockResolvedValue({
      roomId: 42,
      graceRejoin: false,
      cameraOn: null,
      iceServers: [],
      iceTtlSeconds: 600,
    });
    const pcConfigs: RTCConfiguration[] = [];
    const createPlayer = vi.fn<() => RemoteAudioPlayer>();
    const acquire = vi.fn<() => Promise<MicAcquireResult>>();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter
          initialEntries={[{ pathname: "/social/room/42", state: { inviteCode: "0712" } }]}
        >
          <Routes>
            <Route
              path="/social/room/:roomId"
              element={
                <LiveRoomPage
                  createChannel={() => createMockRoomChannel({ snapshot: [member(7), member(8)] })}
                  createCamera={() => createMockCameraAdapter()}
                  createPeerConnection={(config) => {
                    pcConfigs.push(config);
                    return createFakePc() as unknown as RTCPeerConnection;
                  }}
                  audioDeps={{ acquire, createPlayer }}
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole("button", { name: "나가기" });
    await act(async () => {});

    await waitFor(() => expect(pcConfigs).toHaveLength(1));
    expect(pcConfigs[0]).not.toHaveProperty("bundlePolicy");
    expect(createPlayer).not.toHaveBeenCalled();
    expect(acquire).not.toHaveBeenCalled();
  });
});
