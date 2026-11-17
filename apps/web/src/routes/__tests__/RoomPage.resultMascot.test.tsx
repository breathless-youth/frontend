import type { ProfileResponse, StudySessionResponse } from "@focusmakers/types";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MASCOT_EXPRESSION_SRC } from "@/components/mascot/mascotExpressions";
import { __resetAppPointsGatewayForTests } from "@/features/points/gateway/appPointsGateway";
import { __resetMascotLookImagesForTests } from "@/features/points/model/mascotLookImages";
import { submitStudySession } from "@/features/study-session/submitStudySession";
import { getDecorations } from "@/lib/pointsApi";
import { getProfile } from "@/lib/profileApi";
import { __resetPointsForTests } from "@/lib/pointsCapability";
import { queryClient } from "@/lib/queryClient";
import { answerCameraPrompt } from "@/test/cameraPrompt";
import { recordResultMascot } from "@/test/resultMascotRecorder";

import { ResultPage } from "../ResultPage";
import { RoomPage } from "../RoomPage";

/**
 * 싱글룸 세션을 끝내고 결과 화면으로 가는 사용자 경로
 *
 * 세션 화면과 결과 화면은 앱 안에서 같은 웹뷰 문서이고 같은 조회 캐시(`lib/queryClient`)를 쓴다.
 * 그래서 두 라우트를 한 라우터와 그 캐시에 올려 실제 결과 화면까지 이어 본다.
 */

vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: () => ({ settled: true, restored: null }),
}));
vi.mock("@/features/study-session/submitStudySession", () => ({ submitStudySession: vi.fn() }));
vi.mock("@/lib/subjectApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listSubjects: vi.fn(async () => []),
}));
vi.mock("@/routes/lazyRoutes", () => ({ prefetchResultPage: vi.fn() }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
// 세션 화면이 한가할 때 미리 받는 일을 기다리지 않고 바로 돌린다.
vi.mock("@/lib/whenIdle", () => ({ whenIdle: (task: () => void) => task() }));
vi.mock("@/lib/pointsApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDecorations: vi.fn(),
}));
vi.mock("@/lib/profileApi", () => ({ getProfile: vi.fn() }));
// 결과 화면의 카드들은 연출이 끝난 뒤에 떠서 이 경로의 관심사가 아니다.
vi.mock("@/lib/statsApi", () => ({
  listStudySessionStats: () => new Promise(() => undefined),
  getStudyDays: () => new Promise(() => undefined),
}));
vi.mock("@/lib/interviewApi", () => ({ getInterviewStatus: () => new Promise(() => undefined) }));
vi.mock("@/features/timelapse/ResultTimelapseCard", () => ({ ResultTimelapseCard: () => null }));

const BERET = "https://web.focusmakers.app/avatars/shop/pencil/head/beret.png";

const PENCIL_WITH_BERET = {
  selectedMascotCode: "PENCIL",
  accessories: [
    {
      mascotCode: "PENCIL",
      slot: "HEAD",
      item: { itemId: 31, code: "PENCIL_BERET", imageUrl: BERET },
    },
  ],
  timerBackground: null,
};

const MEMBER: ProfileResponse = {
  nickname: "몽당이주인",
  goal: null,
  category: null,
  initial: "몽",
  colorIndex: 0,
  loginProvider: "KAKAO",
};

const SESSION: StudySessionResponse = {
  id: 10,
  userId: 7,
  statDate: "2026-11-17",
  startedAt: "2026-11-17T01:00:00Z",
  endedAt: "2026-11-17T02:00:00Z",
  studySec: 3600,
  focusSec: 3600,
  focusRate: 100,
  events: [],
};

function setPointsFlag(on: boolean) {
  window.history.replaceState(null, "", on ? "/?points=1" : "/");
  __resetPointsForTests();
  __resetAppPointsGatewayForTests();
}

function renderRoomThenResult() {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/room/7?userId=7"]}>
        <Routes>
          <Route path="/room/:id" element={<RoomPage />} />
          <Route path="/room/:id/result" element={<ResultPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  answerCameraPrompt("camera");
}

/**
 * 하단 종료 버튼과 확인 창으로 순공 1분을 채운 세션을 끝낸다.
 *
 * `beforeConfirm`은 종료 버튼을 누르고 확인 창의 확정을 누르기 전에 부른다.
 */
async function endSessionAfterOneMinute(beforeConfirm?: () => void) {
  vi.useFakeTimers();
  try {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    fireEvent.click(screen.getByRole("button", { name: "공부 종료" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    beforeConfirm?.();
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "공부 종료" }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  } finally {
    vi.useRealTimers();
  }
}

const APP_QUERY_DEFAULTS = queryClient.getDefaultOptions();

/** 디코드한 그림과 HTTP 캐시만 데운 그림의 주소 */
const images = { decoded: [] as string[], warmed: [] as string[] };

beforeEach(() => {
  setPointsFlag(true);
  // 앱 캐시는 실패한 조회를 1초 뒤 한 번 더 받는다. 어느 누름이 다시 받았는지 보려고 여기서는 끈다.
  queryClient.setDefaultOptions({
    ...APP_QUERY_DEFAULTS,
    queries: { ...APP_QUERY_DEFAULTS.queries, retry: false },
  });
  queryClient.clear();
  localStorage.clear();
  __resetMascotLookImagesForTests();
  // jsdom은 그림을 받지 않아서 디코드가 바로 끝나는 것으로 보고 어느 그림을 디코드했는지만 남긴다.
  images.decoded = [];
  images.warmed = [];
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value(this: HTMLImageElement) {
      images.decoded.push(this.src);
      return Promise.resolve();
    },
  });
  // 그림 파일만 받아 HTTP 캐시를 데우는 요청은 남기고 바로 끝낸다. 그 밖의 요청은 그대로 둔다.
  const realFetch = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.cache === "force-cache") {
        images.warmed.push(String(input));
        return Promise.resolve({ arrayBuffer: async () => new ArrayBuffer(0) });
      }
      return realFetch(input, init);
    }),
  );
  vi.mocked(getProfile).mockResolvedValue(MEMBER);
  vi.mocked(getDecorations).mockResolvedValue(PENCIL_WITH_BERET);
  vi.mocked(submitStudySession).mockResolvedValue([SESSION]);
});

