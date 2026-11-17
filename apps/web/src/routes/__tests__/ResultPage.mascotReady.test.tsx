import type { StudySessionResponse } from "@focusmakers/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MASCOT_EXPRESSION_SRC } from "@/components/mascot/mascotExpressions";
import type { MascotLook } from "@/components/mascot/types";
import { __resetAppPointsGatewayForTests } from "@/features/points/gateway/appPointsGateway";
import { __resetMascotLookImagesForTests } from "@/features/points/model/mascotLookImages";
import { rememberMascotLook } from "@/features/points/model/storedMascotLook";
import { MASCOT_LOOK_WAIT_MS } from "@/features/points/model/useReadyMascotLook";
import { getDecorations } from "@/lib/pointsApi";
import { __resetPointsForTests } from "@/lib/pointsCapability";
import { pointsKeys } from "@/lib/pointsQueries";
import { recordResultMascot } from "@/test/resultMascotRecorder";

import { RESULT_REVEAL_DELAY_MS, ResultPage } from "../ResultPage";

vi.mock("@/lib/pointsApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDecorations: vi.fn(),
}));
// 공개 뒤의 카드들은 이 파일의 관심사가 아니다.
vi.mock("@/lib/profileApi", () => ({ getProfile: () => new Promise(() => undefined) }));
vi.mock("@/lib/statsApi", () => ({
  listStudySessionStats: () => new Promise(() => undefined),
  getStudyDays: () => new Promise(() => undefined),
}));
vi.mock("@/lib/interviewApi", () => ({ getInterviewStatus: () => new Promise(() => undefined) }));
vi.mock("@/features/timelapse/ResultTimelapseCard", () => ({ ResultTimelapseCard: () => null }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));

const BERET = "https://web.focusmakers.app/avatars/shop/pencil/head/beret.png";
const PENCIL: MascotLook = { id: "pencil", accessories: [{ slot: "head", imageUrl: BERET }] };
const TIMI_FACES = Object.values(MASCOT_EXPRESSION_SRC.stopwatch);

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

/** 그림 디코드를 테스트가 끝내는 대역. 기본은 바로 끝난다. */
function stubDecode(mode: "now" | "held" = "now") {
  const releases: (() => void)[] = [];
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: () =>
      mode === "now" ? Promise.resolve() : new Promise<void>((resolve) => releases.push(resolve)),
  });
  return { release: () => releases.splice(0).forEach((resolve) => resolve()) };
}

