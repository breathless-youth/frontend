import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RoomMember, SubjectResponse } from "@focusmakers/types";

import { createMockRoomChannel } from "@/features/live-room/mockRoomChannel";
import type { MockRoomScenario } from "@/features/live-room/mockRoomChannel";
import { createMockCameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import type { CameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import { submitStudySession } from "@/features/study-session/submitStudySession";
import { useActiveSessionRestore } from "@/features/study-session/useActiveSessionRestore";
import { ApiError } from "@/lib/api";
import { consumeSocialRoomNotice } from "@/features/social-room/socialRoomNotice";
import type * as ShareInviteModule from "@/features/social-room/shareInvite";
import { getProfile } from "@/lib/profileApi";
import { showCtaToast } from "@/lib/toast";
import type * as ToastModule from "@/lib/toast";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import type * as AmplitudeModule from "@/lib/amplitude";
import type * as MetaAppEventsModule from "@/lib/metaAppEvents";
import { renewLiveRoomSeat, leaveRoom } from "@/lib/roomApi";
import { AUTO_HIDE_MS } from "@/features/live-room/useAutoHideControls";
import type * as AmbientPlayerModule from "@/features/ambient-sound/ambientPlayer";
import {
  DEFAULT_AMBIENT_SETTINGS,
  createMemoryAmbientSoundStore,
  resetAmbientSoundStore,
  setAmbientSoundStore,
} from "@/features/ambient-sound/ambientSoundStore";
import {
  enterGlassChrome,
  lastInlineControls,
  measureControlsNow,
  resetGlassChrome,
} from "@/test/nativeControlStub";
import { LiveRoomPage } from "../LiveRoomPage";

/** 복원 게이트는 자기 테스트가 따로 있다 — 여기서는 통과시킨다. */
vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: vi.fn(() => ({ settled: true, restored: null })),
}));

vi.mock("@/lib/roomApi", () => ({
  renewLiveRoomSeat: vi.fn(),
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

const haptic = vi.hoisted(() => vi.fn());
vi.mock("@/lib/haptics", () => ({ haptic }));

const share = vi.hoisted(() => ({
  shareInvite: vi.fn(),
  trackInviteShared: vi.fn(),
  trackMetaInviteShared: vi.fn(),
}));
vi.mock("@/features/social-room/shareInvite", async (importOriginal) => ({
  ...(await importOriginal<typeof ShareInviteModule>()),
  shareInvite: share.shareInvite,
}));
const trackStudySessionEnded = vi.hoisted(() => vi.fn());
const subjectTracking = vi.hoisted(() => ({
  trackSubjectSheetOpened: vi.fn(),
  trackSubjectSheetClosed: vi.fn(),
  trackSubjectItemSelected: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof AmplitudeModule>()),
  trackInviteShared: share.trackInviteShared,
  trackStudySessionEnded,
  ...subjectTracking,
}));
// 세션에 들어오면 과목 목록을 미리 받는다.
// jsdom은 상대 URL fetch가 던지므로 응답을 준다.
const listSubjects = vi.hoisted(() => vi.fn(async (): Promise<SubjectResponse[]> => []));
vi.mock("@/lib/subjectApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listSubjects,
}));
vi.mock("@/lib/toast", async (importOriginal) => {
  const actual = await importOriginal<typeof ToastModule>();
  return { ...actual, showCtaToast: vi.fn(actual.showCtaToast) };
});
vi.mock("@/lib/metaAppEvents", async (importOriginal) => ({
  ...(await importOriginal<typeof MetaAppEventsModule>()),
  trackMetaInviteShared: share.trackMetaInviteShared,
}));

// jsdom에는 Web Audio가 없어 명령만 기록하는 플레이어로 바꾼다.
// 세션마다 하나씩 만들어진다.
const ambientPlayers = vi.hoisted(
  () => [] as ReturnType<typeof AmbientPlayerModule.createMemoryPlayer>[],
);
vi.mock("@/features/ambient-sound/ambientPlayer", async (importOriginal) => {
  const actual = await importOriginal<typeof AmbientPlayerModule>();
  return {
    ...actual,
    createWebAudioPlayer: () => {
      const player = actual.createMemoryPlayer();
      ambientPlayers.push(player);
      return player;
    },
  };
});

const mockedRenewSeat = vi.mocked(renewLiveRoomSeat);
const mockedLeaveRoom = vi.mocked(leaveRoom);
const mockedRestore = vi.mocked(useActiveSessionRestore);

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
    focusSec: 0,
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
  let onSnapshotUnrecovered: (() => void) | undefined;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: "/social/room/42", search, state }]}>
        <Routes>
          <Route
            path="/social/room/:roomId"
            element={
              <LiveRoomPage
                createChannel={(options) => {
                  onSnapshotUnrecovered = options.onSnapshotUnrecovered;
                  return channel;
                }}
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
          <Route
            path="/social/room/:roomId/result"
            element={<div data-testid="social-result-stub" />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { channel, pcs, pcConfigs, getOnSnapshotUnrecovered: () => onSnapshotUnrecovered };
}

/**
 * 프리뷰 스트림까지 흉내 내는 mock 카메라 — 자동재생 방어(kickVideoPlayback)는 srcObject가
 * 붙은 video에만 동작하므로, play() 발신을 검증하는 테스트는 이걸 주입한다.
 */
function createStreamingMockCamera(): CameraAdapter {
  const base = createMockCameraAdapter();
  const fakeStream = { getVideoTracks: () => [] } as unknown as MediaStream;
  return {
    get facing() {
      return base.facing;
    },
    get isRunning() {
      return base.isRunning;
    },
    get stream() {
      return base.isRunning ? fakeStream : null;
    },
    start: () => base.start(),
    stop: () => base.stop(),
    flip: () => base.flip(),
  };
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

/** 더보기 메뉴를 열어 항목을 고른다. 카메라 전환·초대코드 공유는 바가 아니라 이 메뉴에 있다. */
async function chooseMoreMenuItem(name: string) {
  await userEvent.click(screen.getByRole("button", { name: "더보기" }));
  await userEvent.click(screen.getByRole("menuitem", { name }));
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
  mockedRenewSeat.mockResolvedValue(joinResponse);
  // 종료 이동 경로가 leaveRoom의 Promise를 전제한다 — 파일 전역으로 깔아 테스트가
  // 실행 순서(다른 테스트의 mockResolvedValue 잔류)에 기대지 않게 한다.
  mockedLeaveRoom.mockResolvedValue(undefined);
  listSubjects.mockResolvedValue([]);
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

    expect(mockedRenewSeat).toHaveBeenCalledWith("0712");
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
    expect(mockedRenewSeat).not.toHaveBeenCalled();
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
    expect(mockedRenewSeat).not.toHaveBeenCalled();
  });

  it("join 재호출이 끝나기 전에는 세션(측정)이 마운트되지 않는다", async () => {
    mockedRenewSeat.mockReturnValue(new Promise(() => undefined));
    renderRoom();

    await waitFor(() => expect(mockedRenewSeat).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId("live-room-page")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "나가기" })).not.toBeInTheDocument();
  });

  it("입장 대기와 세션 모두 시스템 테마와 무관하게 다크로 고정한다", async () => {
    renderRoom();
    expect(screen.getByTestId("live-room-page")).toHaveClass("theme-dark");

    await enterRoom();

    expect(screen.getByTestId("live-room-page")).toHaveClass("theme-dark");
  });

  it("재-join이 실패하면 인라인 오류를 보여주고 다시 시도는 join부터 재시작한다", async () => {
    mockedRenewSeat.mockRejectedValue(new ApiError("정원 초과", 409, "CONFLICT"));
    renderRoom();

    expect(await screen.findByText("방이 가득 찼어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "나가기" })).not.toBeInTheDocument();

    mockedRenewSeat.mockResolvedValue(joinResponse);
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    await enterRoom();
    expect(mockedRenewSeat).toHaveBeenCalledTimes(2);
  });

  it("재-join 실패 화면의 [소셜 홈으로]는 소셜 홈으로 돌려보낸다", async () => {
    mockedRenewSeat.mockRejectedValue(new ApiError("정원 초과", 409, "CONFLICT"));
    renderRoom();
    await screen.findByText("방이 가득 찼어요");

    await userEvent.click(screen.getByRole("button", { name: "소셜 홈으로" }));

    expect(await screen.findByTestId("social-home-stub")).toBeInTheDocument();
  });

  it("state 없이 ?code가 있으면 그 코드로 입장한다 — 렌더러 사망 후 복원된 문서(BY-436)", async () => {
    mockedRenewSeat.mockResolvedValue(joinResponse);
    renderRoom({ state: null, search: "?userId=7&code=0712" });

    await enterRoom();

    expect(mockedRenewSeat).toHaveBeenCalledWith("0712");
    expect(screen.queryByTestId("social-home-stub")).not.toBeInTheDocument();
  });

  it("state도 완전한 ?code도 없으면 소셜 홈으로 돌려보낸다", () => {
    renderRoom({ state: null, search: "?userId=7&code=07" });

    expect(screen.getByTestId("social-home-stub")).toBeInTheDocument();
    expect(mockedRenewSeat).not.toHaveBeenCalled();
  });

  it("방이 사라졌으면(ROOM_CLOSED) 화면에 붙잡지 않고 소셜 홈으로 내보낸다", async () => {
    // 백그라운드 복귀로 웹뷰가 리로드되며 재-join하는데 그 사이 전원이 나가 방이 소멸한 경우.
    // 종전에는 코드 재확인 문구와 [다시 시도]만 남아 아무것도 할 수 없었다(BY-436).
    mockedRenewSeat.mockRejectedValue(new ApiError("소멸된 방", 404, "ROOM_CLOSED"));
    renderRoom();

    expect(await screen.findByTestId("social-home-stub")).toBeInTheDocument();
    expect(consumeSocialRoomNotice()).toEqual({ kind: "failure", message: "방이 만료되었어요" });
  });

  it("소멸 10분이 지나 INVITE_CODE_NOT_FOUND로 바뀌어도 같은 안내로 내보낸다", async () => {
    mockedRenewSeat.mockRejectedValue(new ApiError("없는 코드", 404, "INVITE_CODE_NOT_FOUND"));
    renderRoom();

    expect(await screen.findByTestId("social-home-stub")).toBeInTheDocument();
    expect(consumeSocialRoomNotice()).toEqual({ kind: "failure", message: "방이 만료되었어요" });
  });

  it("5xx는 내보내지 않는다 — 방이 살아 있는데 쫓아내면 측정이 날아간다", async () => {
    mockedRenewSeat.mockRejectedValue(new ApiError("서버 오류", 500, "INTERNAL_ERROR"));
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
      // 마운트 focusSec 0 발행은 정상이라 카메라 발행만 본다.
      expect(channel.published.filter((p) => p.cameraOn !== undefined)).toEqual([
        { cameraOn: false },
      ]);
    });
  });
});