afterEach(() => {
  setPointsFlag(false);
  queryClient.setDefaultOptions(APP_QUERY_DEFAULTS);
  queryClient.clear();
  localStorage.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
});

describe("싱글룸 세션 → 결과 화면 마스코트", () => {
  it("몽당이와 소품을 고른 회원이 세션을 끝내고 결과 화면으로 가면 첫 그림부터 소품을 낀 몽당이고 타이미는 한 번도 그리지 않는다", async () => {
    const recorder = recordResultMascot();
    renderRoomThenResult();

    await endSessionAfterOneMinute();

    expect(await screen.findByText("오늘 공부 완료")).toBeInTheDocument();
    await waitFor(() => expect(recorder.first()).not.toBeNull());
    expect(recorder.first()).toEqual({
      faces: expect.arrayContaining([MASCOT_EXPRESSION_SRC.pencil.idle]),
      accessories: [BERET],
    });
    for (const timi of Object.values(MASCOT_EXPRESSION_SRC.stopwatch)) {
      expect(recorder.everSeen()).not.toContain(timi);
    }
  });

  it("세션을 열 때는 소품 그림을 디코드하지 않고 HTTP 캐시만 데우고, 종료 버튼을 누를 때 디코드한다", async () => {
    renderRoomThenResult();
    await waitFor(() => expect(images.warmed).toContain(BERET));
    await act(async () => {});
    expect(images.decoded).toEqual([]);

    await endSessionAfterOneMinute(() => {
      // 확인 창의 확정을 누르기 전, 종료 버튼만 누른 때다.
      expect(images.decoded).toContain(BERET);
      expect(images.decoded).toContain(
        new URL(MASCOT_EXPRESSION_SRC.pencil.idle, window.location.href).href,
      );
    });

    expect(await screen.findByText("오늘 공부 완료")).toBeInTheDocument();
    expect(document.querySelector("[data-result-mascot]")).not.toBeNull();
  });

  it("세션 화면이 열릴 때 받아 두어 결과 화면에서 서버 답이 늦어도 기다리지 않고 몽당이로 뛴다", async () => {
    // 세션 중 첫 조회만 답하고 그 뒤 조회(종료 버튼, 결과 화면)는 답하지 않는다.
    vi.mocked(getDecorations)
      .mockResolvedValueOnce(PENCIL_WITH_BERET)
      .mockReturnValue(new Promise(() => undefined));
    const recorder = recordResultMascot();
    renderRoomThenResult();
    await waitFor(() => expect(getDecorations).toHaveBeenCalledOnce());

    await endSessionAfterOneMinute();

    expect(await screen.findByText("오늘 공부 완료")).toBeInTheDocument();
    expect(document.querySelector("[data-result-mascot]")).not.toBeNull();
    expect(recorder.first()?.accessories).toEqual([BERET]);
    expect(recorder.everSeen()).not.toContain(MASCOT_EXPRESSION_SRC.stopwatch.idle);
  });

  it("세션을 열 때 받지 못했어도 종료 버튼을 누를 때 다시 받아 결과 화면이 몽당이로 시작한다", async () => {
    vi.mocked(getDecorations)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(PENCIL_WITH_BERET)
      .mockReturnValue(new Promise(() => undefined));
    const recorder = recordResultMascot();
    renderRoomThenResult();
    await waitFor(() => expect(getDecorations).toHaveBeenCalledOnce());

    await endSessionAfterOneMinute(() => expect(getDecorations).toHaveBeenCalledTimes(2));

    expect(await screen.findByText("오늘 공부 완료")).toBeInTheDocument();
    expect(document.querySelector("[data-result-mascot]")).not.toBeNull();
    expect(recorder.first()?.faces).toContain(MASCOT_EXPRESSION_SRC.pencil.idle);
    expect(recorder.everSeen()).not.toContain(MASCOT_EXPRESSION_SRC.stopwatch.idle);
  });

  it("회원으로 확인되지 않으면 세션 중에 모습을 받지 않는다", async () => {
    vi.mocked(getProfile).mockResolvedValue({ ...MEMBER, loginProvider: undefined });
    renderRoomThenResult();
    await waitFor(() => expect(getProfile).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "공부 종료" }));
    await act(async () => {});

    expect(getDecorations).not.toHaveBeenCalled();
  });

  it("포인트가 꺼진 앱은 세션 중에 프로필도 모습도 받지 않는다", async () => {
    setPointsFlag(false);
    renderRoomThenResult();

    fireEvent.click(screen.getByRole("button", { name: "공부 종료" }));
    await act(async () => {});

    expect(getProfile).not.toHaveBeenCalled();
    expect(getDecorations).not.toHaveBeenCalled();
  });
});
