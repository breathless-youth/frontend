import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RoomMember } from "@focusmakers/types";

import { createMockRoomChannel } from "@/features/live-room/mockRoomChannel";
import type { MockRoomScenario } from "@/features/live-room/mockRoomChannel";
import { createMockCameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import type { CameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import { submitStudySession } from "@/features/study-session/submitStudySession";
import { ApiError } from "@/lib/api";
import { consumeSocialRoomNotice } from "@/features/social-room/socialRoomNotice";
import { getProfile } from "@/lib/profileApi";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
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
    cameraOn: true,
    focusState: "FOCUS",
    studySeconds: 0,
    ...overrides,
  };
}

function createFakePc() {
  const pc = {
    senders: [] as {
      track: { enabled: boolean } | null;
      replaceTrack: () => Promise<void>;
      setParameters: () => Promise<void>;
      getParameters: () => { encodings: object[] };
    }[],
    closed: false,
    iceConnectionState: "new",
    onicecandidate: null as ((e: { candidate: unknown }) => void) | null,
    ontrack: null as ((e: { streams: unknown[] }) => void) | null,
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
    addTrack(track: { enabled: boolean }) {
      const sender = {
        track,
        replaceTrack: async () => undefined,
        setParameters: async () => undefined,
        getParameters: () => ({ encodings: [{}] }),
      };
      pc.senders.push(sender);
      return sender;
    },
    getSenders() {
      return pc.senders;
    },
    close() {
      pc.closed = true;
    },
  };
  return pc;
}

type FakePc = ReturnType<typeof createFakePc>;

function renderRoom({
  state = { inviteCode: "0712" },
  search = "?userId=7",
  scenario = { snapshot: [] },
  camera = createMockCameraAdapter(),
  createCamera,
}: {
  state?: unknown;
  search?: string;
  scenario?: MockRoomScenario;
  camera?: CameraAdapter;
  createCamera?: () => CameraAdapter;
} = {}) {
  const channel = createMockRoomChannel(scenario);
  const pcs: FakePc[] = [];
  const pcConfigs: RTCConfiguration[] = [];
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: "/social/room/42", search, state }]}>
        <Routes>
          <Route
            path="/social/room/:roomId"
            element={
              <LiveRoomPage
                createChannel={() => channel}
                createCamera={createCamera ?? (() => camera)}
                createPeerConnection={(config) => {
                  pcConfigs.push(config);
                  const pc = createFakePc();
                  pcs.push(pc);
                  return pc as unknown as RTCPeerConnection;
                }}
              />
            }
          />
          <Route path="/social" element={<div data-testid="social-home-stub" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { channel, pcs, pcConfigs };
}

/** 일반 입장 — 모달 없이 join·프로필 결착을 기다려 꺼짐(일시정지) 상태로 세션에 들어간다. */
/** 네이티브 게이트 응답(허용)을 흉내 낸다 — 브리지를 stub한 테스트에서 입장을 통과시킨다. */
function grantCameraGate() {
  const entry = (globalThis as unknown as Record<string, ((raw: string) => void) | undefined>)[
    NATIVE_MESSAGE_ENTRY
  ];
  entry?.(JSON.stringify({ type: "camera-gate-result", granted: true, atMs: 1 }));
}

async function enterRoom() {
  await screen.findByRole("button", { name: "나가기" });
  // findByRole은 마운트 커밋 직후(패시브 이펙트 전) DOM을 잡을 수 있다 — 채널 연결·
  // 끄고 입장 일시정지·SNAPSHOT 반영까지 흘려보낸 뒤 돌려줘야 단언이 결정적이다.
  await act(async () => {});
}

/** 화면 탭 = 바 토글. 드래그(스크롤)와 구분되므로 down+up 쌍으로 보낸다(BY-435). */
function tapSurface() {
  const surface = screen.getByTestId("live-room-page");
  fireEvent.pointerDown(surface, { clientX: 10, clientY: 10 });
  fireEvent.pointerUp(surface, { clientX: 10, clientY: 10 });
}

