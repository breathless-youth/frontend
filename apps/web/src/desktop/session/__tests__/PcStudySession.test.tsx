import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Toaster } from "@/components/ui/sonner";
import type { HomeV3ContentProps } from "@/features/home-v3/homeV3ContentTypes";
import { writeMeasureMode } from "@/features/measure-mode/measureMode";
import { createMockCameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import type { RestoredSession } from "@/features/study-session/restoreActiveSession";
import { markSessionGuideSeen, sessionGuideState } from "@/features/study-session/sessionGuide";
import { submitStudySession } from "@/features/study-session/submitStudySession";
import { writeTimerBackground } from "@/features/timer-background/timerBackground";
import { trackStudySessionEnded } from "@/lib/amplitude";
import i18n from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { visionStub } from "@/test/soloSessionMocks";
import { PROCTOR_SPACE } from "@/test/spaceFixtures";

import { PcStudySession } from "../PcStudySession";
import { readPcSessionMarker, writePcSessionMarker } from "../pcSessionMarker";
import type { PcSessionRequest } from "../usePcSession";

const gate = vi.hoisted(() => ({
  restored: null as RestoredSession | null,
  restoreFailed: false,
}));
vi.mock("@/features/study-session/useSessionGate", () => ({
  useSessionGate: () => ({
    ready: true,
    userId: 7,
    restored: gate.restored,
    initialSubjectId: undefined,
    subjectError: false,
    retrySubject: () => {},
    restoreFailed: gate.restoreFailed,
    resumeAway: false,
    askAwayMin: null,
    acceptResume: () => true,
    endResumable: async () => {},
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
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  trackStudySessionEnded: vi.fn(),
}));

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

/** 결과 화면 자리. 넘겨받은 세션 수만 보인다. */
function ResultProbe() {
  const location = useLocation();
  const state = location.state as { sessions?: unknown[] } | null;
  return <p>{`결과 ${state?.sessions?.length ?? 0}건`}</p>;
}

const watchChanges = vi.fn();

function SessionInBox({ request, onEnd }: { request: PcSessionRequest; onEnd: () => void }) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setBox} className="relative">
      <PcStudySession
        request={request}
        content={content()}
        box={box}
        pending={<p>홈 패널</p>}
        onEnd={onEnd}
        onWatchChange={watchChanges}
      />
    </div>
  );
}

function renderSession(request: PcSessionRequest = { key: 1, resume: false }) {
  const onEnd = vi.fn();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/home?userId=7"]}>
        <Routes>
          <Route path="/home" element={<SessionInBox request={request} onEnd={onEnd} />} />
          <Route path="/room/1/result" element={<ResultProbe />} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </QueryClientProvider>,
  );
  return { onEnd, ...view };
}

