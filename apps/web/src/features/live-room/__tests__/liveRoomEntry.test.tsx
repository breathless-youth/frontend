import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import type { CameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import type * as Amplitude from "@/lib/amplitude";
import { trackSocialRoomEntered } from "@/lib/amplitude";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import type * as MetaAppEvents from "@/lib/metaAppEvents";
import { trackMetaSocialRoomEntered } from "@/lib/metaAppEvents";
import { renewLiveRoomSeat } from "@/lib/roomApi";
import * as subjectApi from "@/lib/subjectApi";
import * as groupRoomApi from "@/lib/groupRoomApi";

import { LiveRoomEntry } from "../LiveRoomEntry";
import type { LiveRoomLocationState } from "../liveRoomEntryState";
import type { LiveRoomKind } from "../roomKind";

/**
 * 입장 단계(미리보기 모달 없이 카메라 꺼짐 자동 입장) 검증.
 *
 * 세션 본체는 stub으로 대체한다 — 여기서 보는 것은 "언제 어떤 상태로 세션에 들어가는가"뿐이고,
 * 세션 내부(채널·메시·측정)는 자기 테스트가 따로 있다.
 */

/** 복원 게이트는 자기 테스트가 따로 있다 — 여기서는 통과시킨다. */
vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: () => ({ settled: true, restored: null }),
}));
vi.mock("@/lib/roomApi", () => ({ renewLiveRoomSeat: vi.fn() }));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackSocialRoomEntered: vi.fn(),
}));
vi.mock("@/lib/metaAppEvents", async (importOriginal) => ({
  ...(await importOriginal<typeof MetaAppEvents>()),
  trackMetaSocialRoomEntered: vi.fn(),
}));
vi.mock("@/lib/profileQueries", () => ({
  profileQuery: (userId: number) => ({
    queryKey: ["profile", userId],
    queryFn: async () => null,
  }),
}));
vi.mock("../LiveRoomSession", () => ({
  LiveRoomSession: ({ initialSubjectId }: { initialSubjectId?: number }) => (
    <div data-testid="session">{initialSubjectId}</div>
  ),
}));

const mockedRenewSeat = vi.mocked(renewLiveRoomSeat);
const mockedTrackEntered = vi.mocked(trackSocialRoomEntered);
const mockedTrackMetaEntered = vi.mocked(trackMetaSocialRoomEntered);

function fakeCamera(): CameraAdapter & { startCalls: number } {
  const adapter = {
    startCalls: 0,
    facing: "front" as const,
    isRunning: false,
    stream: null,
    async start() {
      adapter.startCalls += 1;
    },
    stop() {},
    async flip() {
      return { ok: false as const, reason: "no-alternative" as const };
    },
  };
  return adapter as unknown as CameraAdapter & { startCalls: number };
}

function renderEntry(
  entryState: LiveRoomLocationState,
  camera = fakeCamera(),
  initialSubjectId?: number,
  initialSubjectVerified?: { userId: number; subjectId: number; validUntil: number },
  room: LiveRoomKind = { kind: "invite", inviteCode: entryState.inviteCode },
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/social/room/1?userId=7"]}>
        <Routes>
          <Route
            path="/social/room/:roomId"
            element={
              <LiveRoomEntry
                room={room}
                initialRoomId={1}
                userId={7}
                graceRejoin={entryState.graceRejoin === true}
                initialIceServers={entryState.iceServers ?? []}
                initialSubjectId={initialSubjectId}
                initialSubjectVerified={initialSubjectVerified}
                createChannel={() => {
                  throw new Error("세션 stub에서는 채널을 만들지 않는다");
                }}
                createCamera={() => camera}
              />
            }
          />
          <Route path="/social" element={<div data-testid="social-home-stub" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return camera;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  delete (globalThis as { ReactNativeWebView?: unknown }).ReactNativeWebView;
});

