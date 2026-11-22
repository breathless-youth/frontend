import type { StudySessionResponse } from "@focusmakers/types";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Toaster } from "@/components/ui/sonner";
import type { HomeV3ContentProps } from "@/features/home-v3/homeV3ContentTypes";
import { writeMeasureMode } from "@/features/measure-mode/measureMode";
import { createMockCameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import type { RestoredSession } from "@/features/study-session/restoreActiveSession";
import { markSessionGuideSeen } from "@/features/study-session/sessionGuide";
import type * as SessionTuningModule from "@/features/study-session/sessionTuning";
import { submitStudySession } from "@/features/study-session/submitStudySession";
import i18n from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";

import { PcStudySession } from "../PcStudySession";
import type { PcSessionRequest } from "../usePcSession";

const gate = vi.hoisted(() => ({ restored: null as RestoredSession | null }));
vi.mock("@/features/study-session/useSessionGate", () => ({
  useSessionGate: () => ({
    ready: true,
    userId: 7,
    restored: gate.restored,
    initialSubjectId: undefined,
    subjectError: false,
    retrySubject: () => {},
    resumeAway: false,
    askAwayMin: null,
  }),
}));
vi.mock("@/features/study-session/useVisionReadyTracking", async () => {
  const { visionStub } = await import("@/test/soloSessionMocks");
  return { useTrackedVisionDetector: () => ({ visionDetector: visionStub, visionReady: null }) };
});
vi.mock("@/features/timelapse/timelapseRecorder", async () => {
  const { recorderStub } = await import("@/test/soloSessionMocks");
  return { createTimelapseRecorder: () => recorderStub };
});
vi.mock("@/features/study-session/submitStudySession", () => ({ submitStudySession: vi.fn() }));

function content(): HomeV3ContentProps {
  return {
    band: { status: "success", value: { kind: "mission", step: 2, ready: false, progress: 0 } },
    stats: {
      status: "success",
      value: { studySeconds: 15512, focusSeconds: 13337, focusRate: 86 },
    },
    subjects: { status: "success", value: [{ id: 1, name: "Math", colorIndex: 0 }] },
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

function SessionInBox({
  request,
  onEnd,
  onResult,
}: {
  request: PcSessionRequest;
  onEnd: () => void;
  onResult: (sessions: StudySessionResponse[], startedAtMs: number) => void;
}) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setBox} className="relative">
      <PcStudySession
        request={request}
        content={content()}
        box={box}
        pending={<p>홈 패널</p>}
        onEnd={onEnd}
        onResult={onResult}
        onWatchChange={() => {}}
      />
    </div>
  );
}

function renderSession(request: PcSessionRequest = { key: 1, resume: false }) {
  const onEnd = vi.fn();
  const onResult = vi.fn();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/home?userId=7"]}>
        <Routes>
          <Route
            path="/home"
            element={<SessionInBox request={request} onEnd={onEnd} onResult={onResult} />}
          />
          <Route path="*" element={<p>다른 화면</p>} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </QueryClientProvider>,
  );
  return { onEnd, onResult, ...view };
}

/** 0.05분 = 3초. 테스트 전용 값이다. */
vi.mock("@/features/study-session/sessionTuning", async (importOriginal) => {
  const actual = await importOriginal<typeof SessionTuningModule>();
  return { ...actual, DEFAULT_SESSION_TUNING: { autoEndPauseMinutes: 0.05 } };
});

describe("PcStudySession 자동 종료", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    writeMeasureMode("timer");
    vi.useFakeTimers();
    vi.mocked(submitStudySession).mockResolvedValue([
      {
        id: 1,
        userId: 7,
        statDate: "2026-11-20",
        startedAt: "2026-11-20T01:00:00Z",
        endedAt: "2026-11-20T01:00:06Z",
        studySec: 2,
        focusSec: 2,
        focusRate: 100,
        events: [],
      },
    ]);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("오래 멈추면 저장하고 상자 안 창으로 알린 뒤 결과 보기로 결과를 홈으로 올린다", async () => {
    const startedAtMs = new Date(2026, 10, 22, 21, 3).getTime();
    vi.setSystemTime(startedAtMs);
    const { onResult } = renderSession();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    fireEvent.click(screen.getByRole("button", { name: i18n.t("desktop:session.pause") }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });

    const dialog = screen.getByRole("alertdialog", { name: i18n.t("study-session:autoEnd.title") });
    fireEvent.click(
      within(dialog).getByRole("button", { name: i18n.t("study-session:autoEnd.cta") }),
    );

    expect(onResult).toHaveBeenCalledExactlyOnceWith(
      [expect.objectContaining({ id: 1 })],
      startedAtMs,
    );
    expect(screen.queryByText("다른 화면")).toBeNull();
  });

  it("도움말 가이드를 연 채 오래 두면 자동 종료되고 가이드 대신 종료 안내가 남는다", async () => {
    writeMeasureMode("camera");
    markSessionGuideSeen(7);
    renderSession({ key: 1, resume: false, camera: createMockCameraAdapter() });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    fireEvent.click(screen.getByRole("button", { name: i18n.t("desktop:session.help") }));
    expect(
      screen.getByRole("dialog", { name: i18n.t("desktop:session.guide.welcomeTitle") }),
    ).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });

    expect(
      screen.getByRole("alertdialog", { name: i18n.t("study-session:autoEnd.title") }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: i18n.t("desktop:session.guide.welcomeTitle") }),
    ).toBeNull();
  });
});