const RESTORED: RestoredSession = {
  startedAtMs: Date.now() - 600_000,
  reportedAtMs: Date.now() - 1_000,
  baseStudySec: 600,
  baseFocusSec: 500,
  events: [],
  source: "TIMER",
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  queryClient.clear();
  gate.restored = null;
  gate.restoreFailed = false;
  writeMeasureMode("timer");
});
afterEach(() => {
  toast.dismiss();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("PcStudySession 열기와 이어 가기", () => {
  it("진행 기록 조회가 실패하면 표시를 남긴 채 홈으로 두고, 다음에 조회되면 이어 간다", async () => {
    writePcSessionMarker(7);
    gate.restoreFailed = true;

    const first = renderSession({ key: 0, resume: true });

    await waitFor(() => expect(first.onEnd).toHaveBeenCalled());
    expect(readPcSessionMarker()).toBe(7);
    first.unmount();

    gate.restoreFailed = false;
    gate.restored = RESTORED;
    renderSession({ key: 0, resume: true });

    await waitFor(() => expect(screen.queryByText("홈 패널")).not.toBeInTheDocument());
    expect(readPcSessionMarker()).toBe(7);
  });

  it("열어 본 카메라를 넘겼는데 이어받은 세션이 자율 모드면 그 카메라를 닫고 카메라 창이 없다", async () => {
    writeMeasureMode("camera");
    markSessionGuideSeen(7);
    gate.restored = RESTORED;
    const adapter = createMockCameraAdapter();
    await adapter.start();

    renderSession({ key: 1, resume: false, camera: adapter });

    await waitFor(() => expect(adapter.isRunning).toBe(false));
    expect(
      screen.queryByRole("group", { name: i18n.t("desktop:session.camera.window") }),
    ).toBeNull();
  });

  it("세션을 열면 이 탭에 표시를 남기고 닫으면 지운다", () => {
    const { unmount } = renderSession();

    expect(readPcSessionMarker()).toBe(7);

    unmount();

    expect(readPcSessionMarker()).toBeNull();
  });

  it("이어 가려던 세션이 서버에 없으면 표시를 지우고 홈으로 둔다", async () => {
    writePcSessionMarker(7);

    const { onEnd } = renderSession({ key: 0, resume: true });

    expect(screen.getByText("홈 패널")).toBeInTheDocument();
    await waitFor(() => expect(onEnd).toHaveBeenCalled());
    expect(readPcSessionMarker()).toBeNull();
  });

  it("이어 갈 세션이 있으면 그 기록에서 다시 연다", async () => {
    gate.restored = RESTORED;

    renderSession({ key: 0, resume: true });

    await waitFor(() => expect(screen.queryByText("홈 패널")).not.toBeInTheDocument());
    expect(readPcSessionMarker()).toBe(7);
  });
});

describe("PcStudySession 공부 중 패널", () => {
  it("공부 시작 대신 일시정지·종료가 보이고 과목 메뉴에 과목 추가가 없다", async () => {
    renderSession();

    expect(screen.queryByRole("button", { name: i18n.t("home:v3.startStudy") })).toBeNull();
    expect(screen.queryByRole("button", { name: i18n.t("home:v3.mission.start") })).toBeNull();
    expect(screen.getByRole("button", { name: i18n.t("desktop:session.pause") })).toBeEnabled();
    expect(screen.getByRole("button", { name: i18n.t("desktop:session.exit") })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.subject.choose") }));

    expect(await screen.findByRole("menuitem", { name: /Math/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: i18n.t("home:v3.subject.add") })).toBeNull();
  });

  it("오늘 공부시간에 이번 세션이 1초마다 더해진다", async () => {
    vi.useFakeTimers();
    renderSession();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(
      screen.getByLabelText(i18n.t("home:v3.stats.total", { time: "4:18:35" })),
    ).toBeInTheDocument();
  });

  it("이어 가면 서버 기록의 공부시간부터 더한다", async () => {
    gate.restored = RESTORED;

    renderSession({ key: 0, resume: true });

    expect(
      await screen.findByLabelText(i18n.t("home:v3.stats.total", { time: "4:28:32" })),
    ).toBeInTheDocument();
  });

  it("일시정지를 누르면 계속하기로 바뀌고 다시 누르면 돌아온다", async () => {
    renderSession();

    await userEvent.click(screen.getByRole("button", { name: i18n.t("desktop:session.pause") }));
    // 계속하기는 회색 일시정지 버튼과 헷갈리지 않게 파란 테두리 버튼으로 바뀐다.
    expect(screen.getByRole("button", { name: i18n.t("desktop:session.resume") })).toHaveClass(
      "bg-brand-subtle",
    );
    expect(screen.getByText("86%")).toHaveClass("text-state-pause");
    await userEvent.click(screen.getByRole("button", { name: i18n.t("desktop:session.resume") }));
    expect(screen.getByRole("button", { name: i18n.t("desktop:session.pause") })).not.toHaveClass(
      "bg-brand-subtle",
    );

    expect(
      screen.getByRole("button", { name: i18n.t("desktop:session.pause") }),
    ).toBeInTheDocument();
  });

  it("종료를 누르면 확인 창이 뜨고, 계속하기는 닫기만 하고 공부 종료는 제출한다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    renderSession();
    const exit = screen.getByRole("button", { name: i18n.t("desktop:session.exit") });

    await userEvent.click(exit);
    const dialog = screen.getByRole("alertdialog", {
      name: i18n.t("study-session:exitConfirm.title"),
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: i18n.t("study-session:exitConfirm.cancel") }),
    );

    expect(submitStudySession).not.toHaveBeenCalled();
    await waitFor(() => expect(exit).toHaveFocus());

    await userEvent.click(exit);
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("study-session:exitConfirm.confirm") }),
    );

    await waitFor(() => expect(submitStudySession).toHaveBeenCalledTimes(1));
  });

  it("접으면 머리줄에 이번 세션을 더한 오늘 공부시간과 집중률이 보인다", async () => {
    renderSession();

    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("desktop:home.panel.minimize") }),
    );

    const header = within(screen.getByRole("group", { name: /방향키/ }));
    expect(header.getByText("4:18:32")).toBeInTheDocument();
    expect(header.getByText("86%")).toBeInTheDocument();
  });
});

