import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as tokenSourceModule from "@/lib/auth/tokenSource";
import type { AuthSnapshot, TokenSource } from "@/lib/auth/tokenSource";

import { RoomPage } from "../RoomPage";

/**
 * 세션 화면은 `key={userId}`로 묶여 있다. 신원이 브리지 왕복 뒤에 오는데 그 전에 띄우면
 * key가 null에서 실제 id로 바뀌며 통째로 다시 마운트된다 — 마운트 1회 계측이 두 번 나가고
 * (`study_session_started`, Meta 광고 전환) 세션 타이머도 처음부터 다시 선다.
 */

const mocks = vi.hoisted(() => ({ source: null as TokenSource | null }));
vi.mock("@/lib/auth/tokenSource", async (importOriginal) => ({
  ...(await importOriginal<typeof tokenSourceModule>()),
  getTokenSource: () => mocks.source,
}));

const useActiveSessionRestore = vi.hoisted(() => vi.fn());
const useStudyRoomSession = vi.hoisted(() => vi.fn());
vi.mock("@/features/study-session/useActiveSessionRestore", () => ({ useActiveSessionRestore }));
vi.mock("@/features/study-session/useStudyRoomSession", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useStudyRoomSession };
});

/** 아직 `auth-token`이 오지 않은 출처 — `arrive`로 도착을 흉내낸다. */
function pendingSource(): { source: TokenSource; arrive: (userId: number) => void } {
  let snapshot: AuthSnapshot | null = null;
  const listeners = new Set<(snapshot: AuthSnapshot) => void>();
  return {
    source: {
      getAccessToken: vi.fn(),
      getCurrentToken: vi.fn(),
      refresh: vi.fn(),
      getUserId: () => snapshot?.userId ?? null,
      hasSettled: () => snapshot !== null,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    arrive: (userId) => {
      snapshot = { userId, accessToken: "t" };
      for (const listener of listeners) listener(snapshot);
    },
  };
}

function renderRoom() {
  return render(
    <MemoryRouter initialEntries={["/room/1"]}>
      <RoomPage />
    </MemoryRouter>,
  );
}

describe("RoomPage 신원 게이트", () => {
  beforeEach(() => {
    useActiveSessionRestore.mockReset();
    useStudyRoomSession.mockReset();
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: null });
    useStudyRoomSession.mockReturnValue({
      focusSec: 0,
      studySec: 0,
      sessionState: { kind: "FOCUS" },
      phase: { name: "studying" },
      endReason: null,
      cameraStream: null,
      cameraFacing: "user",
      isCameraRunning: false,
      subjectSelection: null,
      subjectSegments: [],
      sessionEvents: [],
      selectSubject: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      flipCamera: vi.fn(),
      endAndSubmit: vi.fn(),
    });
  });
  afterEach(() => {
    mocks.source = null;
    vi.restoreAllMocks();
  });

  it("신원이 오기 전에는 세션을 시작하지 않는다 — 여기서 띄우면 도착 시 다시 마운트된다", () => {
    mocks.source = pendingSource().source;

    renderRoom();

    expect(useStudyRoomSession).not.toHaveBeenCalled();
    expect(screen.getByTestId("room-restore-gate")).toBeInTheDocument();
  });

  it("신원이 도착한 뒤에 한 번만 시작한다", () => {
    const { source, arrive } = pendingSource();
    mocks.source = source;

    renderRoom();
    act(() => {
      arrive(7);
    });

    expect(screen.queryByTestId("room-restore-gate")).not.toBeInTheDocument();
    // 마운트가 한 번뿐이라 훅이 받은 userId도 처음부터 실제 값이다 — null 마운트가 없었다는 뜻.
    expect(useStudyRoomSession.mock.calls.every(([userId]) => userId === 7)).toBe(true);
  });

  it("브라우저 단독 모드는 기다리지 않는다 — 출처가 없으면 신원도 기다릴 것이 없다", () => {
    mocks.source = null;

    renderRoom();

    expect(useStudyRoomSession).toHaveBeenCalled();
  });
});