/** 세션 중 카메라 켜기 — 입장이 항상 꺼짐이라, 켜기는 확인 모달을 거치는 이 경로뿐이다. */
async function turnCameraOn() {
  await userEvent.click(await screen.findByRole("button", { name: "카메라 켜기" }));
  const dialog = screen.getByRole("alertdialog");
  await userEvent.click(within(dialog).getByRole("button", { name: "카메라 켜기" }));
  await waitFor(() => {
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
}

beforeEach(() => {
  // 일반 입장이 마운트 시 join을 재호출하므로 기본 응답을 렌더 전에 깔아 둔다.
  // 실패·지연을 검증하는 테스트는 renderRoom 전에 이 mock을 덮어쓴다.
  mockedJoinRoom.mockResolvedValue(joinResponse);
  // 종료 이동 경로가 leaveRoom의 Promise를 전제한다 — 파일 전역으로 깔아 테스트가
  // 실행 순서(다른 테스트의 mockResolvedValue 잔류)에 기대지 않게 한다.
  mockedLeaveRoom.mockResolvedValue(undefined);
});

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

  it("진입하면 확인 모달 없이 일시정지(카메라 끔) 상태로 즉시 입장한다", async () => {
    renderRoom();

    await enterRoom();

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    // 카메라 끔 = 측정 일시정지 동치 — 컨트롤이 켜기를 노출하고 내 비디오는 그려지지 않는다.
    expect(screen.getByRole("button", { name: "카메라 켜기" })).toBeInTheDocument();
    expect(screen.queryByTestId("room-my-video")).not.toBeInTheDocument();
  });

  it("마운트 시 join을 재호출하고 채널을 연결해 룸에 들어간다 — 자리 예약 TTL 재예약", async () => {
    const { channel } = renderRoom();

    await enterRoom();

    expect(mockedJoinRoom).toHaveBeenCalledWith(7, "0712");
    expect(channel.status).toBe("open");
  });

  it("입장 단계에서 만든 카메라 어댑터를 세션이 그대로 쓴다 — 팩토리 1회, 세션이 유일한 start 지점", async () => {
    let factoryCalls = 0;
    let stopCalls = 0;
    const base = createMockCameraAdapter();
    const camera: CameraAdapter = {
      get facing() {
        return base.facing;
      },
      get isRunning() {
        return base.isRunning;
      },
      start: () => base.start(),
      stop: () => {
        stopCalls += 1;
        base.stop();
      },
      flip: () => base.flip(),
    };
    renderRoom({
      createCamera: () => {
        factoryCalls += 1;
        return camera;
      },
    });
    await enterRoom();

    expect(factoryCalls).toBe(1);
    expect(stopCalls).toBe(0);
    expect(base.isRunning).toBe(true);
  });

  it("프로필 조회가 실패해도 폴백으로 입장한다", async () => {
    vi.mocked(getProfile).mockRejectedValueOnce(new Error("프로필 오류"));
    renderRoom();

    await enterRoom();

    expect(screen.getByRole("button", { name: "카메라 켜기" })).toBeInTheDocument();
  });

  it("유예 재입장은 join 재호출 없이 입장한다", async () => {
    renderRoom({ state: { inviteCode: "0712", graceRejoin: true } });

    await enterRoom();

    expect(screen.getByRole("button", { name: "카메라 켜기" })).toBeInTheDocument();
    expect(mockedJoinRoom).not.toHaveBeenCalled();
  });

  it("유예 재입장도 카메라 꺼짐(일시정지)으로 시작한다 — 나가기가 곧 일시정지다", async () => {
    const { channel } = renderRoom({
      state: { inviteCode: "0712", graceRejoin: true },
    });

    await enterRoom();

    expect(screen.getByRole("button", { name: "카메라 켜기" })).toBeInTheDocument();
    await waitFor(() => {
      expect(channel.published).toContainEqual({ cameraOn: false });
    });
    expect(channel.published).not.toContainEqual({ cameraOn: true });
    expect(mockedJoinRoom).not.toHaveBeenCalled();
  });

  it("join 재호출이 끝나기 전에는 세션(측정)이 마운트되지 않는다", async () => {
    mockedJoinRoom.mockReturnValue(new Promise(() => undefined));
    renderRoom();

    await waitFor(() => expect(mockedJoinRoom).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId("live-room-page")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "나가기" })).not.toBeInTheDocument();
  });

  it("재-join이 실패하면 인라인 오류를 보여주고 다시 시도는 join부터 재시작한다", async () => {
    mockedJoinRoom.mockRejectedValue(new ApiError("정원 초과", 409, "CONFLICT"));
    renderRoom();

    expect(await screen.findByText("방이 가득 찼어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "나가기" })).not.toBeInTheDocument();

    mockedJoinRoom.mockResolvedValue(joinResponse);
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    await enterRoom();
    expect(mockedJoinRoom).toHaveBeenCalledTimes(2);
  });

  it("재-join 실패 화면의 [소셜 홈으로]는 소셜 홈으로 돌려보낸다", async () => {
    mockedJoinRoom.mockRejectedValue(new ApiError("정원 초과", 409, "CONFLICT"));
    renderRoom();
    await screen.findByText("방이 가득 찼어요");

    await userEvent.click(screen.getByRole("button", { name: "소셜 홈으로" }));

    expect(await screen.findByTestId("social-home-stub")).toBeInTheDocument();
  });

  it("state 없이 ?code가 있으면 그 코드로 입장한다 — 렌더러 사망 후 복원된 문서(BY-436)", async () => {
    mockedJoinRoom.mockResolvedValue(joinResponse);
    renderRoom({ state: null, search: "?userId=7&code=0712" });

    await enterRoom();

    expect(mockedJoinRoom).toHaveBeenCalledWith(7, "0712");
    expect(screen.queryByTestId("social-home-stub")).not.toBeInTheDocument();
  });

  it("state도 완전한 ?code도 없으면 소셜 홈으로 돌려보낸다", () => {
    renderRoom({ state: null, search: "?userId=7&code=07" });

    expect(screen.getByTestId("social-home-stub")).toBeInTheDocument();
    expect(mockedJoinRoom).not.toHaveBeenCalled();
  });

  it("방이 사라졌으면(ROOM_CLOSED) 화면에 붙잡지 않고 소셜 홈으로 내보낸다", async () => {
    // 백그라운드 복귀로 웹뷰가 리로드되며 재-join하는데 그 사이 전원이 나가 방이 소멸한 경우.
    // 종전에는 코드 재확인 문구와 [다시 시도]만 남아 아무것도 할 수 없었다(BY-436).
    mockedJoinRoom.mockRejectedValue(new ApiError("소멸된 방", 404, "ROOM_CLOSED"));
    renderRoom();

    expect(await screen.findByTestId("social-home-stub")).toBeInTheDocument();
    expect(consumeSocialRoomNotice()).toBe("방이 만료되었어요");
  });

  it("소멸 10분이 지나 INVITE_CODE_NOT_FOUND로 바뀌어도 같은 안내로 내보낸다", async () => {
    mockedJoinRoom.mockRejectedValue(new ApiError("없는 코드", 404, "INVITE_CODE_NOT_FOUND"));
    renderRoom();

    expect(await screen.findByTestId("social-home-stub")).toBeInTheDocument();
    expect(consumeSocialRoomNotice()).toBe("방이 만료되었어요");
  });

  it("5xx는 내보내지 않는다 — 방이 살아 있는데 쫓아내면 측정이 날아간다", async () => {
    mockedJoinRoom.mockRejectedValue(new ApiError("서버 오류", 500, "INTERNAL_ERROR"));
    renderRoom();

    expect(await screen.findByText("잠시 후 다시 시도해 주세요")).toBeInTheDocument();
    expect(screen.queryByTestId("social-home-stub")).not.toBeInTheDocument();
  });

  it("카메라 획득에 실패해도 꺼짐만 발행된다 — 거짓 켜짐 금지", async () => {
    const { channel } = renderRoom({ camera: createMockCameraAdapter({ failToStart: true }) });

    await enterRoom();

    await waitFor(() => {
      expect(channel.published).toContainEqual({ cameraOn: false });
    });
    expect(channel.published).not.toContainEqual({ cameraOn: true });
  });

  it("카메라 획득 실패 상태에서 켜도 켜짐을 발행하지 않는다", async () => {
    const { channel } = renderRoom({ camera: createMockCameraAdapter({ failToStart: true }) });
    await enterRoom();
    channel.published.length = 0;

    await turnCameraOn();

    expect(channel.published).not.toContainEqual({ cameraOn: true });
  });

  it("입장하면 꺼짐만 정확히 1회 발행한다 — 켜짐이 먼저 새 나가면 안 된다", async () => {
    const { channel } = renderRoom();

    await enterRoom();

    await waitFor(() => {
      // 마운트 studySeconds 0 발행은 정상이라 카메라 발행만 본다.
      expect(channel.published.filter((p) => p.cameraOn !== undefined)).toEqual([
        { cameraOn: false },
      ]);
    });
  });
});

