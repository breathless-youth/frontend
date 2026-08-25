import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import type { CameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { joinRoom } from "@/lib/roomApi";

import { LiveRoomEntry } from "../LiveRoomEntry";
import type { LiveRoomLocationState } from "../liveRoomEntryState";

/**
 * 입장 단계(미리보기 모달 없이 카메라 꺼짐 자동 입장) 검증.
 *
 * 세션 본체는 stub으로 대체한다 — 여기서 보는 것은 "언제 어떤 상태로 세션에 들어가는가"뿐이고,
 * 세션 내부(채널·메시·측정)는 자기 테스트가 따로 있다.
 */

vi.mock("@/lib/roomApi", () => ({ joinRoom: vi.fn() }));
vi.mock("@/lib/profileQueries", () => ({
  profileQuery: (userId: number) => ({
    queryKey: ["profile", userId],
    queryFn: async () => null,
  }),
}));
vi.mock("../LiveRoomSession", () => ({
  LiveRoomSession: ({ initialCameraOn }: { initialCameraOn: boolean }) => (
    <div data-testid="session" data-camera-on={String(initialCameraOn)} />
  ),
}));

const mockedJoinRoom = vi.mocked(joinRoom);

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

function renderEntry(entryState: LiveRoomLocationState, camera = fakeCamera()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/social/room/1?userId=7"]}>
        <Routes>
          <Route
            path="/social/room/:roomId"
            element={
              <LiveRoomEntry
                roomId={1}
                userId={7}
                entryState={entryState}
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
  delete (globalThis as { ReactNativeWebView?: unknown }).ReactNativeWebView;
});

it("입장 단계에서 미리보기 카메라를 시작하지 않는다", async () => {
  mockedJoinRoom.mockResolvedValue({ iceServers: [] } as never);

  const camera = renderEntry({ inviteCode: "1234" });
  await screen.findByTestId("session");

  expect(camera.startCalls).toBe(0);
});

it("카메라 꺼짐으로 자동 입장한다 — join을 부르고 세션을 initialCameraOn=false로 연다", async () => {
  mockedJoinRoom.mockResolvedValue({ iceServers: [] } as never);

  renderEntry({ inviteCode: "1234" });

  const session = await screen.findByTestId("session");
  expect(session.dataset.cameraOn).toBe("false");
  expect(mockedJoinRoom).toHaveBeenCalledTimes(1);
  expect(mockedJoinRoom).toHaveBeenCalledWith(7, "1234");
});

it("join 실패 시 오류와 재시도 수단을 보여주고 카메라는 시작하지 않는다", async () => {
  mockedJoinRoom.mockRejectedValue(new Error("network"));

  const camera = renderEntry({ inviteCode: "1234" });

  await screen.findByText(/다시 확인|가득|잠시 후|실패|오류/);
  expect(screen.queryByTestId("session")).toBeNull();
  expect(camera.startCalls).toBe(0);
});

it("graceRejoin은 join 없이 이전 카메라 상태로 바로 입장한다", async () => {
  renderEntry({ inviteCode: "1234", graceRejoin: true, cameraOn: true, iceServers: [] });

  const session = await screen.findByTestId("session");
  expect(session.dataset.cameraOn).toBe("true");
  expect(mockedJoinRoom).not.toHaveBeenCalled();
});

it("브리지가 있으면 게이트를 발신하고, 허용 응답이면 입장한다", async () => {
  const postMessage = vi.fn();
  (globalThis as { ReactNativeWebView?: unknown }).ReactNativeWebView = { postMessage };
  mockedJoinRoom.mockResolvedValue({ iceServers: [] } as never);

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
  mockedJoinRoom.mockResolvedValue({ iceServers: [] } as never);

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
  expect(mockedJoinRoom).not.toHaveBeenCalled();
  expect(camera.startCalls).toBe(0);
  expect(screen.queryByTestId("session")).toBeNull();
});

it("graceRejoin도 권한 게이트를 탄다 — 허용이면 join 없이 이전 카메라 상태로 입장한다", async () => {
  const postMessage = vi.fn();
  (globalThis as { ReactNativeWebView?: unknown }).ReactNativeWebView = { postMessage };

  renderEntry({ inviteCode: "1234", graceRejoin: true, cameraOn: true, iceServers: [] });

  await waitFor(() => {
    const types = postMessage.mock.calls.map((call) => JSON.parse(call[0] as string).type);
    expect(types).toContain("request-camera-gate");
  });

  const entry = (globalThis as unknown as Record<string, (raw: string) => void>)[
    NATIVE_MESSAGE_ENTRY
  ];
  entry(JSON.stringify({ type: "camera-gate-result", granted: true, atMs: 1 }));

  const session = await screen.findByTestId("session");
  expect(session.dataset.cameraOn).toBe("true");
  expect(mockedJoinRoom).not.toHaveBeenCalled();
});

it("graceRejoin에서 권한이 거부되면 입장하지 않고 소셜 홈으로 돌아간다", async () => {
  const postMessage = vi.fn();
  (globalThis as { ReactNativeWebView?: unknown }).ReactNativeWebView = { postMessage };

  renderEntry({ inviteCode: "1234", graceRejoin: true, cameraOn: true, iceServers: [] });

  await waitFor(() => {
    const types = postMessage.mock.calls.map((call) => JSON.parse(call[0] as string).type);
    expect(types).toContain("request-camera-gate");
  });

  const entry = (globalThis as unknown as Record<string, (raw: string) => void>)[
    NATIVE_MESSAGE_ENTRY
  ];
  entry(JSON.stringify({ type: "camera-gate-result", granted: false, atMs: 1 }));

  await screen.findByTestId("social-home-stub");
  expect(mockedJoinRoom).not.toHaveBeenCalled();
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
  mockedJoinRoom.mockResolvedValue({ iceServers: [] } as never);

  renderEntry({ inviteCode: "1234" });

  await waitFor(() => {
    const sent = postMessage.mock.calls.map((call) => JSON.parse(call[0] as string));
    expect(sent).toContainEqual(
      expect.objectContaining({ type: "set-orientation", unlocked: true }),
    );
  });
});
