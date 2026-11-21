import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HomeV3ContentProps } from "@/features/home-v3/homeV3ContentTypes";
import type { RestoredSession } from "@/features/study-session/restoreActiveSession";
import { AWAY_LIMIT_MS } from "@/features/study-session/sessionTuning";
import type * as StudyRoomSession from "@/features/study-session/useStudyRoomSession";
import { queryClient } from "@/lib/queryClient";
import { statsKeys } from "@/lib/statsQueries";

import { PcStudySession } from "../PcStudySession";
import { readPcSessionMarker, writePcSessionMarker } from "../pcSessionMarker";

const useActiveSessionRestore = vi.hoisted(() => vi.fn());
const closeStaleSession = vi.hoisted(() => vi.fn(async () => null));
const sessionHook = vi.hoisted(() => ({ spy: vi.fn() }));

vi.mock("@/features/study-session/useActiveSessionRestore", () => ({ useActiveSessionRestore }));
vi.mock("@/features/study-session/closeStaleSession", () => ({ closeStaleSession }));
// 세션 훅은 그대로 돌리고 받은 옵션만 본다.
vi.mock("@/features/study-session/useStudyRoomSession", async (importOriginal) => {
  const actual = await importOriginal<typeof StudyRoomSession>();
  return {
    ...actual,
    useStudyRoomSession: (...args: Parameters<typeof actual.useStudyRoomSession>) => {
      sessionHook.spy(...args);
      return actual.useStudyRoomSession(...args);
    },
  };
});
vi.mock("@/features/study-session/useVisionReadyTracking", async () => {
  const { visionStub } = await import("@/test/soloSessionMocks");
  return { useTrackedVisionDetector: () => ({ visionDetector: visionStub, visionReady: null }) };
});
vi.mock("@/features/timelapse/timelapseRecorder", async () => {
  const { recorderStub } = await import("@/test/soloSessionMocks");
  return { createTimelapseRecorder: () => recorderStub };
});

function content(): HomeV3ContentProps {
  return {
    band: { status: "success", value: { kind: "mission", step: 2, ready: false, progress: 0 } },
    stats: { status: "success", value: { studySeconds: 0, focusSeconds: 0, focusRate: 0 } },
    subjects: { status: "success", value: [] },
    selectedSubjectId: null,
    appLockLabel: "",
    actions: {
      selectSubject: vi.fn(),
      startStudy: vi.fn(),
      openPlanner: vi.fn(),
      completeMission: vi.fn(),
      editGoal: vi.fn(),
      openTimelapses: vi.fn(),
      openTimelapseSettings: vi.fn(),
      openAppLock: vi.fn(),
      openContact: vi.fn(),
    },
  };
}

function SessionInBox({ onEnd }: { onEnd: () => void }) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setBox} data-testid="home-box">
      <PcStudySession
        request={{ key: 0, resume: true }}
        content={content()}
        box={box}
        pending={<p>홈 패널</p>}
        onEnd={onEnd}
      />
    </div>
  );
}

function renderSession() {
  const onEnd = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/home?userId=7"]}>
        <SessionInBox onEnd={onEnd} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onEnd };
}

const NOW = Date.UTC(2026, 10, 21, 1, 0, 0);
const TIMER_RESTORED: RestoredSession = {
  startedAtMs: NOW - 60 * 60_000,
  reportedAtMs: NOW - 32 * 60_000,
  baseStudySec: 1_680,
  baseFocusSec: 1_680,
  events: [],
  source: "TIMER",
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  sessionStorage.clear();
  queryClient.clear();
  writePcSessionMarker(7);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve([]) }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("PcStudySession 자율 모드 이어 공부", () => {
  beforeEach(() => {
    useActiveSessionRestore.mockReturnValue({
      settled: true,
      restored: TIMER_RESTORED,
      resume: { kind: "ask", awayMin: 32 },
    });
  });

  it("물을 기록이면 세션을 열지 않고 홈 상자 안에 확인 창을 띄운다", () => {
    renderSession();

    const dialog = screen.getByRole("dialog", { name: "공부를 이어 갈까요?" });
    expect(screen.getByTestId("home-box")).toContainElement(dialog);
    expect(screen.getByText("홈 패널")).toBeInTheDocument();
    expect(sessionHook.spy).not.toHaveBeenCalled();
  });

  it("이어서 공부하기를 고르면 앱 밖 시간을 공부로 이어받는 세션을 연다", async () => {
    renderSession();

    await userEvent.click(screen.getByRole("button", { name: "이어서 공부하기" }));

    await waitFor(() => expect(screen.queryByText("홈 패널")).not.toBeInTheDocument());
    expect(sessionHook.spy).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ restored: TIMER_RESTORED, resumeAway: true }),
    );
  });

  it("끝내기를 고르면 기록을 확정하고 표시를 지운 뒤 오늘 통계를 다시 받고 경로를 바꾸지 않고 홈 상태로 돌아온다", async () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { onEnd } = renderSession();

    await userEvent.click(screen.getByRole("button", { name: "나간 시점에서 끝내기" }));

    await waitFor(() => expect(onEnd).toHaveBeenCalled());
    expect(closeStaleSession).toHaveBeenCalledWith(7);
    expect(readPcSessionMarker()).toBeNull();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: statsKeys.all });
    expect(sessionHook.spy).not.toHaveBeenCalled();
  });

  it("창을 연 채 2시간이 지나 이어서 공부하기를 고르면 세션을 열지 않고 확정한 뒤 홈 상태로 돌아온다", async () => {
    const { onEnd } = renderSession();
    vi.setSystemTime(TIMER_RESTORED.reportedAtMs + AWAY_LIMIT_MS + 60_000);

    await userEvent.click(screen.getByRole("button", { name: "이어서 공부하기" }));

    await waitFor(() => expect(onEnd).toHaveBeenCalled());
    expect(closeStaleSession).toHaveBeenCalledWith(7);
    expect(sessionHook.spy).not.toHaveBeenCalled();
  });
});

it("이미 이어서 공부하기를 고른 기록은 묻지 않고 공부로 이어받는다", async () => {
  useActiveSessionRestore.mockReturnValue({
    settled: true,
    restored: TIMER_RESTORED,
    resume: { kind: "confirmed" },
  });

  renderSession();

  expect(screen.queryByRole("dialog", { name: "공부를 이어 갈까요?" })).toBeNull();
  await waitFor(() =>
    expect(sessionHook.spy).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ restored: TIMER_RESTORED, resumeAway: true }),
    ),
  );
});