it("선택 과목 조회가 실패하면 그룹 입장을 막고 재시도 뒤 해당 과목으로 들어간다", async () => {
  vi.spyOn(subjectApi, "listSubjects")
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([
      { id: 3, name: "수학", colorIndex: 0, studySec: 0, focusSec: 0, tasks: [] },
    ]);
  const joinGroup = vi.spyOn(groupRoomApi, "joinGroupRoom").mockResolvedValue({
    roomId: 1,
    graceRejoin: false,
    iceServers: [],
    cameraOn: null,
    micOn: null,
    onBreak: null,
    iceTtlSeconds: 60,
  });
  renderEntry({ inviteCode: "1234" }, fakeCamera(), 3, undefined, { kind: "group", groupId: 8 });
  await screen.findByText("과목을 불러오지 못했어요");
  expect(screen.queryByTestId("session")).toBeNull();
  expect(joinGroup).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "뒤로 가기" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByTestId("session")).toHaveTextContent("3");
  expect(joinGroup).toHaveBeenCalledOnce();
});

it("같은 계정에서 좌석 예약 전에 확인한 과목은 입장 시 재조회하지 않는다", async () => {
  const list = vi.spyOn(subjectApi, "listSubjects").mockRejectedValue(new Error("offline"));
  mockedRenewSeat.mockResolvedValue({ iceServers: [] } as never);
  renderEntry({ inviteCode: "1234" }, fakeCamera(), 3, {
    userId: 7,
    subjectId: 3,
    validUntil: Date.now() + 30000,
  });
  expect(await screen.findByTestId("session")).toHaveTextContent("3");
  expect(list).not.toHaveBeenCalled();
});

it("좌석 응답을 기다리는 동안 확인 기한이 지나면 과목을 다시 확인한다", async () => {
  const list = vi.spyOn(subjectApi, "listSubjects").mockRejectedValue(new Error("offline"));
  mockedRenewSeat.mockImplementationOnce(() => new Promise(() => {}));
  renderEntry({ inviteCode: "1234" }, fakeCamera(), 3, {
    userId: 7,
    subjectId: 3,
    validUntil: Date.now() + 60,
  });
  await screen.findByText("과목을 불러오지 못했어요");
  expect(list).toHaveBeenCalled();
  expect(screen.queryByTestId("session")).toBeNull();
});

it("히스토리 상태로 다시 열린 화면에서는 만료된 과목 확인을 재사용하지 않는다", async () => {
  let now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const list = vi.spyOn(subjectApi, "listSubjects").mockRejectedValue(new Error("offline"));
  mockedRenewSeat.mockImplementation(() => new Promise(() => {}));
  const proof = { userId: 7, subjectId: 3, validUntil: now + 30000 };
  renderEntry({ inviteCode: "1234" }, fakeCamera(), 3, proof);
  expect(list).not.toHaveBeenCalled();
  cleanup();
  now += 30001;
  renderEntry({ inviteCode: "1234" }, fakeCamera(), 3, proof);
  await screen.findByText("과목을 불러오지 못했어요");
  expect(list).toHaveBeenCalledOnce();
  expect(screen.queryByTestId("session")).toBeNull();
});

it.each([
  { userId: 8, subjectId: 3, validUntil: Date.now() + 30000 },
  { userId: 7, subjectId: 4, validUntil: Date.now() + 30000 },
  { userId: 7, subjectId: 3, validUntil: Date.now() - 1 },
])("다른 계정·과목 또는 만료된 검증은 재확인한다", async (proof) => {
  const list = vi.spyOn(subjectApi, "listSubjects").mockRejectedValue(new Error("offline"));
  mockedRenewSeat.mockResolvedValue({ iceServers: [] } as never);
  renderEntry({ inviteCode: "1234" }, fakeCamera(), 3, proof);
  await screen.findByText("과목을 불러오지 못했어요");
  expect(list).toHaveBeenCalled();
  expect(screen.queryByTestId("session")).toBeNull();
});