describe("LiveRoomPage — 그리드·타일", () => {
  it("혼자면 풀스크린이라 타일 크롬이 없고, 켜면 내 비디오는 amp-block과 sentry-block으로 가려진다", async () => {
    renderRoom();

    await enterRoom();
    expect(screen.queryAllByTestId("room-tile")).toHaveLength(0);

    await turnCameraOn();

    expect(await screen.findByTestId("room-my-video")).toHaveClass("amp-block", "sentry-block");
  });

  it("세션 영상은 탭을 받지 않는다 — 탭이 닿으면 iOS가 네이티브 컨트롤을 띄운다", async () => {
    renderRoom();

    await enterRoom();
    await turnCameraOn();

    expect(await screen.findByTestId("room-my-video")).toHaveClass(
      "pointer-events-none",
      "session-video",
    );
  });

  it("셀프뷰 스트림이 붙으면 재생을 직접 건다 — autoplay 속성에만 맡기지 않는다", async () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    // 기본 목 카메라는 stream이 없어 재생 킥 경로를 못 탄다 — 스트림 있는 카메라를 쓴다.
    const stream = {
      getVideoTracks: () => [{ enabled: true, getSettings: () => ({ height: 720 }) }],
    } as unknown as MediaStream;
    let running = false;
    const camera: CameraAdapter = {
      facing: "front",
      get isRunning() {
        return running;
      },
      get stream() {
        return running ? stream : null;
      },
      async start() {
        running = true;
      },
      stop() {
        running = false;
      },
      async flip() {
        return { ok: true, facing: "front" };
      },
    };
    renderRoom({ camera });

    await enterRoom();
    // turnCameraOn 헬퍼 대신 단계를 풀어 쓴다 — 모달 미리보기(ClonedTrackPreview)도
    // play()를 호출하므로, 확인 직전에 spy를 비워야 셀프뷰의 호출만 단언된다.
    await userEvent.click(await screen.findByRole("button", { name: "카메라 켜기" }));
    const dialog = screen.getByRole("alertdialog");
    playSpy.mockClear();
    await userEvent.click(within(dialog).getByRole("button", { name: "카메라 켜기" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    const video = await screen.findByTestId("room-my-video");

    expect((video as HTMLVideoElement).srcObject).toBe(stream);
    expect(video).not.toHaveAttribute("autoplay");
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("내 비디오는 전면 카메라일 때 거울로 보인다 — 카메라 전환 시 해제", async () => {
    let facing: "front" | "back" = "front";
    const stream = {
      getVideoTracks: () => [{ enabled: true, getSettings: () => ({ height: 720 }) }],
    } as unknown as MediaStream;
    let running = false;
    const camera: CameraAdapter = {
      get facing() {
        return facing;
      },
      get isRunning() {
        return running;
      },
      get stream() {
        return running ? stream : null;
      },
      async start() {
        running = true;
      },
      stop() {
        running = false;
      },
      async flip() {
        facing = facing === "front" ? "back" : "front";
        return { ok: true, facing };
      },
    };
    renderRoom({ camera });
    await enterRoom();
    await turnCameraOn();

    expect(await screen.findByTestId("room-my-video")).toHaveClass("scale-x-[-1]");

    await userEvent.click(screen.getByRole("button", { name: "카메라 전환" }));

    await waitFor(() => {
      expect(screen.getByTestId("room-my-video")).not.toHaveClass("scale-x-[-1]");
    });
  });

  it("꺼진 카메라를 켤 때 모달 미리보기는 복제 트랙을 켜서 보여준다 — 원본은 꺼진 채 유지", async () => {
    class FakeMediaStream {
      tracks: unknown[];
      constructor(tracks: unknown[]) {
        this.tracks = tracks;
      }
      getVideoTracks() {
        return this.tracks;
      }
    }
    vi.stubGlobal("MediaStream", FakeMediaStream);
    const clone = { enabled: false, stop: vi.fn() };
    const track = {
      enabled: true,
      getSettings: () => ({ height: 720 }),
      clone: () => clone,
    };
    const stream = { getVideoTracks: () => [track] } as unknown as MediaStream;
    let running = false;
    const camera: CameraAdapter = {
      facing: "front",
      get isRunning() {
        return running;
      },
      get stream() {
        return running ? stream : null;
      },
      async start() {
        running = true;
      },
      stop() {
        running = false;
      },
      async flip() {
        return { ok: false, reason: "no-alternative" };
      },
    };
    renderRoom({ camera });
    await enterRoom();

    // 꺼짐(일시정지) 입장이라 원본 트랙은 이미 비활성이다.
    await waitFor(() => expect(track.enabled).toBe(false));
    await userEvent.click(screen.getByRole("button", { name: "카메라 켜기" }));

    const preview = screen.getByTestId("camera-dialog-preview") as HTMLVideoElement;
    await waitFor(() => {
      const src = preview.srcObject as unknown as FakeMediaStream | null;
      expect(src?.getVideoTracks()[0]).toBe(clone);
    });
    expect(clone.enabled).toBe(true);
    expect(track.enabled).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(clone.stop).toHaveBeenCalled();
  });

  it("켜기 모달 미리보기는 확정 후 셀프뷰가 놓일 서피스와 같은 비율로 잘라 보여준다", async () => {
    // 모달 박스(288×234)와 셀프뷰 서피스(세로 풀스크린·타일)는 비율이 달라, 둘 다 cover면
    // 잘리는 영역이 달라진다 — 미리보기가 실제보다 좁게 보이던 문제(2026-08-25 실기기).
    const rect = { width: 390, height: 844 } as DOMRect;
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(rect);
    try {
      renderRoom();
      await enterRoom();
      await userEvent.click(screen.getByRole("button", { name: "카메라 켜기" }));

      const frame = screen.getByTestId("camera-dialog-preview-frame");
      expect(Number.parseFloat(frame.style.aspectRatio)).toBeCloseTo(390 / 844, 5);
    } finally {
      spy.mockRestore();
    }
  });

  it("모달이 열린 채 회전하면 미리보기 비율을 다시 잰다 — 세로 비율이 가로에 남지 않는다", async () => {
    const portrait = { width: 390, height: 844 } as DOMRect;
    const landscape = { width: 844, height: 390 } as DOMRect;
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(portrait);
    try {
      renderRoom();
      await enterRoom();
      await userEvent.click(screen.getByRole("button", { name: "카메라 켜기" }));

      const frame = screen.getByTestId("camera-dialog-preview-frame");
      expect(Number.parseFloat(frame.style.aspectRatio)).toBeCloseTo(390 / 844, 5);

      spy.mockReturnValue(landscape);
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      await waitFor(() => {
        expect(
          Number.parseFloat(screen.getByTestId("camera-dialog-preview-frame").style.aspectRatio),
        ).toBeCloseTo(844 / 390, 5);
      });
    } finally {
      spy.mockRestore();
    }
  });

  it("서피스를 못 재면(높이 0) 미리보기는 비율 래퍼 없이 박스를 그대로 채운다", async () => {
    // jsdom 기본 rect가 0×0이라 별도 stub 없이 측정 실패 경로가 된다.
    renderRoom();
    await enterRoom();
    await userEvent.click(screen.getByRole("button", { name: "카메라 켜기" }));

    expect(screen.getByTestId("camera-dialog-preview")).toBeInTheDocument();
    expect(screen.queryByTestId("camera-dialog-preview-frame")).not.toBeInTheDocument();
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

    // 입장 직후 2개(나+멤버8)를 중간 단언하지 않는다 — 시나리오의 30ms 타이머가 느린
    // CI 러너에서는 enterRoom이 끝나기 전에 발화해 이미 3개일 수 있다(CI 간헐 실패).
    // 검증 의도는 MEMBER_JOINED 수신으로 그리드가 재배치된다는 것 하나다.
    await waitFor(() => {
      expect(screen.getAllByTestId("room-tile")).toHaveLength(3);
    });
  });

  it("카메라 획득에 실패하면 켜도 내 타일은 꺼짐으로 표시된다 — 검은 화면을 켜짐으로 그리지 않는다", async () => {
    renderRoom({
      scenario: { snapshot: [member(8)] },
      camera: createMockCameraAdapter({ failToStart: true }),
    });

    await enterRoom();
    await turnCameraOn();

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

  it("1인 전체화면에도 내 상태 뱃지가 뜬다 — 꺼짐 입장은 일시정지, 켜면 집중", async () => {
    renderRoom();

    await enterRoom();
    expect(screen.getByTestId("self-state-badge")).toHaveAttribute("data-state", "PAUSED");

    await turnCameraOn();

    await waitFor(() => {
      expect(screen.getByTestId("self-state-badge")).toHaveAttribute("data-state", "FOCUS");
    });
  });

  it("그리드 뱃지: 내 타일은 로컬 상태, 타 참가자도 집중 상태 색을 쓴다 (2026-08-25 BY-435 개정)", async () => {
    renderRoom({
      scenario: { snapshot: [member(8), member(9, { focusState: "DISTRACTED" })] },
    });

    await enterRoom();

    const tiles = screen.getAllByTestId("room-tile");
    const badge = (id: string) => {
      const tile = tiles.find((candidate) => candidate.getAttribute("data-user-id") === id);
      if (tile === undefined) {
        throw new Error(`${id} 타일이 없다`);
      }
      return within(tile).getByTestId("self-state-badge");
    };
    expect(badge("7")).toHaveAttribute("data-state", "PAUSED");
    expect(badge("8")).toHaveAttribute("data-state", "FOCUS");
    expect(badge("9")).toHaveAttribute("data-state", "DISTRACTED");
  });
});

describe("LiveRoomPage — P2P 연동", () => {
  it("SNAPSHOT 멤버에게 OFFER 시그널이 발행된다", async () => {
    const { channel } = renderRoom({ scenario: { snapshot: [member(8)] } });

    await enterRoom();

    await waitFor(() => {
      expect(channel.publishedSignals.map((s) => s.toUserId)).toEqual([8]);
    });
    expect(channel.publishedSignals[0]?.kind).toBe("OFFER");
  });

  it("수신 스트림이 도착한 상대 타일에 amp-block과 sentry-block 비디오가 그려진다", async () => {
    const { pcs } = renderRoom({ scenario: { snapshot: [member(8)] } });
    await enterRoom();
    await waitFor(() => expect(pcs).toHaveLength(1));

    const remote = { getVideoTracks: () => [] };
    act(() => {
      pcs[0]?.ontrack?.({ streams: [remote] });
    });

    const video = await screen.findByTestId("remote-video-8");
    expect(video).toHaveClass("amp-block", "sentry-block");
  });

  it("마운트 재-join 응답의 iceServers가 P2P 설정에 쓰인다", async () => {
    mockedJoinRoom.mockResolvedValue({
      ...joinResponse,
      iceServers: [{ urls: ["stun:from-rejoin"] }],
    });
    const { pcConfigs } = renderRoom({ scenario: { snapshot: [member(8)] } });

    await enterRoom();

    await waitFor(() => expect(pcConfigs).toHaveLength(1));
    expect(pcConfigs[0]?.iceServers).toEqual([{ urls: ["stun:from-rejoin"] }]);
  });

  it("유예 재입장은 router state의 iceServers를 그대로 쓴다", async () => {
    const { pcConfigs } = renderRoom({
      state: {
        inviteCode: "0712",
        graceRejoin: true,
        cameraOn: true,
        iceServers: [{ urls: ["stun:from-state"] }],
      },
      scenario: { snapshot: [member(8)] },
    });

    await screen.findByRole("button", { name: "나가기" });

    await waitFor(() => expect(pcConfigs).toHaveLength(1));
    expect(pcConfigs[0]?.iceServers).toEqual([{ urls: ["stun:from-state"] }]);
    expect(mockedJoinRoom).not.toHaveBeenCalled();
  });

  it("수신 스트림이 아직 없는 상대 타일은 아바타로 남는다", async () => {
    renderRoom({ scenario: { snapshot: [member(8)] } });

    await enterRoom();

    expect(screen.queryByTestId("remote-video-8")).not.toBeInTheDocument();
    expect(screen.getByText("멤")).toBeInTheDocument();
  });

  it("카메라를 끄면 송신 트랙 enabled만 꺼지고 P2P 연결은 유지된다", async () => {
    const track = { enabled: true, getSettings: () => ({ height: 720 }) };
    const stream = { getVideoTracks: () => [track] } as unknown as MediaStream;
    let running = false;
    const camera: CameraAdapter = {
      facing: "front",
      get isRunning() {
        return running;
      },
      get stream() {
        return running ? stream : null;
      },
      async start() {
        running = true;
      },
      stop() {
        running = false;
      },
      async flip() {
        return { ok: false, reason: "no-alternative" };
      },
    };
    const { pcs } = renderRoom({ scenario: { snapshot: [member(8)] }, camera });
    await enterRoom();
    await turnCameraOn();
    await waitFor(() => expect(pcs[0]?.senders.length ?? 0).toBeGreaterThan(0));
    await waitFor(() => expect(track.enabled).toBe(true));

    await userEvent.click(screen.getByRole("button", { name: "카메라 끄기" }));

    await waitFor(() => {
      expect(track.enabled).toBe(false);
    });
    expect(pcs[0]?.closed).toBe(false);
  });
});

describe("LiveRoomPage — 카메라 토글·나가기", () => {
  it("카메라 켜기는 확인 모달을 거쳐 재개되고, 끄기는 다시 측정 일시정지가 된다", async () => {
    const { channel } = renderRoom();
    await enterRoom();
    channel.published.length = 0;

    await userEvent.click(await screen.findByRole("button", { name: "카메라 켜기" }));
    const dialog = screen.getByRole("alertdialog");

    await userEvent.click(within(dialog).getByRole("button", { name: "카메라 켜기" }));
    await waitFor(() => {
      expect(channel.published).toContainEqual({ cameraOn: true });
    });

    await userEvent.click(screen.getByRole("button", { name: "카메라 끄기" }));
    await waitFor(() => {
      expect(channel.published).toContainEqual({ cameraOn: false });
    });
  });

  it("세션 동안 뒤로가기를 잠근다 — iOS 스와이프·Android 하드웨어 모두, 나가면 해제", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    const bridgeSent = () =>
      postMessage.mock.calls.map(([raw]) => JSON.parse(raw as string) as Record<string, unknown>);
    vi.mocked(submitStudySession).mockResolvedValue([]);
    mockedLeaveRoom.mockResolvedValue(undefined);
    renderRoom();

    // 브리지를 stub한 상태라 입장 전 권한 게이트가 응답을 기다린다 — 허용으로 답해 준다.
    grantCameraGate();
    await enterRoom();
    expect(bridgeSent()).toContainEqual(
      expect.objectContaining({ type: "set-back-gesture", enabled: false }),
    );
    expect(bridgeSent()).toContainEqual(
      expect.objectContaining({ type: "set-back-lock", locked: true }),
    );

    await userEvent.click(screen.getByRole("button", { name: "나가기" }));
    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));
    await screen.findByTestId("social-home-stub");

    expect(bridgeSent()).toContainEqual(
      expect.objectContaining({ type: "set-back-gesture", enabled: true }),
    );
    expect(bridgeSent()).toContainEqual(
      expect.objectContaining({ type: "set-back-lock", locked: false }),
    );
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
    expect(screen.getByRole("button", { name: "카메라 켜기" })).toBeDisabled();
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

describe("LiveRoomPage — 컨트롤 바 시안 B (BY-427)", () => {
  it("카메라 꺼짐 버튼은 반투명 레드 필 + 레드 사선 아이콘, 켜짐은 현행 유지 (BY-435 시안 A)", async () => {
    renderRoom();
    await enterRoom();

    // 작은 svg는 vite가 data URI로 인라인한다 — 파일명 대신 아이콘 내용으로 구분한다.
    // off 아이콘만 레드 사선 스트로크(#ff6b77)를 가진다. 나가기(솔리드 레드)와 구분되는
    // 반투명 필이고, 켬↔끔 배경은 색 전환 애니메이션을 탄다.
    const offButton = screen.getByRole("button", { name: "카메라 켜기" });
    expect(offButton).toHaveClass("bg-[#ff6b77]/20");
    expect(offButton).toHaveClass("transition-[background-color,transform]");
    expect(offButton).toHaveAttribute("aria-pressed", "false");
    expect(offButton.querySelector("img")?.getAttribute("src")).toContain("ff6b77");

    await turnCameraOn();

    const onButton = screen.getByRole("button", { name: "카메라 끄기" });
    expect(onButton).not.toHaveClass("bg-[#ff6b77]/20");
    expect(onButton).toHaveAttribute("aria-pressed", "true");
    const onSrc = onButton.querySelector("img")?.getAttribute("src") ?? "";
    expect(onSrc).not.toContain("ff6b77");
    expect(onSrc).toContain("white");
  });

  it("켬↔끔 전환 시 아이콘이 팝 애니메이션으로 교체된다 (BY-435)", async () => {
    renderRoom();
    await enterRoom();

    const offIcon = screen
      .getByRole("button", { name: "카메라 켜기" })
      .querySelector("img") as HTMLImageElement;
    expect(offIcon.className).toContain("control-icon-pop");

    await turnCameraOn();

    const onIcon = screen
      .getByRole("button", { name: "카메라 끄기" })
      .querySelector("img") as HTMLImageElement;
    expect(onIcon.className).toContain("control-icon-pop");
    // key가 상태별로 달라야 재마운트되어 애니메이션이 다시 돈다.
    expect(onIcon).not.toBe(offIcon);
  });

  it("전환 버튼은 몸통은 고정하고 안의 화살표만 반 바퀴씩 돈다 (BY-435)", async () => {
    renderRoom();
    await enterRoom();
    await turnCameraOn();

    const flipButton = screen.getByRole("button", { name: "카메라 전환" });
    const arrows = flipButton.querySelector('[data-testid="camera-flip-arrows"]') as SVGGElement;
    expect(arrows.style.transform).toBe("rotate(0deg)");

    await userEvent.click(flipButton);
    expect(arrows.style.transform).toBe("rotate(180deg)");

    await userEvent.click(flipButton);
    expect(arrows.style.transform).toBe("rotate(360deg)");
  });

  it("바가 올라와 있으면 하단을 바만큼 벌리고, 내리면 화면 높이 비례(4dvh) 여백이 된다", async () => {
    // 스크롤 컨테이너에 transform(scale)을 걸면 WKWebView가 타일 페인트를 누락한다 —
    // 축소 효과 없이 여백만 바뀌는 것이 의도다(2026-08-25 실기기 사고).
    renderRoom({ scenario: { snapshot: [member(8)] } });
    await enterRoom();

    const grid = screen.getByTestId("room-grid");
    expect(grid.className).not.toContain("scale-");
    expect(grid).not.toHaveClass("pb-[4dvh]");

    tapSurface();
    expect(grid).toHaveClass("pb-[4dvh]");
  });

  it("2명 타일은 0350/0351 비율 — 1열 정사각, 바가 있으면 36dvh, 내리면 41dvh로 커진다", async () => {
    renderRoom({ scenario: { snapshot: [member(8)] } });
    await enterRoom();

    const tile = screen.getAllByTestId("room-tile")[0] as HTMLElement;
    expect(tile).toHaveClass("aspect-square");
    expect(tile).toHaveClass("h-[36dvh]");

    tapSurface();
    expect(tile).toHaveClass("h-[41dvh]");
  });

  it("3명 이상 타일은 2열 반폭 — 홀수 인원의 마지막 타일은 justify-center가 가운데 놓는다", async () => {
    renderRoom({ scenario: { snapshot: [member(8), member(9)] } });
    await enterRoom();

    expect(screen.getByTestId("room-grid-rows")).toHaveClass("justify-center");
    const tile = screen.getAllByTestId("room-tile")[0] as HTMLElement;
    expect(tile).toHaveClass("aspect-[2/3]");
    expect(tile).toHaveClass("w-[calc(50%-2px)]");
  });

  it("진단 로그는 기본 접힘이고 우상단 토글로 펼쳤다 접을 수 있다 (DEV 전용, BY-435)", async () => {
    renderRoom();
    await enterRoom();

    expect(screen.queryByTestId("room-debug-log")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "진단 로그 토글" }));
    expect(screen.getByTestId("room-debug-log")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "진단 로그 토글" }));
    expect(screen.queryByTestId("room-debug-log")).not.toBeInTheDocument();
  });

  it("나가기 버튼은 눌림 스케일 효과를 가진다 (BY-435)", async () => {
    renderRoom();
    await enterRoom();

    expect(screen.getByRole("button", { name: "나가기" })).toHaveClass("active:scale-90");
  });

  it("바가 떠 있으면 바 위에 붙고(mt-auto), 내리면 세로 가운데(my-auto) — 안전 정렬", async () => {
    // content-center/end는 내용이 컨테이너보다 커지면 위 행이 잘리고 스크롤로도 못 닿는다
    // (2026-08-25 실기기: 작은 화면에서 내 타일·참가자 미표시). auto 마진은 넘치면 접힌다.
    renderRoom({ scenario: { snapshot: [member(8), member(9), member(10)] } });
    await enterRoom();

    const rows = screen.getByTestId("room-grid-rows");
    expect(rows).toHaveClass("mt-auto");
    expect(screen.getByTestId("room-grid").className).not.toContain("content-");

    tapSurface();
    expect(rows).toHaveClass("my-auto");
  });

  it("5~6명 타일은 4:5로 눕혀 3행이 화면에 들어간다 — 2:3이면 첫 행(내 타일)이 스크롤로 밀린다", async () => {
    renderRoom({
      scenario: { snapshot: [member(8), member(9), member(10), member(11), member(12)] },
    });
    await enterRoom();

    const tile = screen.getAllByTestId("room-tile")[0] as HTMLElement;
    expect(tile).toHaveClass("aspect-[4/5]");
    expect(tile).not.toHaveClass("aspect-[2/3]");
  });

  it("5~6명은 바가 올라오면 타일 폭을 줄여 3행 전체가 바 위에 수납된다", async () => {
    renderRoom({
      scenario: { snapshot: [member(8), member(9), member(10), member(11), member(12)] },
    });
    await enterRoom();

    const tile = screen.getAllByTestId("room-tile")[0] as HTMLElement;
    expect(tile).toHaveClass("w-[calc(44%-2px)]");

    tapSurface();
    expect(tile).toHaveClass("w-[calc(50%-2px)]");
  });

  it("7명 이상도 안전 정렬 — auto 마진이 접혀 위부터 스크롤되고 첫 행이 잘리지 않는다", async () => {
    renderRoom({
      scenario: {
        snapshot: [
          member(8),
          member(9),
          member(10),
          member(11),
          member(12),
          member(13),
          member(14),
        ],
      },
    });
    await enterRoom();

    expect(screen.getByTestId("room-grid-rows")).toHaveClass("mt-auto");
    expect(screen.getByTestId("room-grid").className).not.toContain("content-");
  });

  /**
   * 회귀 가드(BY-412). 전환은 기존 스트림을 먼저 정지하므로(Android는 기존 카메라를 놓아야
   * 반대 카메라가 열린다) 복원까지 실패하면 카메라가 실제로 꺼진다. 훅이 실행 상태를 다시
   * 읽지 않으면 룸은 낡은 "켜짐"으로 남아 상대에게 켜짐을 계속 발행한다.
   */
  it("전환이 복원까지 실패하면 카메라 꺼짐이 반영된다 — 낡은 켜짐을 발행하지 않는다", async () => {
    let running = false;
    const stream = {
      getVideoTracks: () => [{ enabled: true, getSettings: () => ({ height: 720 }) }],
    } as unknown as MediaStream;
    const camera: CameraAdapter = {
      facing: "front",
      get isRunning() {
        return running;
      },
      get stream() {
        return running ? stream : null;
      },
      async start() {
        running = true;
      },
      stop() {
        running = false;
      },
      async flip() {
        // 전환도 복원도 실패해 어댑터가 카메라를 놓은 상태.
        running = false;
        return { ok: false, reason: "camera-off" };
      },
    };
    const { channel } = renderRoom({ camera });
    await enterRoom();
    await turnCameraOn();
    await waitFor(() => {
      expect(channel.published).toContainEqual({ cameraOn: true });
    });
    channel.published.length = 0;

    await userEvent.click(screen.getByRole("button", { name: "카메라 전환" }));

    await waitFor(() => {
      expect(channel.published).toContainEqual({ cameraOn: false });
    });
    expect(channel.published).not.toContainEqual({ cameraOn: true });
  });

  it("카메라가 꺼져 있으면 전환 버튼은 비활성이다 (2026-08-25 BY-427 피드백)", async () => {
    renderRoom();

    await enterRoom();

    // 무조건 끄고 입장이므로 초기 상태에서 전환할 카메라가 없다.
    expect(screen.getByRole("button", { name: "카메라 전환" })).toBeDisabled();

    await turnCameraOn();

    expect(screen.getByRole("button", { name: "카메라 전환" })).toBeEnabled();
  });

  it("카메라 켜기 모달 미리보기는 화면 높이 비례(상한 234px) — 가로에서도 잘리지 않는다", async () => {
    renderRoom();
    await enterRoom();

    await userEvent.click(screen.getByRole("button", { name: "카메라 켜기" }));

    const slot = screen.getByTestId("camera-dialog-preview").parentElement;
    expect(slot).toHaveClass("h-[min(234px,28dvh)]");
    // 백스톱: 모달 자체도 뷰포트를 넘으면 내부 스크롤로 잘림을 막는다.
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveClass("max-h-[calc(100dvh-24px)]");
    expect(dialog).toHaveClass("overflow-y-auto");
  });
});

describe("LiveRoomPage — 컨트롤 바 탭 토글 (BY-435 디스코드 패턴)", () => {
  const SLIDE = "translate-y-[calc(100%+env(safe-area-inset-bottom)+17px)]";

  it("입장 직후 바는 올라와 있고, 탭하면 내려가고 다시 탭하면 올라온다 — 자동으로 내려가지 않는다", async () => {
    renderRoom();
    await enterRoom();

    const bar = screen.getByTestId("room-control-bar");
    expect(bar).toHaveClass("pointer-events-auto");
    expect(bar).not.toHaveClass(SLIDE);

    tapSurface();
    expect(bar).toHaveClass("pointer-events-none");
    expect(bar).toHaveClass(SLIDE);

    tapSurface();
    expect(bar).toHaveClass("pointer-events-auto");
    expect(bar).not.toHaveClass(SLIDE);
  });

  it("바가 내려가면 타일의 이름·목표가 숨고 시간 뱃지만 남는다", async () => {
    renderRoom({ scenario: { snapshot: [member(8, { goal: "합격" })] } });
    await enterRoom();

    const infos = screen.getAllByTestId("tile-info");
    infos.forEach((info) => expect(info).not.toHaveClass("opacity-0"));

    tapSurface();
    screen.getAllByTestId("tile-info").forEach((info) => {
      expect(info).toHaveClass("opacity-0");
      expect(info).toHaveAttribute("aria-hidden", "true");
    });
    // 시간 뱃지는 남는다.
    expect(screen.getAllByTestId("self-state-badge").length).toBeGreaterThan(0);
  });

  it("드래그(스크롤)는 바를 토글하지 않는다 — 이동 10px 초과면 탭이 아니다", async () => {
    renderRoom();
    await enterRoom();

    const surface = screen.getByTestId("live-room-page");
    const bar = screen.getByTestId("room-control-bar");
    expect(bar).toHaveClass("pointer-events-auto");

    // jsdom의 PointerEvent 폴백은 좌표를 싣지 않는다 — MouseEvent로 직접 만들어 보낸다.
    fireEvent(surface, new MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 100 }));
    fireEvent(surface, new MouseEvent("pointerup", { bubbles: true, clientX: 10, clientY: 180 }));
    expect(bar).toHaveClass("pointer-events-auto");
  });

  it("바 위 탭(버튼 조작)은 토글로 버블되지 않는다 — 버튼을 누를 때마다 바가 내려가면 안 된다", async () => {
    renderRoom();
    await enterRoom();

    const bar = screen.getByTestId("room-control-bar");
    expect(bar).toHaveClass("pointer-events-auto");

    fireEvent.pointerDown(bar, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(bar, { clientX: 10, clientY: 10 });
    expect(bar).toHaveClass("pointer-events-auto");
  });

  it("다이얼로그가 열려 있는 동안은 화면을 탭해도 내려가지 않는다", async () => {
    renderRoom();
    await enterRoom();

    await userEvent.click(screen.getByRole("button", { name: "카메라 켜기" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    tapSurface();
    expect(screen.getByTestId("room-control-bar")).toHaveClass("pointer-events-auto");
  });

  it("제출 중(controlsLocked)에는 숨겨 뒀어도 바가 올라오고 저장 중 문구가 남는다", async () => {
    vi.mocked(submitStudySession).mockReturnValue(new Promise(() => undefined));
    renderRoom();
    await enterRoom();
    // 바를 다시 내려 둔 상태에서 제출이 시작돼도 강제 표시가 이겨야 한다.
    await userEvent.click(screen.getByRole("button", { name: "나가기" }));
    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));
    await screen.findByText("저장 중...");

    expect(screen.getByTestId("room-control-bar")).toHaveClass("pointer-events-auto");
    expect(screen.getByText("저장 중...")).toBeInTheDocument();
  });
});

describe("LiveRoomPage — 재입장 초기화 취급", () => {
  it("SNAPSHOT에 서버 보존값이 있어도 입장 즉시 studySeconds 0을 발행한다", async () => {
    const { channel } = renderRoom({
      state: { inviteCode: "0712", graceRejoin: true },
      scenario: { snapshot: [member(7, { studySeconds: 7320 })] },
    });
    await enterRoom();

    expect(channel.published.filter((p) => p.studySeconds !== undefined)).toEqual([
      { studySeconds: 0 },
    ]);
  });

  it("graceRejoin 재입장도 카메라 끔(일시정지)으로 들어간다 — join 재호출은 없다", async () => {
    renderRoom({
      // 서버가 이전 카메라 상태로 켬을 내려줘도 무시한다 — 재입장은 처음부터 취급.
      state: { inviteCode: "0712", graceRejoin: true, cameraOn: true },
      scenario: { snapshot: [member(7)] },
    });
    await enterRoom();

    expect(screen.getByRole("button", { name: "카메라 켜기" })).toBeInTheDocument();
    expect(mockedJoinRoom).not.toHaveBeenCalled();
  });

  it("내 타일 공부시간 표시는 로컬 측정값이다 — 서버 보존값을 이어받지 않는다", async () => {
    renderRoom({
      state: { inviteCode: "0712", graceRejoin: true },
      scenario: { snapshot: [member(7, { studySeconds: 7320 }), member(8)] },
    });

    const tiles = await screen.findAllByTestId("room-tile");
    const myTile = tiles.find((tile) => tile.dataset.userId === "7");
    expect(myTile).toBeDefined();
    expect(within(myTile as HTMLElement).queryByText("02:02")).not.toBeInTheDocument();
    expect(within(myTile as HTMLElement).getByText("00:00")).toBeInTheDocument();
  });
});

/** jsdom에서 백그라운드 전환·복귀를 실제 visibilitychange로 흘린다. */
function goBackground() {
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

function returnForeground() {
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("LiveRoomPage — 유예 만료 복귀", () => {
  // 헬퍼가 덮어쓴 인스턴스 속성을 지워 prototype 원본을 복원한다 — 단언 실패로 테스트가
  // returnForeground 전에 중단되면 hidden이 남아 뒤 테스트가 연쇄 실패한다(봇 리뷰 반영).
  afterEach(() => {
    Reflect.deleteProperty(document, "visibilityState");
  });

  /** 순공 1분 이상 쌓기 — 카메라 켜기(실타이머)로 측정 진입 후 fake 타이머로 61초 흘린다. */
  async function studyOverOneMinute() {
    await turnCameraOn();
    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
  }

  async function expireGraceAndReturn() {
    act(goBackground);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    act(returnForeground);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    vi.useRealTimers();
  }

  it("유예를 넘겨 복귀하면 채널을 끊고 자동 종료·제출 후 저장 안내를 남기고 소셜 홈으로 이동한다", async () => {
    let channelStatusAtSubmit: string | null = null;
    const rendered = renderRoom({ scenario: { snapshot: [member(7)] } });
    vi.mocked(submitStudySession).mockImplementation(async () => {
      channelStatusAtSubmit = rendered.channel.status;
      return [];
    });
    await enterRoom();
    await studyOverOneMinute();
    await expireGraceAndReturn();

    expect(vi.mocked(submitStudySession)).toHaveBeenCalledTimes(1);
    // 제출 시점에 채널이 이미 끊겨 있어야 한다 — 자동 재연결이 서버 상태를 건드리는 경쟁 차단.
    expect(channelStatusAtSubmit).toBe("closed");
    expect(await screen.findByTestId("social-home-stub")).toBeInTheDocument();
    expect(consumeSocialRoomNotice()).toBe(
      "자리를 오래 비워서 공부를 종료했어요.\n공부 기록은 저장되었으니 안심하세요.",
    );
  });

  it("제출이 실패해도 실패 안내를 남기고 소셜 홈으로 이동한다", async () => {
    vi.mocked(submitStudySession).mockRejectedValue(new Error("네트워크"));
    renderRoom({ scenario: { snapshot: [member(7)] } });
    await enterRoom();
    await studyOverOneMinute();
    await expireGraceAndReturn();

    expect(await screen.findByTestId("social-home-stub")).toBeInTheDocument();
    expect(consumeSocialRoomNotice()).toBe(
      "자리를 오래 비워서 공부를 종료했어요.\n공부 기록은 저장되니 안심하세요.",
    );
  });

  it("순공 1분 미만이면 제출 성패와 무관하게 미달 안내로 갈린다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    renderRoom({ scenario: { snapshot: [member(7)] } });
    await enterRoom();
    // 카메라를 켜지 않아 일시정지 그대로 — 순공 0초로 유예를 넘긴다.
    vi.useFakeTimers();
    await expireGraceAndReturn();

    expect(vi.mocked(submitStudySession)).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("social-home-stub")).toBeInTheDocument();
    expect(consumeSocialRoomNotice()).toBe(
      "자리를 오래 비워서 공부를 종료했어요.\n1분 미만 공부는 기록에 표시되지 않아요",
    );
  });

  it("순공 1분 미만 + 제출 실패도 같은 미달 안내로 소셜 홈에 간다", async () => {
    vi.mocked(submitStudySession).mockRejectedValue(new Error("네트워크"));
    renderRoom({ scenario: { snapshot: [member(7)] } });
    await enterRoom();
    vi.useFakeTimers();
    await expireGraceAndReturn();

    expect(await screen.findByTestId("social-home-stub")).toBeInTheDocument();
    expect(consumeSocialRoomNotice()).toBe(
      "자리를 오래 비워서 공부를 종료했어요.\n1분 미만 공부는 기록에 표시되지 않아요",
    );
  });

  it("카메라를 끈 채(수동 일시정지) 20분 넘게 숨어도 안내를 남기고 소셜 홈으로 이동한다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    renderRoom({ scenario: { snapshot: [member(7)] } });
    await enterRoom();
    // 실기기 백그라운드에서는 타이머가 멈추고 복귀 때 벽시계로 판정한다 — 타이머를
    // 돌리지 않고 시계만 건너뛰어 그 상황을 재현한다. 20분 일시정지 감시자가 먼저
    // 종료시켜도 유예 안내와 이동은 빠지면 안 된다.
    vi.useFakeTimers();
    act(goBackground);
    act(() => {
      vi.setSystemTime(Date.now() + 21 * 60_000);
    });
    act(returnForeground);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    vi.useRealTimers();

    expect(await screen.findByTestId("social-home-stub")).toBeInTheDocument();
    expect(consumeSocialRoomNotice()).toBe(
      "자리를 오래 비워서 공부를 종료했어요.\n1분 미만 공부는 기록에 표시되지 않아요",
    );
  });

  it("숨어 있는 동안 20분 감시자가 먼저 종료를 끝내도(제출 성공) 안내가 남는다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    renderRoom({ scenario: { snapshot: [member(7)] } });
    await enterRoom();
    // 백그라운드에서도 스로틀된 타이머가 도는 기기 재현 — 숨김 중에 21분을 그대로
    // 돌리면 20분 감시자가 복귀 전에 종료·제출까지 끝낸다.
    vi.useFakeTimers();
    act(goBackground);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(21 * 60_000);
    });
    act(returnForeground);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    vi.useRealTimers();

    expect(await screen.findByTestId("social-home-stub")).toBeInTheDocument();
    expect(consumeSocialRoomNotice()).toBe(
      "자리를 오래 비워서 공부를 종료했어요.\n1분 미만 공부는 기록에 표시되지 않아요",
    );
  });

  it("숨어 있는 동안 20분 감시자의 제출이 실패해도 복귀하면 안내를 남기고 이동한다", async () => {
    vi.mocked(submitStudySession).mockRejectedValue(new Error("네트워크"));
    renderRoom({ scenario: { snapshot: [member(7)] } });
    await enterRoom();
    vi.useFakeTimers();
    act(goBackground);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(21 * 60_000);
    });
    act(returnForeground);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    vi.useRealTimers();

    expect(await screen.findByTestId("social-home-stub")).toBeInTheDocument();
    expect(consumeSocialRoomNotice()).toBe(
      "자리를 오래 비워서 공부를 종료했어요.\n1분 미만 공부는 기록에 표시되지 않아요",
    );
  });

  it("유예 안(30초 미만) 복귀는 종료하지 않는다 — 일시정지 유지", async () => {
    renderRoom({ scenario: { snapshot: [member(7)] } });
    await enterRoom();
    vi.useFakeTimers();
    act(goBackground);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    act(returnForeground);
    await act(async () => {});
    vi.useRealTimers();

    expect(vi.mocked(submitStudySession)).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "나가기" })).toBeInTheDocument();
  });
});
