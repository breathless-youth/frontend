import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { clearSessionInvite } from "@/features/study-session/sessionInvite";
import { NATIVE_MESSAGE_ENTRY, postToNative } from "@/lib/bridge";
import type * as BridgeModule from "@/lib/bridge";
import { RoomPage } from "../RoomPage";

/**
 * 타이머·뽀모도로 모드 화면과 RoomPage 연결만 본다.
 * 모드 안 조작은 `useMultiTimer.test.tsx`와 패널 테스트, 껍데기는 `MultiTimerScreen.test.tsx`가 검증한다.
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

// 보낸 메시지만 엿보고 브라우저 단독 모드의 동작은 그대로 둔다.
vi.mock("@/lib/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof BridgeModule>();
  return { ...actual, postToNative: vi.fn(actual.postToNative) };
});

// 키패드 시트는 나눠 받는다. 첫 열기에서 모듈 받기가 findBy 기본 대기를 넘지 않게 미리 받아 둔다.
beforeAll(async () => {
  await import("@/features/multi-timer/components/MinuteKeypadSheet");
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

/** 지금 history 항목이 모드 화면 표시인가. */
function modeEntryOnTop() {
  const state = window.history.state as { sessionMode?: boolean } | null;
  return state?.sessionMode === true;
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

// 모드 화면이 열리면 뒤 화면이 aria-hidden이라 역할 이름을 계산하지 않아서 라벨로 찾는다.
function routerPath() {
  return screen.getByLabelText("라우터 경로").textContent;
}

/** 모드 화면 뒤에 가려진 측정 화면 상태 필의 문구 일치 여부 */
function statusShows(copy: string) {
  return screen
    .getAllByRole("status", { hidden: true })
    .some((status) => status.textContent === copy);
}

const MEASURING = "순공시간 측정 중";
const PAUSED = "측정을 일시정지했어요";

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("RoomPage 멀티 타이머", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    act(() => {
      clearSessionInvite();
      toast.dismiss();
    });
    localStorage.removeItem("focuson.multiTimer.v1");
    window.history.replaceState(null, "", "/");
  });

  it("오른쪽 위 열은 카메라 전환, 배경음, 과목, 타이머, 뽀모도로 순서다", () => {
    renderRoom();

    const names = within(screen.getByRole("group", { name: "부가 기능" }))
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual(["카메라 전환", "배경음", "과목", "타이머", "뽀모도로"]);
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

  it("opens_timer_screen_from_button", async () => {
    renderRoom();
    const timerButton = screen.getByRole("button", { name: "타이머" });
    expect(timerButton).toHaveAttribute("aria-haspopup", "dialog");
    expect(timerButton).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(timerButton);

    expect(screen.getByRole("dialog", { name: "타이머" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "시작" })).toBeInTheDocument();
    expect(timerButton).toHaveAttribute("aria-expanded", "true");
    expect(modeEntryOnTop()).toBe(true);
    // 같은 주소에 머물러 세션이 끊기지 않는다.
    expect(routerPath()).toBe("/room/7");
    expect(window.location.pathname).toBe("/room/7");
    const statuses = screen.getAllByRole("status", { hidden: true });
    expect(statuses.some((status) => status.textContent?.includes("순공시간 측정 중"))).toBe(true);
  });

  it("close_button_turns_mode_off", async () => {
    renderRoom();
    const pomodoroButton = screen.getByRole("button", { name: "뽀모도로" });
    await userEvent.click(pomodoroButton);
    expect(screen.getByRole("dialog", { name: "뽀모도로" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "뽀모도로 끄기" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "뽀모도로" })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(modeEntryOnTop()).toBe(false));
    await waitFor(() => expect(pomodoroButton).toHaveFocus());
    expect(pomodoroButton).toHaveAttribute("aria-expanded", "false");
    expect(routerPath()).toBe("/room/7");
  });

  it("browser_back_keeps_mode_screen", async () => {
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "타이머" }));
    const pushState = vi.spyOn(window.history, "pushState");

    act(() => {
      window.history.back();
    });

    await waitFor(() => expect(pushState).toHaveBeenCalledOnce());
    expect(modeEntryOnTop()).toBe(true);
    expect(screen.getByRole("dialog", { name: "타이머" })).toBeInTheDocument();
    expect(routerPath()).toBe("/room/7");
    expect(screen.queryByText("룸 밖 화면")).not.toBeInTheDocument();
  });

  it("session_end_closes_mode", async () => {
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "타이머" }));

    // 초대 확인 창의 참여하기가 모드 화면을 연 채로 세션을 끝내는 실제 경로다.
    receiveInvite("4680");
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "참여하기" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "타이머" })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(modeEntryOnTop()).toBe(false));
    expect(window.location.pathname).toBe("/room/7");
  });

  it("simple_mode_hides_mode_buttons", async () => {
    renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));

    for (const name of ["타이머", "뽀모도로"]) {
      const button = screen.getByRole("button", { name, hidden: true });
      expect(button.closest("[inert]")).not.toBeNull();
    }
  });

  it("뽀모도로 화면 안에서 키패드로 집중 시간을 바꿀 수 있다", async () => {
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "뽀모도로" }));

    await userEvent.click(screen.getByRole("button", { name: "집중 25분" }));
    const keypad = await screen.findByRole("dialog", { name: "집중 시간" });
    await userEvent.click(within(keypad).getByRole("button", { name: "4" }));
    await userEvent.click(within(keypad).getByRole("button", { name: "5" }));
    await userEvent.click(within(keypad).getByRole("button", { name: "확인" }));

    expect(await screen.findByRole("button", { name: "집중 45분" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "뽀모도로" })).toBeInTheDocument();
  });

  it("키패드는 Escape로 닫히고 모드 화면은 남는다", async () => {
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "뽀모도로" }));
    await userEvent.click(screen.getByRole("button", { name: "휴식 5분" }));
    expect(await screen.findByRole("dialog", { name: "휴식 시간" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "휴식 시간" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("dialog", { name: "뽀모도로" })).toBeInTheDocument();
  });

  it("뽀모도로 집중이 끝나면 세션이 휴식에 들어가고 휴식이 끝나면 측정이 다시 흐른다", async () => {
    localStorage.setItem(
      "focuson.multiTimer.v1",
      JSON.stringify({ timerSec: 1800, focusMin: 1, breakMin: 1 }),
    );
    vi.useFakeTimers();
    renderRoom();
    fireEvent.click(screen.getByRole("button", { name: "뽀모도로" }));
    const screenDialog = screen.getByRole("dialog", { name: "뽀모도로" });
    fireEvent.click(within(screenDialog).getByRole("button", { name: "시작" }));
    expect(statusShows(MEASURING)).toBe(true);

    await advance(61_000);
    expect(statusShows(PAUSED)).toBe(true);
    // 휴식은 사용자가 멈춘 것이 아니라 모드 버튼은 계속이 아니라 일시정지다.
    expect(within(screenDialog).getByRole("button", { name: "일시정지" })).toBeInTheDocument();

    await advance(60_000);
    expect(statusShows(MEASURING)).toBe(true);
  });

  it("세션이 멈춘 채 뽀모도로를 시작하면 측정도 다시 흐른다", async () => {
    vi.useFakeTimers();
    renderRoom();
    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    expect(statusShows(PAUSED)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "뽀모도로" }));
    const screenDialog = screen.getByRole("dialog", { name: "뽀모도로" });
    fireEvent.click(within(screenDialog).getByRole("button", { name: "시작" }));

    expect(statusShows(MEASURING)).toBe(true);
    expect(within(screenDialog).getByRole("button", { name: "일시정지" })).toBeInTheDocument();
  });
});