it("과목 확인 오류에서 키보드로 뒤로 가면 초대 방 입장 없이 돌아간다", async () => {
  vi.spyOn(subjectApi, "listSubjects").mockRejectedValueOnce(new Error("offline"));
  mockedRenewSeat.mockResolvedValue({ iceServers: [] } as never);
  renderEntry({ inviteCode: "1234" }, fakeCamera(), 3);
  await screen.findByText("과목을 불러오지 못했어요");
  const back = screen.getByRole("button", { name: "뒤로 가기" });
  back.focus();
  await userEvent.keyboard("{Enter}");
  expect(screen.getByTestId("social-home-stub")).toBeInTheDocument();
  expect(mockedRenewSeat).not.toHaveBeenCalled();
});

it("입장 단계에서 미리보기 카메라를 시작하지 않는다", async () => {
  mockedRenewSeat.mockResolvedValue({ iceServers: [] } as never);

  const camera = renderEntry({ inviteCode: "1234" });
  await screen.findByTestId("session");

  expect(camera.startCalls).toBe(0);
});

it("자동 입장한다 — join을 부르고 세션을 연다", async () => {
  mockedRenewSeat.mockResolvedValue({ iceServers: [] } as never);

  renderEntry({ inviteCode: "1234" });

  await screen.findByTestId("session");
  expect(mockedRenewSeat).toHaveBeenCalledTimes(1);
  expect(mockedRenewSeat).toHaveBeenCalledWith("1234");
});

it("join 실패 시 오류와 재시도 수단을 보여주고 카메라는 시작하지 않는다", async () => {
  mockedRenewSeat.mockRejectedValue(new Error("network"));

  const camera = renderEntry({ inviteCode: "1234" });

  await screen.findByText(/다시 확인|가득|잠시 후|실패|오류/);
  expect(screen.queryByTestId("session")).toBeNull();
  expect(camera.startCalls).toBe(0);
});

it("graceRejoin은 join 없이 바로 입장한다", async () => {
  renderEntry({ inviteCode: "1234", graceRejoin: true, iceServers: [] });

  await screen.findByTestId("session");
  expect(mockedRenewSeat).not.toHaveBeenCalled();
});

it("입장 계측은 입장당 1회이고 유예 재입장은 Meta 전환을 세지 않는다", async () => {
  mockedRenewSeat.mockResolvedValue({ iceServers: [] } as never);

  renderEntry({ inviteCode: "1234" });
  await screen.findByTestId("session");
  expect(mockedTrackEntered).toHaveBeenCalledTimes(1);
  expect(mockedTrackEntered).toHaveBeenLastCalledWith(false);
  expect(mockedTrackMetaEntered).toHaveBeenCalledTimes(1);

  cleanup();
  renderEntry({ inviteCode: "1234", graceRejoin: true, iceServers: [] });
  await screen.findByTestId("session");
  expect(mockedTrackEntered).toHaveBeenCalledTimes(2);
  expect(mockedTrackEntered).toHaveBeenLastCalledWith(true);
  expect(mockedTrackMetaEntered).toHaveBeenCalledTimes(1);
});

it("브리지가 있으면 게이트를 발신하고, 허용 응답이면 입장한다", async () => {
  const postMessage = vi.fn();
  (globalThis as { ReactNativeWebView?: unknown }).ReactNativeWebView = { postMessage };
  mockedRenewSeat.mockResolvedValue({ iceServers: [] } as never);

  renderEntry({ inviteCode: "1234" });

  // 회전 훅(set-orientation)도 마운트에 발신하므로 첫 호출을 단정하지 않고 목록에서 찾는다.
  await waitFor(() => {
    const types = postMessage.mock.calls.map((call) => JSON.parse(call[0] as string).type);
    expect(types).toContain("request-camera-gate");
  });

  const entry = (globalThis as unknown as Record<string, (raw: string) => void>)[
    NATIVE_MESSAGE_ENTRY
  ];
  entry(JSON.stringify({ type: "camera-gate-result", granted: true, atMs: 1 }));

  await screen.findByTestId("session");
});