describe("LiveRoomPage — 그리드·타일", () => {
  it("혼자여도 타일 한 장으로 그리고, 켜면 내 비디오는 amp-block과 sentry-block으로 가려진다", async () => {
    renderRoom();

    await enterRoom();
    expect(screen.getAllByTestId("room-tile")).toHaveLength(1);

    await turnCameraOn();

    expect(await screen.findByTestId("room-my-video")).toHaveClass("amp-block", "sentry-block");
  });

  it("세션 영상은 탭을 받지 않는다 — 탭이 닿으면 iOS가 네이티브 컨트롤을 띄운다", async () => {
    renderRoom();

    await enterRoom();
    await turnCameraOn();

    expect(await screen.findByTestId("room-my-video")).toHaveClass("pointer-events-none");
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
    // 1회 이상 — 매 렌더 자동재생 방어(kickVideoPlayback)가 더해져 있다.
    expect(playSpy).toHaveBeenCalled();
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

    await chooseMoreMenuItem("카메라 전환");

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
    // 모달 박스(288×234)와 셀프뷰 타일은 비율이 달라, 둘 다 cover면
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

  it("혼자일 때 내 타일에는 시간 뱃지가 없다", async () => {
    renderRoom();

    await enterRoom();
    expect(screen.getAllByTestId("room-tile")).toHaveLength(1);
    expect(screen.queryByTestId("tile-time-badge")).not.toBeInTheDocument();

    await turnCameraOn();

    expect(screen.queryByTestId("tile-time-badge")).not.toBeInTheDocument();
  });

  it("여러 명이면 상대 타일에만 서버 집중 상태로 시간 뱃지가 뜬다", async () => {
    renderRoom({
      scenario: { snapshot: [member(8), member(9, { focusState: "DISTRACTED" })] },
    });

    await enterRoom();

    const tiles = screen.getAllByTestId("room-tile");
    const tile = (id: string) => {
      const found = tiles.find((candidate) => candidate.getAttribute("data-user-id") === id);
      if (found === undefined) {
        throw new Error(`${id} 타일이 없다`);
      }
      return found;
    };
    expect(within(tile("7")).queryByTestId("tile-time-badge")).not.toBeInTheDocument();
    expect(within(tile("8")).getByTestId("tile-time-badge")).toHaveAttribute("data-state", "FOCUS");
    expect(within(tile("9")).getByTestId("tile-time-badge")).toHaveAttribute(
      "data-state",
      "DISTRACTED",
    );
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
    mockedRenewSeat.mockResolvedValue({
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
    expect(mockedRenewSeat).not.toHaveBeenCalled();
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
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "카메라 끄기" })).toHaveFocus();
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
      expect(mockedLeaveRoom).toHaveBeenCalledWith(42);
    });
    expect(await screen.findByTestId("social-home-stub")).toBeInTheDocument();
  });

  it("수동 종료 + 순공 1분 이상이면 결과 화면으로 이동하고 leave를 부른다", async () => {
    // 순공 1분 이상을 실시간으로 쌓는 대신, 이미 순공이 쌓인 세션을 복원해 들어간다 —
    // 재입장 직후 바로 나가는 실제 경로이고, 타이머 조작 없이 종료 집계가 1분을 넘는다.
    mockedRestore.mockReturnValue({
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
        statDate: "2026-08-30",
        startedAt: "2026-08-30T12:00:00.000Z",
        endedAt: "2026-08-30T13:00:00.000Z",
        studySec: 130,
        focusSec: 120,
        focusRate: 92.3,
        events: [],
      },
    ]);
    mockedLeaveRoom.mockResolvedValue(undefined);
    try {
      renderRoom();
      await enterRoom();

      await userEvent.click(screen.getByRole("button", { name: "나가기" }));
      await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));

      await waitFor(() => {
        expect(mockedLeaveRoom).toHaveBeenCalledWith(42);
      });
      expect(await screen.findByTestId("social-result-stub")).toBeInTheDocument();
    } finally {
      // clearAllMocks는 호출 기록만 지우고 구현은 남긴다 — 다음 테스트로 새지 않게 되돌린다.
      mockedRestore.mockReturnValue({ settled: true, restored: null });
    }
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

  it("제출 중에는 카메라가 켜져 있어도 더보기의 카메라 전환이 잠기고 초대코드 공유는 열려 있다", async () => {
    vi.mocked(submitStudySession).mockReturnValue(new Promise(() => undefined));
    renderRoom();
    await enterRoom();
    // 꺼짐 상태는 그 자체로 전환을 막아서, 켜 둬야 제출 잠금만 따로 검증된다.
    await turnCameraOn();

    await userEvent.click(screen.getByRole("button", { name: "나가기" }));
    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));
    expect(await screen.findByText("저장 중...")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    expect(screen.getByRole("menuitem", { name: "카메라 전환" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: "초대코드 공유" })).not.toHaveAttribute(
      "aria-disabled",
    );
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

describe("LiveRoomPage — ROOM_UNAVAILABLE (BY-668)", () => {
  it("ROOM_UNAVAILABLE을 받으면 join을 재호출한다", async () => {
    const { channel } = renderRoom({ scenario: { snapshot: [member(8)] } });
    await enterRoom();
    mockedRenewSeat.mockClear();

    act(() => channel.emitServerMessage({ type: "ROOM_UNAVAILABLE", roomId: 42 }));

    await waitFor(() => expect(mockedRenewSeat).toHaveBeenCalledWith("0712"));
  });

  it("재-join이 실패하면 공부를 마치고 안내와 함께 소셜 홈으로 보낸다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    const { channel } = renderRoom({ scenario: { snapshot: [member(8)] } });
    await enterRoom();
    mockedRenewSeat.mockRejectedValue(new ApiError("자리 회수", 409, "CONFLICT"));

    act(() => channel.emitServerMessage({ type: "ROOM_UNAVAILABLE", roomId: 42 }));

    expect(await screen.findByTestId("social-home-stub")).toBeInTheDocument();
    const notice = consumeSocialRoomNotice();
    expect(notice?.kind).toBe("grace-end");
    expect(notice?.message).toContain("방");
  });

  it("다른 방의 ROOM_UNAVAILABLE은 무시한다", async () => {
    const { channel } = renderRoom({ scenario: { snapshot: [member(8)] } });
    await enterRoom();
    mockedRenewSeat.mockClear();

    act(() => channel.emitServerMessage({ type: "ROOM_UNAVAILABLE", roomId: 99 }));
    await act(async () => {});

    expect(mockedRenewSeat).not.toHaveBeenCalled();
  });

  it("SNAPSHOT 미도착 escalation(onSnapshotUnrecovered)도 join을 재호출한다", async () => {
    const { getOnSnapshotUnrecovered } = renderRoom({ scenario: { snapshot: [member(8)] } });
    await enterRoom();
    mockedRenewSeat.mockClear();

    act(() => getOnSnapshotUnrecovered()?.());

    await waitFor(() => expect(mockedRenewSeat).toHaveBeenCalledWith("0712"));
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

  it("내 영상은 autoplay 속성에만 의존하지 않고 play()를 직접 부른다 — iOS WKWebView 자동재생 방어", async () => {
    // 동적으로 마운트된 video는 WKWebView가 autoplay를 시작하지 않은 채 둘 수 있다 —
    // 회전(리레이아웃) 전까지 영상 타일이 빈 채 남는 실기기 증상(2026-08-26, 3기기 동시
    // 입장). srcObject를 붙인 뒤 명시 play() 발신을 못 박는다(lib/videoPlayback.ts).
    const play = vi.spyOn(window.HTMLMediaElement.prototype, "play");
    renderRoom({ camera: createStreamingMockCamera() });
    await enterRoom();
    await turnCameraOn();

    expect(screen.getByTestId("room-my-video")).toBeInTheDocument();
    expect(play).toHaveBeenCalled();
  });

  it("회전이 정착하면 body를 다시 그리고 영상 재생을 되살린다 — iOS 회전 백지 방어", async () => {
    // iOS WKWebView는 회전 후 새 방향의 페이지를 순백으로 남길 수 있다(세션은 살아
    // 있고 페인트만 죽음 — 2026-08-26 실기기, 가로→세로 복귀마다 재현). 80ms 선발 +
    // 350ms 백업의 display 재커밋 + play 킥 발신을 못 박는다(lib/rotationRepaint.ts).
    renderRoom({ camera: createStreamingMockCamera() });
    await enterRoom();
    await turnCameraOn();

    const play = vi.spyOn(window.HTMLMediaElement.prototype, "play");
    play.mockClear();
    vi.useFakeTimers();
    try {
      fireEvent(window, new Event("orientationchange"));
      expect(play).not.toHaveBeenCalled(); // 정착 전에는 건드리지 않는다

      vi.advanceTimersByTime(80); // 선발 — 백지 체감을 당긴다(2026-08-26 피드백)
      expect(play).toHaveBeenCalled();
      expect(document.body.style.display).toBe(""); // 재커밋 후 복원돼 있어야 한다

      play.mockClear();
      vi.advanceTimersByTime(270); // 350ms 백업 — 80ms가 헛발이었을 때를 잡는다
      expect(play).toHaveBeenCalled();
      expect(document.body.style.display).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("탭 제스처마다 멈춘 영상에 play()를 다시 건다 — 저전력 모드 방어", async () => {
    // iOS 저전력 모드는 스크립트 단독 play()를 거부하지만 제스처 핸들러 안의 play()는
    // 허용된다 — 화면의 아무 탭이나 복구 트리거가 되는 발신을 못 박는다
    // (useGestureVideoPlaybackKick, lib/videoPlayback.ts).
    renderRoom({ camera: createStreamingMockCamera() });
    await enterRoom();
    await turnCameraOn();

    const play = vi.spyOn(window.HTMLMediaElement.prototype, "play");
    play.mockClear();
    fireEvent.click(document.body);
    expect(play).toHaveBeenCalled();
  });

  it.each([
    [1, []],
    [2, [8]],
    [3, [8, 9]],
  ])(
    "%i명 그리드 여백은 바 표시와 무관하다 — 바가 숨거나 나타나도 타일이 움직이지 않는다",
    async (_, others) => {
      renderRoom({ scenario: { snapshot: others.map((id) => member(id)) } });
      await enterRoom();

      const grid = screen.getByTestId("room-grid");
      const shown = grid.className;
      expect(shown).not.toContain("scale-");

      tapSurface();
      expect(screen.getByTestId("room-control-bar")).toHaveAttribute("inert");
      expect(grid.className).toBe(shown);
    },
  );

  it.each([
    [1, []],
    [2, [8]],
  ])("1열 %i명 타일은 정사각이고 바 표시와 무관하게 크기가 같다", async (_, others) => {
    renderRoom({ scenario: { snapshot: others.map((id) => member(id)) } });
    await enterRoom();

    const tile = screen.getAllByTestId("room-tile")[0] as HTMLElement;
    expect(tile).toHaveClass("aspect-square");
    // 세로 크기를 비율에 맡기면 iOS가 가로에서 돌아올 때 높이를 0으로 남긴다.
    expect(tile.className).toMatch(/(^| )size-\[min\(calc\(100dvw-80px\),/);
    const shown = tile.className;

    tapSurface();
    expect(screen.getByTestId("room-control-bar")).toHaveAttribute("inert");
    expect(tile.className).toBe(shown);
  });

  it("4명 타일은 6명과 같은 47% 폭이다 — 홀수 인원의 마지막 타일은 justify-center가 가운데 놓는다", async () => {
    renderRoom({ scenario: { snapshot: [member(8), member(9), member(10)] } });
    await enterRoom();

    expect(screen.getByTestId("room-grid-rows")).toHaveClass("justify-center");
    const tile = screen.getAllByTestId("room-tile")[0] as HTMLElement;
    // 정사각(2026-08-26 디스코드 참조 확정 — 종전 2:3 세로형 대체).
    expect(tile).toHaveClass("aspect-square");
    expect(tile).toHaveClass("size-[calc((100dvw-8px)*0.47-2px)]");
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

  it("타일 그룹은 바 표시와 무관하게 항상 세로 가운데(my-auto) — 바에 달라붙지 않는다", async () => {
    // 종전엔 바 표시 중 mt-auto로 바 위에 붙였는데 어색하다는 피드백(2026-08-26)으로
    // 통일했다.
    // content-center/end는 내용이 넘치면 위 행이 잘려 못 쓴다(2026-08-25 실기기).
    renderRoom({ scenario: { snapshot: [member(8), member(9), member(10)] } });
    await enterRoom();

    const rows = screen.getByTestId("room-grid-rows");
    expect(rows).toHaveClass("my-auto");
    expect(rows).not.toHaveClass("mt-auto");
    expect(screen.getByTestId("room-grid").className).not.toContain("content-");

    tapSurface();
    expect(rows).toHaveClass("my-auto");
  });

  it("5~6명 타일도 정사각 — 2열 3행이 스크롤 없이 화면에 들어간다 (2026-08-26 디스코드 참조)", async () => {
    renderRoom({
      scenario: { snapshot: [member(8), member(9), member(10), member(11), member(12)] },
    });
    await enterRoom();

    const tile = screen.getAllByTestId("room-tile")[0] as HTMLElement;
    expect(tile).toHaveClass("aspect-square");
    expect(tile).not.toHaveClass("aspect-4/5");
  });

  it("5~6명 타일 폭은 바 표시와 무관하게 47% 고정 — 바 토글로 작아지지 않는다", async () => {
    // 2026-08-26 피드백: 바가 올라올 때 타일이 줄어드는 게 어색하다 — 47%는 SE에서
    // 바 표시 중에도 정사각 3행이 수납되는 상한이다(50%면 넘쳐 스크롤).
    renderRoom({
      scenario: { snapshot: [member(8), member(9), member(10), member(11), member(12)] },
    });
    await enterRoom();

    const tile = screen.getAllByTestId("room-tile")[0] as HTMLElement;
    expect(tile.className).toContain("size-[min(calc((100dvw-8px)*0.47-2px),");

    tapSurface();
    expect(tile.className).toContain("size-[min(calc((100dvw-8px)*0.47-2px),");
  });

  it("가로 2명은 세로와 같은 flex 묶음 배치 — 정사각 타일이 gap-1로 붙어 중앙 정렬 (BY-441)", async () => {
    // 그리드 셀 분배(1fr)는 타일 양옆 셀 잔여 공간이 카메라 사이 시각 여백으로 남았다
    // (2026-08-26 피드백: "간격을 세로처럼") — 세로와 같은 flex-wrap 묶음으로 바꾼다.
    renderRoom({ scenario: { snapshot: [member(8)] } });
    await enterRoom();

    const grid = screen.getByTestId("room-grid");
    expect(grid.className).not.toContain("landscape-compact:grid");
    const rows = screen.getByTestId("room-grid-rows");
    expect(rows).not.toHaveClass("landscape-compact:contents");
    // 세로·가로 공통으로 항상 세로 가운데(my-auto) — 바 토글이 배치를 흔들지 않는다.
    expect(rows).toHaveClass("my-auto");
    expect(rows).toHaveClass("gap-1");

    const tile = screen.getAllByTestId("room-tile")[0] as HTMLElement;
    expect(tile).not.toHaveClass("landscape-compact:aspect-2/1");
    // 세로 비율(정사각)이 가로에서도 그대로, 높이는 min(88dvh, 폭 예산)으로 고정 —
    // 2장이 한 행에 줄바꿈 없이 들어가는 폭 상한(기기 검산은 구현 주석).
    expect(tile).toHaveClass("aspect-square");
    expect(tile.className).toContain("landscape-compact:h-[min(88dvh,");
    expect(tile).toHaveClass("landscape-compact:w-auto");

    // 가로는 바를 11px 더 낮게 건다(2026-08-26 피드백) — 래퍼의 landscape 오프셋.
    expect(screen.getByTestId("room-control-bar").parentElement).toHaveClass(
      "landscape-compact:bottom-[calc(env(safe-area-inset-bottom)+6px)]",
    );
  });

  it("가로 3명은 1행 3열 정사각 — 폭 예산/3이 높이를 정한다 (BY-441)", async () => {
    renderRoom({ scenario: { snapshot: [member(8), member(9)] } });
    await enterRoom();

    const grid = screen.getByTestId("room-grid");
    expect(grid.className).not.toContain("landscape-compact:grid");
    // 가로에서는 바가 타일 위에 겹친다(pb-2) — 타일 크기가 바와 무관해야 토글이 안 흔들린다.
    expect(grid).toHaveClass("landscape-compact:pb-2");

    const tile = screen.getAllByTestId("room-tile")[0] as HTMLElement;
    expect(tile).toHaveClass("aspect-square");
    expect(tile.className).toContain("-40px)/3))]");
  });

  it("가로 4명은 1행 4열 정사각 — 폭 예산/4이 높이를 정한다 (BY-441)", async () => {
    renderRoom({ scenario: { snapshot: [member(8), member(9), member(10)] } });
    await enterRoom();

    const tile = screen.getAllByTestId("room-tile")[0] as HTMLElement;
    expect(tile).toHaveClass("aspect-square");
    expect(tile.className).toContain("-44px)/4))]");
  });

  it("가로 5~6명은 2행 3열(3+2/3+3) 정사각 — 3열 강제 폭이 4+1 감김을 막는다 (BY-441)", async () => {
    renderRoom({
      scenario: { snapshot: [member(8), member(9), member(10), member(11), member(12)] },
    });
    await enterRoom();

    const tile = screen.getAllByTestId("room-tile")[0] as HTMLElement;
    expect(tile).toHaveClass("aspect-square");
    // 45dvh면 SE에서 3장 폭이 화면을 넘어 2행 3열 줄바꿈이 깨진다 — 44가 상한.
    expect(tile).toHaveClass("landscape-compact:h-[44dvh]");
    // 넓은 기기에서 한 행에 4장이 들어가 4+1로 감기는 것을 3장+간격 폭으로 자른다.
    const rows = screen.getByTestId("room-grid-rows");
    expect(rows).toHaveClass("landscape-compact:max-w-[calc(132dvh+8px)]");
    expect(rows).toHaveClass("landscape-compact:mx-auto");
  });

  it("타일 크기 급이 바뀌는 인원 경계에서 타일을 재마운트한다 — iOS 영상 리사이즈 페인트 누락 방어", async () => {
    // WKWebView는 재생 중 영상 타일이 레이아웃 변경으로 리사이즈되면 레이어를 다시 그리지
    // 못하고 빈 채로 남길 수 있다(2026-08-26 실기기: 2→3명 전환에서 기존 타일 2개만 안
    // 보이고 새 타일만 그려짐). 새 DOM은 새 레이어라 강제 재페인트된다. 경계는
    // 1↔2(solo/duo)·2↔3(duo/tri)·3↔4(tri/quad — 가로 1행 3열→4열)·4↔5(quad/hex)이고, 같은 급(5→6명)은
    // 타일 크기가 안 변해 재마운트하지 않는다.
    const { channel } = renderRoom();
    await enterRoom();

    const soloTile = screen.getAllByTestId("room-tile")[0] as HTMLElement;
    act(() => channel.emitServerMessage({ type: "MEMBER_JOINED", member: member(8) }));
    expect(screen.getAllByTestId("room-tile")).toHaveLength(2);
    expect(document.body.contains(soloTile)).toBe(false);

    const duoTile = screen.getAllByTestId("room-tile")[0] as HTMLElement;

    act(() => channel.emitServerMessage({ type: "MEMBER_JOINED", member: member(9) }));
    expect(screen.getAllByTestId("room-tile")).toHaveLength(3);
    expect(document.body.contains(duoTile)).toBe(false);

    const triTile = screen.getAllByTestId("room-tile")[0] as HTMLElement;
    act(() => channel.emitServerMessage({ type: "MEMBER_JOINED", member: member(10) }));
    expect(screen.getAllByTestId("room-tile")).toHaveLength(4);
    expect(document.body.contains(triTile)).toBe(false);

    act(() => channel.emitServerMessage({ type: "MEMBER_JOINED", member: member(11) }));
    expect(screen.getAllByTestId("room-tile")).toHaveLength(5);
    const hexTile = screen.getAllByTestId("room-tile")[0] as HTMLElement;
    act(() => channel.emitServerMessage({ type: "MEMBER_JOINED", member: member(12) }));
    expect(screen.getAllByTestId("room-tile")).toHaveLength(6);
    expect(document.body.contains(hexTile)).toBe(true);
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

    expect(screen.getByTestId("room-grid-rows")).toHaveClass("my-auto");
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

    await chooseMoreMenuItem("카메라 전환");

    await waitFor(() => {
      expect(channel.published).toContainEqual({ cameraOn: false });
    });
    expect(channel.published).not.toContainEqual({ cameraOn: true });
  });

  it("카메라가 꺼져 있으면 더보기의 카메라 전환은 비활성이고, 켜면 활성이다", async () => {
    renderRoom();

    await enterRoom();

    // 무조건 끄고 입장이므로 초기 상태에서 전환할 카메라가 없다.
    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    expect(screen.getByRole("menuitem", { name: "카메라 전환" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    await turnCameraOn();

    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    expect(screen.getByRole("menuitem", { name: "카메라 전환" })).not.toHaveAttribute(
      "aria-disabled",
    );
  });

  it("하단 바는 카메라, 과목, 배경음, 나가기 순서이고 카메라 전환 버튼은 없다", async () => {
    renderRoom();
    await enterRoom();

    const buttons = within(screen.getByTestId("room-control-bar")).getAllByRole("button");
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "카메라 켜기",
      "과목",
      "배경음",
      "나가기",
    ]);
    expect(screen.queryByRole("button", { name: "카메라 전환" })).not.toBeInTheDocument();
  });

  it("더보기 메뉴는 세션 화면 안에 열려 세션 테마를 받는다", async () => {
    renderRoom();
    await enterRoom();

    await userEvent.click(screen.getByRole("button", { name: "더보기" }));

    expect(screen.getByTestId("live-room-page")).toContainElement(screen.getByRole("menu"));
  });

  it("더보기를 다시 눌러 메뉴를 닫는 누름은 화면 탭 토글로 새지 않는다", async () => {
    renderRoom();
    await enterRoom();

    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    // 열린 메뉴는 모달이라 나머지 화면이 접근성 트리에서 숨어 역할로는 찾지 못한다.
    const more = screen.getByLabelText("더보기");
    // jsdom의 PointerEvent 폴백은 좌표와 button을 싣지 않는다. MouseEvent로 직접 만들어 보낸다.
    fireEvent(more, new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 10 }));
    fireEvent(more, new MouseEvent("pointerup", { bubbles: true, button: 0, clientX: 10 }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByTestId("room-control-bar")).toHaveClass("pointer-events-auto");
  });

  it("더보기 메뉴가 열린 동안 하단 바는 누름을 받지 않아 바깥 누름으로 메뉴만 닫힌다", async () => {
    renderRoom();
    await enterRoom();

    await userEvent.click(screen.getByRole("button", { name: "더보기" }));

    const bar = screen.getByTestId("room-control-bar");
    expect(bar).toHaveClass("pointer-events-none");
    expect(bar).not.toHaveClass("pointer-events-auto");
    expect(bar).toHaveClass("translate-y-0");
  });

  it("조작이 숨으면 더보기 버튼도 흐려지고 탭을 받지 않는다", async () => {
    renderRoom();
    await enterRoom();

    tapSurface();

    const more = screen.getByLabelText("더보기");
    expect(more).toHaveClass("pointer-events-none", "opacity-0");
    expect(more).toHaveAttribute("inert");
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

describe("LiveRoomPage — 더보기 초대코드 공유", () => {
  it("복사로 끝나면 토스트를 띄우고 결과값으로 계측한다", async () => {
    share.shareInvite.mockResolvedValue("copied");
    renderRoom();
    await enterRoom();

    await chooseMoreMenuItem("초대코드 공유");

    expect(await screen.findByText("초대코드를 복사했어요")).toBeInTheDocument();
    expect(showCtaToast).toHaveBeenCalledTimes(1);
    expect(share.shareInvite).toHaveBeenCalledWith("0712");
    expect(share.trackInviteShared).toHaveBeenCalledWith("copied");
    expect(share.trackMetaInviteShared).toHaveBeenCalledWith("copied");
  });

  it.each(["shared", "failed"] as const)(
    "%s로 끝나면 토스트 없이 계측만 보낸다",
    async (result) => {
      share.shareInvite.mockResolvedValue(result);
      renderRoom();
      await enterRoom();

      await chooseMoreMenuItem("초대코드 공유");

      await waitFor(() => {
        expect(share.trackInviteShared).toHaveBeenCalledWith(result);
      });
      expect(share.trackMetaInviteShared).toHaveBeenCalledWith(result);
      // 토스트 판단은 계측과 같은 콜백에서 끝나므로 계측이 보이면 토스트 호출 여부도 확정이다.
      expect(showCtaToast).not.toHaveBeenCalled();
    },
  );
});

describe("LiveRoomPage — 조작 자동 숨김", () => {
  const SLIDE = "translate-y-[calc(100%+env(safe-area-inset-bottom)+17px)]";

  /** 입장 때 걸린 숨김 타이머는 진짜 시계라, 가짜 시계로 바꾼 뒤 바를 눌러 5초를 새로 세게 한다. */
  function restartHideTimerOnFakeClock() {
    vi.useFakeTimers();
    fireEvent.pointerDown(screen.getByTestId("room-control-bar"));
  }

  function advance(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  function expectControlsHidden() {
    const bar = screen.getByTestId("room-control-bar");
    expect(bar).toHaveClass(SLIDE, "pointer-events-none");
    expect(bar).toHaveAttribute("inert");
    const more = screen.getByLabelText("더보기");
    expect(more).toHaveClass("opacity-0", "pointer-events-none");
    expect(more).toHaveAttribute("inert");
  }

  function expectControlsShown() {
    const bar = screen.getByTestId("room-control-bar");
    expect(bar).toHaveClass("translate-y-0");
    expect(bar).not.toHaveAttribute("inert");
    expect(screen.getByLabelText("더보기")).not.toHaveAttribute("inert");
  }

  it("입장 직후 조작이 보이고, 5초 동안 조작이 없으면 바와 더보기가 숨어 inert가 된다", async () => {
    renderRoom();
    await enterRoom();
    expectControlsShown();
    expect(screen.getByTestId("room-control-bar")).toHaveClass("pointer-events-auto");

    restartHideTimerOnFakeClock();
    advance(AUTO_HIDE_MS - 1);
    expectControlsShown();

    advance(1);
    expectControlsHidden();
  });

  it("숨은 뒤 탭하면 다시 보이고, 보이는 상태의 탭은 바로 숨긴다", async () => {
    renderRoom();
    await enterRoom();
    restartHideTimerOnFakeClock();
    advance(AUTO_HIDE_MS);
    expectControlsHidden();

    tapSurface();
    expectControlsShown();

    tapSurface();
    expectControlsHidden();
  });

  it("조작이 숨어도 타일의 이름·목표와 시간 뱃지는 남는다", async () => {
    renderRoom({ scenario: { snapshot: [member(8, { goal: "합격" })] } });
    await enterRoom();

    restartHideTimerOnFakeClock();
    advance(AUTO_HIDE_MS);
    expectControlsHidden();
    screen.getAllByTestId("tile-info").forEach((info) => {
      expect(info).not.toHaveClass("opacity-0");
      expect(info).not.toHaveAttribute("aria-hidden");
    });
    expect(screen.getByText("합격")).toBeVisible();
    expect(screen.getByTestId("tile-time-badge")).toBeInTheDocument();
  });

  it("왼쪽 위 내 시간 글자는 조작이 숨어도 남는다", async () => {
    renderRoom();
    await enterRoom();

    expect(screen.getByTestId("room-time-text")).toHaveTextContent("00:00:00");
    expect(screen.getByTestId("room-time-text")).toHaveTextContent("총 00:00:00");

    restartHideTimerOnFakeClock();
    advance(AUTO_HIDE_MS);
    expectControlsHidden();
    const timeText = screen.getByTestId("room-time-text");
    expect(timeText).not.toHaveClass("opacity-0");
    expect(timeText.closest("[inert], [aria-hidden='true']")).toBeNull();
  });

  it("조작이 숨으면 총 줄도 접히고, 다시 보이면 펼친다", async () => {
    renderRoom();
    await enterRoom();
    expect(screen.getByTestId("room-time-total")).not.toHaveAttribute("aria-hidden");

    restartHideTimerOnFakeClock();
    advance(AUTO_HIDE_MS);
    expectControlsHidden();
    expect(screen.getByTestId("room-time-total")).toHaveClass("grid-rows-[0fr]");
    expect(screen.getByTestId("room-time-total")).toHaveAttribute("aria-hidden", "true");

    tapSurface();
    expectControlsShown();
    expect(screen.getByTestId("room-time-total")).toHaveClass("grid-rows-[1fr]");
    expect(screen.getByTestId("room-time-total")).not.toHaveAttribute("aria-hidden");
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

  it("다이얼로그가 열려 있는 동안은 시간이 지나도, 화면을 탭해도 숨지 않는다", async () => {
    renderRoom();
    await enterRoom();

    // 여는 조작보다 먼저 가짜 시계로 바꿔야 강제 표시가 빠졌을 때 숨김 타이머가 실제로 돈다.
    restartHideTimerOnFakeClock();
    fireEvent.click(screen.getByRole("button", { name: "카메라 켜기" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    advance(AUTO_HIDE_MS * 3);
    expectControlsShown();
    tapSurface();
    expectControlsShown();
    expect(screen.getByTestId("room-control-bar")).toHaveClass("pointer-events-auto");
  });

  it("더보기 메뉴가 열려 있는 동안은 시간이 지나도 숨지 않는다", async () => {
    renderRoom();
    await enterRoom();

    restartHideTimerOnFakeClock();
    // Radix 트리거는 왼쪽 버튼 pointerdown에서 열리는데 jsdom의 PointerEvent 폴백은 button을 싣지 않는다.
    fireEvent(
      screen.getByLabelText("더보기"),
      new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    expect(screen.getByRole("menu")).toBeInTheDocument();

    advance(AUTO_HIDE_MS * 3);
    expectControlsShown();
  });

  it("배경음 페이지가 열려 있는 동안은 시간이 지나도 숨지 않는다", async () => {
    renderRoom();
    await enterRoom();

    restartHideTimerOnFakeClock();
    fireEvent.click(screen.getByRole("button", { name: "배경음" }));
    expect(screen.getByRole("dialog", { name: "배경음" })).toBeInTheDocument();

    advance(AUTO_HIDE_MS * 3);
    expectControlsShown();
  });

  it("과목 페이지가 열려 있는 동안은 시간이 지나도 숨지 않는다", async () => {
    renderRoom();
    await enterRoom();

    restartHideTimerOnFakeClock();
    fireEvent.click(screen.getByRole("button", { name: "과목" }));
    expect(screen.getByRole("dialog", { name: "과목" })).toBeInTheDocument();

    advance(AUTO_HIDE_MS * 3);
    expectControlsShown();
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
    expect(screen.getByRole("button", { name: "배경음" })).toBeDisabled();
  });
});

describe("LiveRoomPage — 재입장 초기화 취급", () => {
  it("SNAPSHOT에 서버 보존값이 있어도 입장 즉시 focusSec 0을 발행한다", async () => {
    const { channel } = renderRoom({
      state: { inviteCode: "0712", graceRejoin: true },
      scenario: { snapshot: [member(7, { focusSec: 7320 })] },
    });
    await enterRoom();

    expect(channel.published.filter((p) => p.focusSec !== undefined)).toEqual([{ focusSec: 0 }]);
  });

  it("graceRejoin 재입장도 카메라 끔(일시정지)으로 들어간다 — join 재호출은 없다", async () => {
    renderRoom({
      // 서버가 이전 카메라 상태로 켬을 내려줘도 무시한다 — 재입장은 처음부터 취급.
      state: { inviteCode: "0712", graceRejoin: true, cameraOn: true },
      scenario: { snapshot: [member(7)] },
    });
    await enterRoom();

    expect(screen.getByRole("button", { name: "카메라 켜기" })).toBeInTheDocument();
    expect(mockedRenewSeat).not.toHaveBeenCalled();
  });

  it("서버 보존값이 있어도 내 타일에는 시간을 그리지 않는다", async () => {
    renderRoom({
      state: { inviteCode: "0712", graceRejoin: true },
      scenario: { snapshot: [member(7, { focusSec: 7320 }), member(8)] },
    });

    const tiles = await screen.findAllByTestId("room-tile");
    const myTile = tiles.find((tile) => tile.dataset.userId === "7");
    expect(myTile).toBeDefined();
    expect(within(myTile as HTMLElement).queryByText("02:02")).not.toBeInTheDocument();
    expect(within(myTile as HTMLElement).queryByTestId("tile-time-badge")).not.toBeInTheDocument();
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
    expect(consumeSocialRoomNotice()).toEqual({
      kind: "grace-end",
      message: "자리를 오래 비워서 공부를 종료했어요.\n공부 기록은 저장되었으니 안심하세요.",
    });
  });

  it("제출이 실패해도 실패 안내를 남기고 소셜 홈으로 이동한다", async () => {
    vi.mocked(submitStudySession).mockRejectedValue(new Error("네트워크"));
    renderRoom({ scenario: { snapshot: [member(7)] } });
    await enterRoom();
    await studyOverOneMinute();
    await expireGraceAndReturn();

    expect(await screen.findByTestId("social-home-stub")).toBeInTheDocument();
    expect(consumeSocialRoomNotice()).toEqual({
      kind: "grace-end",
      message: "자리를 오래 비워서 공부를 종료했어요.\n공부 기록은 저장되니 안심하세요.",
    });
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
    expect(consumeSocialRoomNotice()).toEqual({
      kind: "grace-end",
      message: "자리를 오래 비워서 공부를 종료했어요.\n1분 미만 공부는 기록에 표시되지 않아요",
    });
  });

  it("순공 1분 미만 + 제출 실패도 같은 미달 안내로 소셜 홈에 간다", async () => {
    vi.mocked(submitStudySession).mockRejectedValue(new Error("네트워크"));
    renderRoom({ scenario: { snapshot: [member(7)] } });
    await enterRoom();
    vi.useFakeTimers();
    await expireGraceAndReturn();

    expect(await screen.findByTestId("social-home-stub")).toBeInTheDocument();
    expect(consumeSocialRoomNotice()).toEqual({
      kind: "grace-end",
      message: "자리를 오래 비워서 공부를 종료했어요.\n1분 미만 공부는 기록에 표시되지 않아요",
    });
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
    expect(consumeSocialRoomNotice()).toEqual({
      kind: "grace-end",
      message: "자리를 오래 비워서 공부를 종료했어요.\n1분 미만 공부는 기록에 표시되지 않아요",
    });
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
    expect(consumeSocialRoomNotice()).toEqual({
      kind: "grace-end",
      message: "자리를 오래 비워서 공부를 종료했어요.\n1분 미만 공부는 기록에 표시되지 않아요",
    });
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
    expect(consumeSocialRoomNotice()).toEqual({
      kind: "grace-end",
      message: "자리를 오래 비워서 공부를 종료했어요.\n1분 미만 공부는 기록에 표시되지 않아요",
    });
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

describe("LiveRoomPage — 햅틱", () => {
  it("카메라 켜기 확정은 medium, 카메라 끄기는 light 햅틱을 한 번씩 울린다", async () => {
    renderRoom();
    await enterRoom();

    await userEvent.click(await screen.findByRole("button", { name: "카메라 켜기" }));
    expect(haptic).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "카메라 켜기" }));
    expect(haptic).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenLastCalledWith("medium");

    await userEvent.click(await screen.findByRole("button", { name: "카메라 끄기" }));
    expect(haptic).toHaveBeenCalledTimes(2);
    expect(haptic).toHaveBeenLastCalledWith("light");
  });

  it("종료 확인 창에서 공부 종료를 확정하면 medium 햅틱을 한 번 울린다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    renderRoom();
    await enterRoom();

    await userEvent.click(screen.getByRole("button", { name: "나가기" }));
    expect(haptic).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));

    expect(haptic).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith("medium");
  });
});

describe("LiveRoomPage — 배경음", () => {
  const CATALOG_JSON = JSON.stringify({
    version: 1,
    sounds: [{ id: "white", kind: "synth", label: "백색소음" }],
  });

  beforeEach(() => {
    ambientPlayers.length = 0;
    // 훅이 `/sounds/catalog.json` 을 받는다.
    // jsdom 은 상대 URL fetch 가 던지므로 응답을 준다.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(CATALOG_JSON, { status: 200 })),
    );
  });

  afterEach(() => {
    cleanup();
    resetGlassChrome();
    resetAmbientSoundStore();
    localStorage.clear();
  });

  it("저장된 소리가 있어도 카메라를 끈 채 입장하면 믹스를 걸기 전에 멈춰 둔다", async () => {
    setAmbientSoundStore(
      createMemoryAmbientSoundStore({ ...DEFAULT_AMBIENT_SETTINGS, mix: { white: 60 } }),
    );
    renderRoom();
    await enterRoom();

    await waitFor(() => {
      expect(ambientPlayers[0]?.commands).toContainEqual({
        type: "applyMix",
        mix: { white: 60 },
      });
    });
    expect(ambientPlayers[0]?.commands.slice(0, 2)).toEqual([
      { type: "suspend" },
      { type: "applyMix", mix: { white: 60 } },
    ]);
    expect(ambientPlayers[0]?.getState()).toBe("suspended");
  });

  it("버튼을 누르면 세션 화면 안에 페이지가 열리고, 닫으면 버튼으로 포커스가 돌아온다", async () => {
    renderRoom();
    await enterRoom();

    await userEvent.click(screen.getByRole("button", { name: "배경음" }));

    const dialog = screen.getByRole("dialog", { name: "배경음" });
    expect(screen.getByTestId("live-room-page")).toContainElement(dialog);
    expect(await screen.findByRole("slider", { name: "백색소음 음량" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "배경음" })).toHaveFocus();
    });
  });

  it("페이지가 열린 동안은 페이지의 알림 자리만 남아 토스트가 두 번 뜨지 않는다", async () => {
    renderRoom();
    await enterRoom();
    const toasters = () => document.querySelectorAll(`section[aria-label^="화면 알림"]`);
    expect(toasters()).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "배경음" }));

    expect(toasters()).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "배경음" })).toContainElement(
      toasters()[0] as HTMLElement,
    );
  });

  it("입장 직후 카메라가 꺼진 동안은 소리를 켜도 재생하지 않고, 카메라를 켜면 재생한다", async () => {
    renderRoom();
    await enterRoom();

    await userEvent.click(screen.getByRole("button", { name: "배경음" }));
    fireEvent.change(await screen.findByRole("slider", { name: "백색소음 음량" }), {
      target: { value: "60" },
    });
    const player = ambientPlayers[0];
    await waitFor(() => {
      expect(player?.commands).toContainEqual({ type: "applyMix", mix: { white: 60 } });
    });
    expect(player?.getState()).toBe("suspended");

    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("button", { name: "배경음 켜짐" })).toBeInTheDocument();
    await turnCameraOn();

    await waitFor(() => {
      expect(player?.getState()).toBe("playing");
    });
  });

  it("세션이 끝나 제출 중으로 넘어가면 열려 있던 페이지가 닫힌다", async () => {
    vi.mocked(submitStudySession).mockReturnValue(new Promise(() => undefined));
    const { channel } = renderRoom({ scenario: { snapshot: [member(8)] } });
    await enterRoom();
    await userEvent.click(screen.getByRole("button", { name: "배경음" }));
    expect(screen.getByRole("dialog", { name: "배경음" })).toBeInTheDocument();
    mockedRenewSeat.mockRejectedValue(new ApiError("자리 회수", 409, "CONFLICT"));

    act(() => channel.emitServerMessage({ type: "ROOM_UNAVAILABLE", roomId: 42 }));

    expect(await screen.findByText("저장 중...")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("소리를 켠 채 세션을 끝내면 배경음 사용을 study_session_ended에 싣는다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    renderRoom();
    await enterRoom();
    await userEvent.click(screen.getByRole("button", { name: "배경음" }));
    fireEvent.change(await screen.findByRole("slider", { name: "백색소음 음량" }), {
      target: { value: "60" },
    });
    await userEvent.keyboard("{Escape}");
    await turnCameraOn();
    await waitFor(() => {
      expect(ambientPlayers[0]?.getState()).toBe("playing");
    });

    await userEvent.click(screen.getByRole("button", { name: "나가기" }));
    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));

    await waitFor(() => {
      expect(trackStudySessionEnded).toHaveBeenCalledTimes(1);
    });
    expect(trackStudySessionEnded.mock.calls[0]?.[0]).toMatchObject({
      roomType: "social",
      ambientSoundUsed: true,
      ambientSoundSec: expect.any(Number),
    });
  });

  it("바의 배경음 버튼은 앱 glass로 등록하지 않고 웹 버튼으로 남는다", async () => {
    const postMessage = enterGlassChrome("/social/room/42", "segment,switch,button,button-style");
    measureControlsNow();
    renderRoom();
    // 브리지를 stub한 상태라 입장 전 권한 게이트가 응답을 기다린다.
    grantCameraGate();
    await enterRoom();

    expect(screen.getByRole("button", { name: "배경음" })).not.toHaveAttribute("aria-hidden");
    expect(lastInlineControls(postMessage).map(({ id }) => id)).not.toContain("session-ambient");
  });
});

describe("LiveRoomPage — 과목", () => {
  const MATH: SubjectResponse = {
    id: 3,
    name: "수학",
    colorIndex: 0,
    studySec: 600,
    focusSec: 600,
    tasks: [],
  };
  const SLIDE = "translate-y-[calc(100%+env(safe-area-inset-bottom)+17px)]";

  afterEach(() => {
    cleanup();
    resetGlassChrome();
  });

  const pill = () => screen.queryByRole("button", { name: /^수학.*순공/ });

  /** 카메라를 켠 채 과목 페이지에서 수학의 재생 버튼을 누른다. */
  async function pickMathWithCameraOn() {
    listSubjects.mockResolvedValue([MATH]);
    renderRoom();
    await enterRoom();
    await turnCameraOn();
    await userEvent.click(screen.getByRole("button", { name: "과목" }));
    await userEvent.click(await screen.findByRole("button", { name: "수학 측정 시작" }));
  }

  it("과목 버튼으로 열면 세션 화면 안에 페이지가 열리고, 닫으면 버튼으로 포커스가 돌아온다", async () => {
    renderRoom();
    await enterRoom();

    await userEvent.click(screen.getByRole("button", { name: "과목" }));

    const dialog = screen.getByRole("dialog", { name: "과목" });
    expect(screen.getByTestId("live-room-page")).toContainElement(dialog);
    expect(screen.getByRole("button", { name: "과목", hidden: true })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(subjectTracking.trackSubjectSheetOpened).toHaveBeenCalledWith("button");

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "과목" })).toHaveFocus();
    });
    expect(subjectTracking.trackSubjectSheetClosed).toHaveBeenCalledWith(
      expect.objectContaining({ closedBy: "back" }),
    );
  });

  it("과목을 고르지 않았으면 알약이 없다", async () => {
    listSubjects.mockResolvedValue([MATH]);
    renderRoom();
    await enterRoom();

    await waitFor(() => expect(listSubjects).toHaveBeenCalled());
    expect(pill()).not.toBeInTheDocument();
  });

  it("페이지가 닫힌 동안 미리 받기가 실패하면 토스트를 띄우지 않는다", async () => {
    listSubjects.mockRejectedValue(new Error("network"));
    renderRoom();
    await enterRoom();

    await waitFor(() => expect(listSubjects).toHaveBeenCalledTimes(1));
    // 실패 처리는 조회가 끝난 뒤 이어지므로 한 틱 더 기다린다.
    await act(async () => {});
    expect(showCtaToast).not.toHaveBeenCalled();
  });

  it("미리 받기가 실패한 채 페이지를 열면 목록을 다시 받는다", async () => {
    listSubjects.mockRejectedValueOnce(new Error("network"));
    renderRoom();
    await enterRoom();
    await waitFor(() => expect(listSubjects).toHaveBeenCalledTimes(1));
    await act(async () => {});

    await userEvent.click(screen.getByRole("button", { name: "과목" }));

    await waitFor(() => expect(listSubjects).toHaveBeenCalledTimes(2));
  });

  it("카메라가 켜진 채 재생을 누르면 그 과목을 고르고 페이지를 닫으며, 알약에 이름과 서버 누적이 더해진 시간이 보인다", async () => {
    await pickMathWithCameraOn();

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(pill()).toHaveTextContent(/수학00:10:0\d/);
    expect(screen.getByRole("button", { name: "과목 선택됨" })).toHaveAttribute("data-on", "true");
    expect(subjectTracking.trackSubjectItemSelected).toHaveBeenCalledWith("subject");
    expect(subjectTracking.trackSubjectSheetClosed).toHaveBeenCalledWith(
      expect.objectContaining({ closedBy: "play" }),
    );
  });

  it("알약은 내 시간 글자 바로 아래 왼쪽에 놓이고 이름이 길면 화면 폭 안에서 잘린다", async () => {
    listSubjects.mockResolvedValue([{ ...MATH, name: "수학".repeat(20) }]);
    renderRoom();
    await enterRoom();
    await turnCameraOn();
    await userEvent.click(screen.getByRole("button", { name: "과목" }));
    await userEvent.click(
      await screen.findByRole("button", { name: `${"수학".repeat(20)} 측정 시작` }),
    );

    const subjectPill = await screen.findByRole("button", { name: /^(수학)+.*순공/ });
    const timeText = screen.getByTestId("room-time-text");
    expect(timeText.nextElementSibling).toContainElement(subjectPill);
    // 시간 글자와 알약을 묶은 칸이 오른쪽에도 화면 여백을 둬서 알약 폭의 상한이 된다.
    expect(timeText.parentElement).toHaveClass(
      "left-[calc(env(safe-area-inset-left)+16px)]",
      "right-[calc(env(safe-area-inset-right)+16px)]",
    );
    expect(subjectPill).toHaveClass("max-w-full");
    expect(within(subjectPill).getByText("수학".repeat(20))).toHaveClass("truncate");
  });

  it("알약 위로는 흐림 배경을 끊는 transform·opacity·filter 조상이 없다", async () => {
    await pickMathWithCameraOn();
    const subjectPill = await screen.findByRole("button", { name: /^수학.*순공/ });
    const page = screen.getByTestId("live-room-page");

    for (let node = subjectPill.parentElement; node && node !== page; node = node.parentElement) {
      expect(node.className).not.toMatch(/(^|\s)(translate|scale|rotate|opacity|filter|blur)-/);
    }
  });

  it("알약을 누르면 페이지가 열리고, 닫으면 알약으로 포커스가 돌아온다", async () => {
    await pickMathWithCameraOn();
    const subjectPill = await screen.findByRole("button", { name: /^수학.*순공/ });

    await userEvent.click(subjectPill);
    expect(subjectTracking.trackSubjectSheetOpened).toHaveBeenLastCalledWith("label");
    expect(screen.getByRole("dialog", { name: "과목" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(subjectPill).toHaveFocus());
  });

  it("조작이 숨어도 알약은 남고 누를 수 있다", async () => {
    await pickMathWithCameraOn();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    vi.useFakeTimers();
    fireEvent.pointerDown(screen.getByTestId("room-control-bar"));
    act(() => {
      vi.advanceTimersByTime(AUTO_HIDE_MS);
    });

    expect(screen.getByTestId("room-control-bar")).toHaveClass(SLIDE);
    const subjectPill = pill();
    expect(subjectPill?.closest("[inert], [aria-hidden='true']")).toBeNull();
    // 총 줄이 접힌 자리로 올라가도 시간 글자 바로 다음 칸에 남는다.
    expect(screen.getByTestId("room-time-total")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("room-time-text").nextElementSibling).toContainElement(subjectPill);

    fireEvent.click(subjectPill as HTMLElement);
    expect(screen.getByRole("dialog", { name: "과목" })).toBeInTheDocument();
  });

  it("카메라가 꺼진 채 재생을 누르면 과목을 고르고 페이지를 닫은 뒤 카메라 켜기 확인 창을 연다. 취소하면 일시정지와 과목이 남는다", async () => {
    listSubjects.mockResolvedValue([MATH]);
    renderRoom();
    await enterRoom();

    await userEvent.click(screen.getByRole("button", { name: "과목" }));
    await userEvent.click(await screen.findByRole("button", { name: "수학 측정 시작" }));

    const confirm = await screen.findByRole("alertdialog");
    expect(screen.queryByRole("dialog", { name: "과목" })).not.toBeInTheDocument();
    expect(subjectTracking.trackSubjectSheetClosed).toHaveBeenCalledWith(
      expect.objectContaining({ closedBy: "play" }),
    );

    await userEvent.click(within(confirm).getByRole("button", { name: "취소" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "카메라 켜기" })).toBeInTheDocument();
    expect(pill()?.querySelector("img")).toHaveClass("opacity-40");
    // 확인 창을 연 재생 버튼은 닫힌 페이지와 함께 사라져서 페이지를 연 과목 버튼으로 돌아간다.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "과목 선택됨" })).toHaveFocus();
    });
  });

  it("카메라가 꺼진 채 재생 뒤 확인 창에서 카메라를 켜면 측정이 다시 시작된다", async () => {
    listSubjects.mockResolvedValue([MATH]);
    renderRoom();
    await enterRoom();

    await userEvent.click(screen.getByRole("button", { name: "과목" }));
    await userEvent.click(await screen.findByRole("button", { name: "수학 측정 시작" }));
    const confirm = await screen.findByRole("alertdialog");
    await userEvent.click(within(confirm).getByRole("button", { name: "카메라 켜기" }));

    expect(await screen.findByRole("button", { name: "카메라 끄기" })).toBeInTheDocument();
    expect(pill()?.querySelector("img")).toHaveClass("animate-pulse");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "과목 선택됨" })).toHaveFocus();
    });
  });

  it("세션이 끝나 제출 중으로 넘어가면 열려 있던 과목 페이지가 닫힌다", async () => {
    vi.mocked(submitStudySession).mockReturnValue(new Promise(() => undefined));
    const { channel } = renderRoom({ scenario: { snapshot: [member(8)] } });
    await enterRoom();
    await userEvent.click(screen.getByRole("button", { name: "과목" }));
    expect(screen.getByRole("dialog", { name: "과목" })).toBeInTheDocument();
    mockedRenewSeat.mockRejectedValue(new ApiError("자리 회수", 409, "CONFLICT"));

    act(() => channel.emitServerMessage({ type: "ROOM_UNAVAILABLE", roomId: 42 }));

    expect(await screen.findByText("저장 중...")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("세션 제출에 이 세션에서 완료한 할 일이 실린다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    const doneAt = new Date(Date.now() + 60_000).toISOString();
    listSubjects.mockResolvedValue([
      {
        ...MATH,
        tasks: [
          { id: 11, name: "미적분", doneAt },
          { id: 12, name: "확통", doneAt: null },
        ],
      },
    ]);
    renderRoom();
    await enterRoom();
    await waitFor(() => expect(listSubjects).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: "나가기" }));
    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));

    await waitFor(() => expect(submitStudySession).toHaveBeenCalled());
    expect(vi.mocked(submitStudySession).mock.calls[0]?.[0]).toMatchObject({
      completedTaskIds: [11],
    });
  });

  it("세션 제출에 고른 과목의 구간이 실린다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    await pickMathWithCameraOn();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "나가기" }));
    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));

    await waitFor(() => expect(submitStudySession).toHaveBeenCalled());
    expect(vi.mocked(submitStudySession).mock.calls[0]?.[0]).toMatchObject({
      subjectSegments: [expect.objectContaining({ subjectId: MATH.id })],
    });
  });

  it("더보기 메뉴가 열린 동안 알약은 누름을 받지 않아 바깥 누름으로 메뉴만 닫힌다", async () => {
    await pickMathWithCameraOn();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "더보기" }));

    const subjectPill = screen.getByRole("button", { name: /^수학.*순공/, hidden: true });
    expect(subjectPill).toHaveClass("pointer-events-none");
    expect(subjectPill).not.toHaveClass("pointer-events-auto");
  });

  it("제출 중에는 알약이 누를 수 없는 글자가 된다", async () => {
    vi.mocked(submitStudySession).mockReturnValue(new Promise(() => undefined));
    await pickMathWithCameraOn();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "나가기" }));
    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));

    expect(await screen.findByText("저장 중...")).toBeInTheDocument();
    expect(pill()).not.toBeInTheDocument();
    expect(screen.getByText("수학").parentElement).toHaveClass("pointer-events-none");
  });

  it("바의 과목 버튼은 앱 glass로 등록하지 않고 웹 버튼으로 남는다", async () => {
    const postMessage = enterGlassChrome("/social/room/42", "segment,switch,button,button-style");
    measureControlsNow();
    renderRoom();
    grantCameraGate();
    await enterRoom();

    expect(screen.getByRole("button", { name: "과목" })).not.toHaveAttribute("aria-hidden");
    expect(lastInlineControls(postMessage).map(({ id }) => id)).not.toContain("session-subject");
  });
});
