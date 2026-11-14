import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clearSessionInvite } from "@/features/study-session/sessionInvite";
import { trackMultiTimerClosed, trackStudySessionEnded } from "@/lib/amplitude";
import { NATIVE_MESSAGE_ENTRY, postToNative } from "@/lib/bridge";
import type * as BridgeModule from "@/lib/bridge";
import { RoomPage } from "../RoomPage";

/**
 * 싱글룸 타이머 시트와 세션의 연결(회전, 세션 종료, 알림음, 종료 계측)을 본다.
 * 시트·칩 조작은 `RoomPage.timerChip.test.tsx`, 모드 안 규칙은 `useMultiTimer.test.tsx`가 검증한다.
 */
vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: () => ({ settled: true, restored: null }),
}));

vi.mock("@/features/study-session/submitStudySession", () => ({
  submitStudySession: vi.fn(),
}));

const listSubjects = vi.hoisted(() => vi.fn(async (): Promise<unknown[]> => []));
vi.mock("@/lib/subjectApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listSubjects,
}));

vi.mock("@/routes/lazyRoutes", () => ({ prefetchResultPage: vi.fn() }));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  trackStudySessionEnded: vi.fn(),
  trackMultiTimerClosed: vi.fn(),
}));

// 보낸 메시지만 엿보고 브라우저 단독 모드의 동작은 그대로 둔다.
vi.mock("@/lib/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof BridgeModule>();
  return { ...actual, postToNative: vi.fn(actual.postToNative) };
});

/** 네이티브가 세션 웹뷰에 초대를 넘긴 상황을 재현한다. */
function receiveInvite(code: string) {
  const entry = (globalThis as unknown as Record<string, (raw: string) => void>)[
    NATIVE_MESSAGE_ENTRY
  ];
  act(() => {
    entry(JSON.stringify({ type: "session-invite", code, atMs: Date.now() }));
  });
}

/** 라우터가 지금 보는 경로. */
function RouterPath() {
  return <output aria-label="라우터 경로">{useLocation().pathname}</output>;
}

/** `main.tsx`와 같은 BrowserRouter로 띄운다. popstate를 받으면 라우터도 위치를 다시 읽는다. */
function renderRoom() {
  window.history.pushState(null, "", "/room/7?userId=1");
  return render(
    <BrowserRouter>
      <RouterPath />
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
        <Route path="*" element={<p>룸 밖 화면</p>} />
      </Routes>
    </BrowserRouter>,
  );
}

/** 더보기 메뉴의 타이머 항목으로 시간 고르는 시트를 연다. */
async function openTimerSheet() {
  await userEvent.click(screen.getByRole("button", { name: "더보기" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "타이머" }));
}

/** 가짜 타이머 아래에서 시트를 연다. Radix 메뉴는 Enter 키로도 열린다. */
function openTimerSheetNow() {
  fireEvent.keyDown(screen.getByRole("button", { name: "더보기" }), { key: "Enter" });
  fireEvent.click(screen.getByRole("menuitem", { name: "타이머" }));
  return screen.getByRole("dialog", { name: "타이머 설정" });
}

const sheet = () => screen.queryByRole("dialog", { name: "타이머 설정" });

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("RoomPage 타이머와 세션", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    act(() => {
      clearSessionInvite();
      toast.dismiss();
    });
    localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("측정 화면이 열리면 회전 허용을 한 번 다시 알린다", () => {
    renderRoom();

    const orientation = vi
      .mocked(postToNative)
      .mock.calls.map(([message]) => message)
      .filter((message) => message.type === "set-orientation");
    expect(orientation).toEqual([
      { type: "set-orientation", unlocked: true, atMs: expect.any(Number) },
    ]);
  });

  it("타이머 시트를 열어도 회전을 잠그지 않는다", async () => {
    renderRoom();
    vi.mocked(postToNative).mockClear();

    await openTimerSheet();

    expect(sheet()).toBeInTheDocument();
    const orientation = vi
      .mocked(postToNative)
      .mock.calls.map(([message]) => message)
      .filter((message) => message.type === "set-orientation");
    expect(orientation).toEqual([]);
  });

  it("시트를 연 채로 세션이 끝나면 시트도 사라지고 룸에 머문다", async () => {
    renderRoom();
    await openTimerSheet();

    // 초대 확인 창의 참여하기가 시트를 연 채로 세션을 끝내는 실제 경로다.
    receiveInvite("4680");
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "참여하기" }),
    );

    await waitFor(() => expect(sheet()).not.toBeInTheDocument());
    expect(window.location.pathname).toBe("/room/7");
    expect(screen.getByLabelText("라우터 경로").textContent).toBe("/room/7");
  });

  it("심플 모드 더보기에는 카메라 전환 없이 스톱워치와 타이머가 있다", async () => {
    renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));
    await userEvent.click(screen.getByRole("button", { name: "더보기" }));

    const names = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(names).toEqual([
      "스톱워치",
      "타이머",
      "공부 시간으로 보기",
      "마스코트 보이기",
      "도움말 보기",
    ]);
  });

  it("알림음을 끄면 타이머가 끝나도 소리 없이 진동만 하고 다시 켜면 소리를 낸다", async () => {
    localStorage.setItem(
      "focuson.multiTimer.v1",
      JSON.stringify({ timerSec: 60, focusMin: 25, breakMin: 5 }),
    );
    const createOscillator = vi.fn(() => ({
      type: "sine",
      frequency: { setValueAtTime: vi.fn() },
      connect: (node: unknown) => node,
      start: vi.fn(),
      stop: vi.fn(),
    }));
    // 알림음은 돌고 있는 컨텍스트에만 음을 예약해서 처음부터 running 인 가짜를 쓴다.
    class FakeAudioContext {
      state = "running";
      currentTime = 0;
      destination = {};
      resume = () => Promise.resolve();
      close = () => Promise.resolve();
      createOscillator = createOscillator;
      createGain = () => ({
        gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: (node: unknown) => node,
      });
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    try {
      vi.useFakeTimers();
      renderRoom();
      let dialog = openTimerSheetNow();
      fireEvent.click(within(dialog).getByRole("switch", { name: "알림음" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "1분 시작" }));
      vibrate.mockClear();

      await advance(61_000);
      expect(createOscillator).not.toHaveBeenCalled();
      // 브라우저 단독에서는 alert 를 진동 길이로 바꿔 낸다.
      expect(vibrate).toHaveBeenCalledWith(20);

      dialog = openTimerSheetNow();
      fireEvent.click(within(dialog).getByRole("switch", { name: "알림음" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "1분 시작" }));
      await advance(61_000);
      expect(createOscillator).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      Reflect.deleteProperty(navigator, "vibrate");
    }
  });

  it("타이머를 쓴 세션을 끝내면 종료 계측에 타이머 사용이 실리고 타이머 닫힘은 보내지 않는다", async () => {
    vi.useFakeTimers();
    renderRoom();
    const dialog = openTimerSheetNow();
    fireEvent.click(within(dialog).getByRole("button", { name: "30분 시작" }));
    await advance(5000);

    fireEvent.click(screen.getByRole("button", { name: "공부 종료" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "공부 종료" }),
    );
    await advance(0);

    expect(vi.mocked(trackStudySessionEnded)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(trackStudySessionEnded).mock.calls[0]?.[0]).toMatchObject({
      roomType: "single",
      multiTimer: "timer",
    });
    expect(vi.mocked(trackMultiTimerClosed)).not.toHaveBeenCalled();
  });
});