/** 새 웹뷰처럼 빈 캐시로 결과 화면을 연다. `seed`는 세션이 미리 받아 둔 캐시다. */
function renderResult(seed?: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed?.(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[
          { pathname: "/room/7/result", search: "?userId=7", state: { sessions: [SESSION] } },
        ]}
      >
        <Routes>
          <Route path="/room/:id/result" element={<ResultPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const mascot = () => document.querySelector("[data-result-mascot]");

function reduceMotion() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

beforeEach(() => {
  setPointsFlag(true);
  localStorage.clear();
  __resetMascotLookImagesForTests();
  vi.mocked(getDecorations).mockReturnValue(new Promise(() => undefined));
});

afterEach(() => {
  vi.useRealTimers();
  setPointsFlag(false);
  localStorage.clear();
  vi.clearAllMocks();
  delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("결과 화면 마스코트 준비", () => {
  it("새 웹뷰라도 기기에 남긴 모습이 있으면 서버 답을 기다리지 않고 첫 그림부터 소품을 낀 몽당이다", async () => {
    stubDecode();
    rememberMascotLook(7, PENCIL);
    const recorder = recordResultMascot();

    renderResult();

    expect(await screen.findByText("오늘 공부 완료")).toBeInTheDocument();
    expect(recorder.first()).toEqual({
      faces: expect.arrayContaining([MASCOT_EXPRESSION_SRC.pencil.idle]),
      accessories: [BERET],
    });
    for (const timi of TIMI_FACES) expect(recorder.everSeen()).not.toContain(timi);
    // 남긴 값은 언제 받았는지 모르는 값이라 서버에서 다시 받는다.
    expect(getDecorations).toHaveBeenCalledOnce();
  });

  it("세션이 미리 받아 두고 그림까지 디코드했으면 첫 렌더부터 마스코트가 뛴다", async () => {
    stubDecode();
    const { preloadImages, mascotLookImageUrls } =
      await import("@/features/points/model/mascotLookImages");
    await preloadImages(mascotLookImageUrls(PENCIL));

    renderResult((client) => client.setQueryData(pointsKeys.look(7), PENCIL));

    expect(mascot()).not.toBeNull();
    expect(mascot()?.className).toContain("result-mascot-jump");
    expect(mascot()?.querySelector("[data-slot='accessory-head']")).toHaveAttribute("src", BERET);
  });

  it("다른 사용자가 남긴 모습은 그리지 않고, 기다림이 끝나면 기본 마스코트로 시작한다", async () => {
    stubDecode();
    rememberMascotLook(8, PENCIL);
    vi.useFakeTimers();
    const recorder = recordResultMascot();

    renderResult();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MASCOT_LOOK_WAIT_MS - 1);
    });
    expect(mascot()).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(mascot()).not.toBeNull();
    expect(recorder.everSeen()).toContain(MASCOT_EXPRESSION_SRC.stopwatch.idle);
    expect(recorder.everSeen()).not.toContain(MASCOT_EXPRESSION_SRC.pencil.idle);
  });

  it("포인트가 꺼진 예전 앱은 남긴 값도 읽지 않고 첫 렌더부터 타이미가 뛴다", () => {
    setPointsFlag(false);
    rememberMascotLook(7, PENCIL);
    const getItem = vi.spyOn(Storage.prototype, "getItem");

    renderResult();

    expect(mascot()).not.toBeNull();
    expect(mascot()?.className).toContain("result-mascot-jump");
    expect(mascot()?.querySelector("[data-slot='mascot-body'] img")).toHaveAttribute(
      "src",
      MASCOT_EXPRESSION_SRC.stopwatch.idle,
    );
    expect(getDecorations).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalledWith("focusmakers:my-mascot-look.v1");
    getItem.mockRestore();
  });

  it("모습을 받지 못하면 기다림이 끝나기 전에 실패한 때 기본 마스코트로 시작한다", async () => {
    stubDecode();
    vi.mocked(getDecorations).mockRejectedValue(new Error("offline"));
    vi.useFakeTimers();

    renderResult();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(mascot()?.querySelector("[data-slot='mascot-body'] img")).toHaveAttribute(
      "src",
      MASCOT_EXPRESSION_SRC.stopwatch.idle,
    );
  });

  it("모습을 받지 못해도 기기에 남긴 모습이 있으면 그 모습으로 뛴다", async () => {
    stubDecode();
    rememberMascotLook(7, PENCIL);
    vi.mocked(getDecorations).mockRejectedValue(new Error("offline"));
    const recorder = recordResultMascot();

    renderResult();

    expect(await screen.findByText("오늘 공부 완료")).toBeInTheDocument();
    await act(async () => {});
    expect(mascot()?.querySelector("[data-slot='accessory-head']")).toHaveAttribute("src", BERET);
    for (const timi of TIMI_FACES) expect(recorder.everSeen()).not.toContain(timi);
  });

  it("소품 그림을 다 받을 때까지 연출을 미루고, 받으면 소품을 낀 채 시작한다", async () => {
    const decode = stubDecode("held");

    renderResult((client) => client.setQueryData(pointsKeys.look(7), PENCIL));
    await act(async () => {});
    expect(screen.queryByText("오늘 공부 완료")).not.toBeInTheDocument();

    await act(async () => decode.release());

    expect(mascot()?.className).toContain("result-mascot-jump");
    expect(mascot()?.querySelector("[data-slot='accessory-head']")).toHaveAttribute("src", BERET);
  });

  it("그림이 0.8초 안에 오지 않으면 그때 가진 모습으로 시작하고 공개도 그만큼 늦춘다", async () => {
    stubDecode("held");
    vi.useFakeTimers();

    renderResult((client) => client.setQueryData(pointsKeys.look(7), PENCIL));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MASCOT_LOOK_WAIT_MS - 1);
    });
    expect(mascot()).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mascot()?.querySelector("[data-slot='accessory-head']")).toHaveAttribute("src", BERET);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESULT_REVEAL_DELAY_MS - 1);
    });
    expect(screen.queryByRole("button", { name: "홈으로" })).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole("button", { name: "홈으로" })).toBeInTheDocument();
  });

  it("모션 축소에서는 글자와 버튼을 먼저 보이고 준비될 때까지 마스코트 자리만 비운다", async () => {
    reduceMotion();
    const decode = stubDecode("held");

    renderResult((client) => client.setQueryData(pointsKeys.look(7), PENCIL));

    expect(screen.getByText("오늘 공부 완료")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "홈으로" })).toBeInTheDocument();
    expect(document.querySelector("[data-result-mascot-slot]")).not.toBeNull();
    expect(mascot()).toBeNull();

    await act(async () => decode.release());

    expect(mascot()?.querySelector("[data-slot='accessory-head']")).toHaveAttribute("src", BERET);
  });
});
