import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import { renewLiveRoomSeat } from "@/lib/roomApi";

import { LiveRoomEntry } from "../LiveRoomEntry";

/**
 * 복원 게이트 검증 — 조회가 결착되기 전에는 세션에 들어가지 않고, 결착하면 복원값을 넘긴다.
 * 세션 본체는 stub으로 대체하고 받은 prop만 관측한다.
 */

const useActiveSessionRestore = vi.hoisted(() => vi.fn());
const sessionProps = vi.hoisted(() => vi.fn());

vi.mock("@/features/study-session/useActiveSessionRestore", () => ({ useActiveSessionRestore }));
vi.mock("@/lib/roomApi", () => ({ renewLiveRoomSeat: vi.fn() }));
vi.mock("@/lib/profileQueries", () => ({
  profileQuery: (userId: number) => ({
    queryKey: ["profile", userId],
    queryFn: async () => null,
  }),
}));
vi.mock("../LiveRoomSession", () => ({
  LiveRoomSession: (props: Record<string, unknown>) => {
    sessionProps(props);
    return <div data-testid="session" />;
  },
}));

const mockedRenewSeat = vi.mocked(renewLiveRoomSeat);

const RESTORED = {
  startedAtMs: Date.UTC(2026, 7, 28, 1, 0, 0),
  reportedAtMs: Date.UTC(2026, 7, 28, 1, 32, 0),
  baseStudySec: 1850,
  baseFocusSec: 1620,
  events: [],
};

function fakeCamera(): CameraAdapter {
  return {
    facing: "front" as const,
    isRunning: false,
    stream: null,
    async start() {},
    stop() {},
    async flip() {
      return { ok: false as const, reason: "no-alternative" as const };
    },
  } as unknown as CameraAdapter;
}

function renderEntry() {
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
                entryState={{ inviteCode: "1234" }}
                createChannel={() => {
                  throw new Error("세션 stub에서는 채널을 만들지 않는다");
                }}
                createCamera={fakeCamera}
              />
            }
          />
          <Route path="/social" element={<div data-testid="social-home-stub" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LiveRoomEntry 복원 게이트", () => {
  beforeEach(() => {
    useActiveSessionRestore.mockReset();
    sessionProps.mockReset();
    mockedRenewSeat.mockReset().mockResolvedValue({ iceServers: [] } as never);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("결착 전에는 세션으로 들어가지 않는다", async () => {
    useActiveSessionRestore.mockReturnValue({ settled: false, restored: null });

    renderEntry();
    await screen.findByTestId("live-room-page");

    expect(useActiveSessionRestore).toHaveBeenCalledWith(7);
    expect(screen.queryByTestId("session")).toBeNull();
  });

  it("결착하면 복원값을 세션에 넘긴다", async () => {
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: RESTORED });

    renderEntry();
    await screen.findByTestId("session");

    expect(sessionProps).toHaveBeenCalledWith(expect.objectContaining({ restored: RESTORED }));
  });

  it("복원값이 없어도 세션에 들어간다", async () => {
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: null });

    renderEntry();
    await screen.findByTestId("session");

    expect(sessionProps).toHaveBeenCalledWith(expect.objectContaining({ restored: null }));
  });
});