describe("PcStudySession 카메라 창", () => {
  beforeEach(() => {
    writeMeasureMode("camera");
    markSessionGuideSeen(7);
  });

  it("카메라 창을 숨겨도 감지는 멈추지 않는다", async () => {
    const stop = vi.spyOn(visionStub, "stop");
    renderSession({ key: 1, resume: false, camera: createMockCameraAdapter() });
    stop.mockClear();

    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("desktop:session.camera.hide") }),
    );

    expect(stop).not.toHaveBeenCalled();
    expect(document.querySelector("video")).not.toBeNull();
    stop.mockRestore();
  });

  it("다른 탭으로 옮겨도 관리 모드를 멈추지 않고 진행을 keepalive로 보고한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    try {
      renderSession({ key: 1, resume: false, camera: createMockCameraAdapter() });

      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      await waitFor(() =>
        expect(
          fetchMock.mock.calls.filter(
            ([, init]) =>
              (init as RequestInit).method === "PUT" && (init as RequestInit).keepalive === true,
          ),
        ).toHaveLength(1),
      );
      expect(
        screen.getByRole("button", { name: i18n.t("desktop:session.pause") }),
      ).toBeInTheDocument();
    } finally {
      visibility.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("관리 모드면 카메라 창이 있고, 숨기면 머리줄에 카메라 보기가 생긴다", async () => {
    renderSession({ key: 1, resume: false, camera: createMockCameraAdapter() });
    const name = i18n.t("desktop:session.camera.window");

    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("desktop:session.camera.hide") }),
    );

    // 숨긴 창은 화면 낭독기에서 빠져 이름이 계산되지 않으므로 붙인 이름표로 찾는다.
    const hiddenWindow = screen.getByLabelText(name);
    expect(hiddenWindow).toHaveAttribute("inert");
    expect(hiddenWindow).toHaveAttribute("aria-hidden", "true");
    const show = screen.getByRole("button", { name: i18n.t("desktop:session.showCamera") });
    expect(show).toHaveFocus();

    await userEvent.click(show);

    expect(screen.getByRole("group", { name })).not.toHaveAttribute("inert");
    expect(screen.queryByRole("button", { name: i18n.t("desktop:session.showCamera") })).toBeNull();
  });

  it("겹치면 마지막에 만진 쪽이 위다", () => {
    renderSession({ key: 1, resume: false, camera: createMockCameraAdapter() });
    const cameraBox = screen.getByRole("group", { name: i18n.t("desktop:session.camera.window") });
    const panel = screen.getByRole("region", { name: i18n.t("desktop:home.panel.title") });

    fireEvent.pointerDown(cameraBox, { button: 0 });
    expect(Number(cameraBox.style.zIndex)).toBeGreaterThan(Number(panel.style.zIndex));

    fireEvent.pointerDown(panel, { button: 0 });
    expect(Number(panel.style.zIndex)).toBeGreaterThan(Number(cameraBox.style.zIndex));
  });

  it("자율 모드면 카메라 창이 없다", () => {
    writeMeasureMode("timer");
    renderSession();

    expect(
      screen.queryByRole("group", { name: i18n.t("desktop:session.camera.window") }),
    ).toBeNull();
    expect(screen.queryByText(i18n.t("study-session:cameraPrompt.notice"))).toBeNull();
  });
});