it("게이트가 거부면 join 없이 소셜 홈으로 돌아간다 — 권한 안내 화면 뒤에 룸이 남으면 안 된다", async () => {
  const postMessage = vi.fn();
  (globalThis as { ReactNativeWebView?: unknown }).ReactNativeWebView = { postMessage };
  mockedRenewSeat.mockResolvedValue({ iceServers: [] } as never);

  const camera = renderEntry({ inviteCode: "1234" });

  await waitFor(() => {
    const types = postMessage.mock.calls.map((call) => JSON.parse(call[0] as string).type);
    expect(types).toContain("request-camera-gate");
  });

  const entry = (globalThis as unknown as Record<string, (raw: string) => void>)[
    NATIVE_MESSAGE_ENTRY
  ];
  entry(JSON.stringify({ type: "camera-gate-result", granted: false, atMs: 1 }));

  await screen.findByTestId("social-home-stub");
  expect(mockedRenewSeat).not.toHaveBeenCalled();
  expect(camera.startCalls).toBe(0);
  expect(screen.queryByTestId("session")).toBeNull();
});

it("graceRejoin도 권한 게이트를 탄다 — 허용이면 join 없이 입장한다", async () => {
  const postMessage = vi.fn();
  (globalThis as { ReactNativeWebView?: unknown }).ReactNativeWebView = { postMessage };

  renderEntry({ inviteCode: "1234", graceRejoin: true, iceServers: [] });

  await waitFor(() => {
    const types = postMessage.mock.calls.map((call) => JSON.parse(call[0] as string).type);
    expect(types).toContain("request-camera-gate");
  });

  const entry = (globalThis as unknown as Record<string, (raw: string) => void>)[
    NATIVE_MESSAGE_ENTRY
  ];
  entry(JSON.stringify({ type: "camera-gate-result", granted: true, atMs: 1 }));

  await screen.findByTestId("session");
  expect(mockedRenewSeat).not.toHaveBeenCalled();
});

it("graceRejoin에서 권한이 거부되면 입장하지 않고 소셜 홈으로 돌아간다", async () => {
  const postMessage = vi.fn();
  (globalThis as { ReactNativeWebView?: unknown }).ReactNativeWebView = { postMessage };

  renderEntry({ inviteCode: "1234", graceRejoin: true, iceServers: [] });

  await waitFor(() => {
    const types = postMessage.mock.calls.map((call) => JSON.parse(call[0] as string).type);
    expect(types).toContain("request-camera-gate");
  });

  const entry = (globalThis as unknown as Record<string, (raw: string) => void>)[
    NATIVE_MESSAGE_ENTRY
  ];
  entry(JSON.stringify({ type: "camera-gate-result", granted: false, atMs: 1 }));

  await screen.findByTestId("social-home-stub");
  expect(mockedRenewSeat).not.toHaveBeenCalled();
  expect(screen.queryByTestId("session")).toBeNull();
});

/**
 * 회귀 가드. 훅 정의는 남아 있는데 **호출이 사라져도** 다른 테스트는 전부 통과한다 —
 * 2026-08-26 dev 병합에서 입장 화면을 교체하며 실제로 이 호출을 잃었고, 안드로이드 룸
 * 회전이 통째로 죽었다. 발신 자체를 여기서 못 박는다.
 */
it("룸에 들어가면 회전 잠금 해제를 요청한다", async () => {
  const postMessage = vi.fn();
  (globalThis as { ReactNativeWebView?: unknown }).ReactNativeWebView = { postMessage };
  mockedRenewSeat.mockResolvedValue({ iceServers: [] } as never);

  renderEntry({ inviteCode: "1234" });

  await waitFor(() => {
    const sent = postMessage.mock.calls.map((call) => JSON.parse(call[0] as string));
    expect(sent).toContainEqual(
      expect.objectContaining({ type: "set-orientation", unlocked: true }),
    );
  });
});