describe("PcStudySession 가이드", () => {
  const camera = () => ({ key: 1, resume: false, camera: createMockCameraAdapter() });
  const welcome = () => i18n.t("desktop:session.guide.welcomeTitle");

  beforeEach(() => {
    writeMeasureMode("camera");
  });

  it("처음 관리 모드면 가이드가 뜨고 보는 동안 일시정지되며 다음에 포커스가 간다", async () => {
    renderSession(camera());

    const guide = await screen.findByRole("dialog", { name: welcome() });
    expect(
      within(guide).getByRole("button", { name: i18n.t("study-session:help.next") }),
    ).toHaveFocus();
    expect(
      screen.getByRole("button", { name: i18n.t("desktop:session.resume"), hidden: true }),
    ).toBeInTheDocument();
  });

  it("끝까지 보면 재개하고 다시 뜨지 않으며 카메라 안내 문구가 상자 아래에 남는다", async () => {
    renderSession(camera());
    await screen.findByRole("dialog", { name: welcome() });

    for (let step = 0; step < 3; step += 1) {
      await userEvent.click(
        screen.getByRole("button", { name: i18n.t("study-session:help.next") }),
      );
    }
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("desktop:session.guide.continue") }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: i18n.t("desktop:session.pause") }),
    ).toBeInTheDocument();
    expect(screen.getByText(i18n.t("study-session:cameraPrompt.notice"))).toBeInTheDocument();
    expect(sessionGuideState(7)).toBe("seen");
  });

  it("Esc나 나중에 하기로 닫아도 다시 뜨지 않는다", async () => {
    renderSession(camera());
    await screen.findByRole("dialog", { name: welcome() });

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sessionGuideState(7)).toBe("seen");
  });

  it("본 계정은 가이드 없이 시작하고, ?를 누르면 다시 열리며 닫으면 ?로 포커스가 돌아온다", async () => {
    markSessionGuideSeen(7);
    renderSession(camera());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const help = screen.getByRole("button", { name: i18n.t("desktop:session.help") });

    await userEvent.click(help);
    await screen.findByRole("dialog", { name: welcome() });
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("study-session:help.finishLater") }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(help).toHaveFocus());
  });

  it("이미 일시정지한 채 ?로 열었다 닫으면 일시정지를 풀지 않는다", async () => {
    markSessionGuideSeen(7);
    renderSession(camera());

    await userEvent.click(screen.getByRole("button", { name: i18n.t("desktop:session.pause") }));
    await userEvent.click(screen.getByRole("button", { name: i18n.t("desktop:session.help") }));
    await userEvent.keyboard("{Escape}");

    expect(
      screen.getByRole("button", { name: i18n.t("desktop:session.resume") }),
    ).toBeInTheDocument();
  });

  it("자율 모드에는 ?가 없고 가이드도 뜨지 않는다", () => {
    writeMeasureMode("timer");
    renderSession();

    expect(screen.queryByRole("button", { name: i18n.t("desktop:session.help") })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("PcStudySession 종료", () => {
  const SESSION = {
    id: 1,
    userId: 7,
    statDate: "2026-11-20",
    startedAt: "2026-11-20T01:00:00Z",
    endedAt: "2026-11-20T01:00:03Z",
    studySec: 3,
    focusSec: 3,
    focusRate: 100,
    events: [],
  };

  it("저장이 끝나면 지금 결과 화면으로 결과를 넘겨 간다", async () => {
    vi.useFakeTimers();
    vi.mocked(submitStudySession).mockResolvedValue([SESSION]);
    renderSession();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    fireEvent.click(screen.getByRole("button", { name: i18n.t("desktop:session.exit") }));
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("study-session:exitConfirm.confirm") }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText("결과 1건")).toBeInTheDocument();
    expect(readPcSessionMarker()).toBeNull();
  });

  it("서버 공간을 고른 채 끝내면 종료 이벤트에 상품 코드와 영상 방식을 싣는다", async () => {
    writeTimerBackground(PROCTOR_SPACE);
    vi.mocked(submitStudySession).mockResolvedValue([]);
    renderSession();

    await userEvent.click(screen.getByRole("button", { name: i18n.t("desktop:session.exit") }));
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("study-session:exitConfirm.confirm") }),
    );

    await waitFor(() => expect(trackStudySessionEnded).toHaveBeenCalledOnce());
    expect(vi.mocked(trackStudySessionEnded).mock.calls[0]?.[0].display).toMatchObject({
      spaceKind: "space",
      spaceItem: { itemCode: "SPACE_PROCTOR", videoMode: "WATCH" },
    });
  });

  it("감시 상태는 바뀔 때마다 알리고 닫을 때만 null을 보낸다", async () => {
    // 앞 테스트의 세션이 정리되며 보낸 null을 세지 않는다.
    watchChanges.mockClear();
    vi.mocked(submitStudySession).mockReturnValue(new Promise(() => {}));
    const { unmount } = renderSession();
    await waitFor(() =>
      expect(watchChanges).toHaveBeenLastCalledWith({ trigger: null, studying: true }),
    );

    await userEvent.click(screen.getByRole("button", { name: i18n.t("desktop:session.exit") }));
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("study-session:exitConfirm.confirm") }),
    );
    await waitFor(() =>
      expect(watchChanges).toHaveBeenLastCalledWith({ trigger: null, studying: false }),
    );
    expect(watchChanges).not.toHaveBeenCalledWith(null);

    unmount();
    expect(watchChanges).toHaveBeenLastCalledWith(null);
  });

  it("순공이 기준보다 짧으면 상자 안 창으로 알리고 홈으로를 누르면 홈 상태로 돌아온다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    const { onEnd } = renderSession();

    await userEvent.click(screen.getByRole("button", { name: i18n.t("desktop:session.exit") }));
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("study-session:exitConfirm.confirm") }),
    );

    const dialog = await screen.findByRole("alertdialog", {
      name: i18n.t("study-session:noFocusEnd.title"),
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: i18n.t("study-session:noFocusEnd.cta") }),
    );

    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("제출이 실패하면 표시를 남긴 채 상자 안 창에 다시 시도를 보이고 누르면 다시 보낸다", async () => {
    vi.mocked(submitStudySession)
      .mockRejectedValueOnce(new Error("일시적 오류"))
      .mockResolvedValue([]);
    renderSession();

    await userEvent.click(screen.getByRole("button", { name: i18n.t("desktop:session.exit") }));
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("study-session:exitConfirm.confirm") }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(readPcSessionMarker()).toBe(7);
    await userEvent.click(
      within(dialog).getByRole("button", { name: i18n.t("common:actions.retry") }),
    );

    await waitFor(() => expect(submitStudySession).toHaveBeenCalledTimes(2));
  });
});
