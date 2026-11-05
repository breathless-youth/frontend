import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clearSessionInvite } from "@/features/study-session/sessionInvite";
import { sessionGuideState } from "@/features/study-session/sessionGuide";
import type { RestoredSession } from "@/features/study-session/restoreActiveSession";
import type * as tokenSourceModule from "@/lib/auth/tokenSource";
import type { AuthSnapshot, TokenSource } from "@/lib/auth/tokenSource";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import {
  enterGlassChrome,
  lastInlineControls,
  measureControlsNow,
  resetGlassChrome,
} from "@/test/nativeControlStub";
import { answerCameraPrompt } from "@/test/cameraPrompt";
import { RoomPage } from "../RoomPage";

/**
 * 세션 도움말 화면의 RoomPage 연결만 본다.
 * 화면 안 구성은 `SessionHelpScreen.test.tsx`가 검증한다.
 */
/** 신원 출처. 기본은 없음(쿼리 userId)이고, 늦게 도착하는 신원 테스트만 바꾼다. */
const mocks = vi.hoisted(() => ({
  source: null as TokenSource | null,
  restored: null as RestoredSession | null,
}));
vi.mock("@/lib/auth/tokenSource", async (importOriginal) => ({
  ...(await importOriginal<typeof tokenSourceModule>()),
  getTokenSource: () => mocks.source,
}));

vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: () => ({ settled: true, restored: mocks.restored }),
}));

vi.mock("@/features/study-session/submitStudySession", () => ({
  submitStudySession: vi.fn(),
}));

vi.mock("@/lib/subjectApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listSubjects: vi.fn(async (): Promise<unknown[]> => []),
}));

vi.mock("@/routes/lazyRoutes", () => ({ prefetchResultPage: vi.fn() }));

vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));

const amplitude = vi.hoisted(() => ({
  trackStudySessionHelpShown: vi.fn(),
  trackStudySessionHelpStepViewed: vi.fn(),
  trackStudySessionHelpCompleted: vi.fn(),
  trackStudySessionHelpDismissed: vi.fn(),
  trackStudySessionStarted: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...amplitude,
}));

const KEY = "focusmakers:session-guide:1";

function renderRoom(url = "/room/7?userId=1") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
        <Route path="/home" element={<div data-testid="home-stub" />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** 아직 `auth-token`이 오지 않은 출처. `arrive`로 도착을 흉내낸다(`RoomPage.identity.test.tsx`와 같다). */
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

/** 네이티브가 세션 웹뷰에 초대를 넘긴 상황을 재현한다. */
function receiveInvite(code: string) {
  const entry = (globalThis as unknown as Record<string, (raw: string) => void>)[
    NATIVE_MESSAGE_ENTRY
  ];
  act(() => {
    entry(JSON.stringify({ type: "session-invite", code, atMs: Date.now() }));
  });
}

/** 다음 버튼을 네 번 눌러 마지막 단계까지 간 뒤 순공 시작하기로 끝낸다. */
async function finishHelp() {
  for (let index = 0; index < 4; index += 1) {
    await userEvent.click(screen.getByRole("button", { name: "다음" }));
  }
  await userEvent.click(screen.getByRole("button", { name: "순공 시작하기" }));
}

const helpDialog = () => screen.queryByRole("dialog", { name: "세션 도움말" });

/** 지금까지 찍힌 단계 노출 이벤트의 단계 번호. */
const viewedSteps = () =>
  amplitude.trackStudySessionHelpStepViewed.mock.calls.map(([input]) => input.step);

/** 지금까지 찍힌 단계 노출 이벤트의 단계 id. */
const viewedStepIds = () =>
  amplitude.trackStudySessionHelpStepViewed.mock.calls.map(([input]) => input.stepId);

async function openHelpFromMenu() {
  await userEvent.click(screen.getByRole("button", { name: "더보기" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "도움말 보기" }));
}

/** 세션 화면이 떠 있는지. 첫 도움말 동안에는 세션 화면이 없다. */
const sessionMounted = () =>
  screen.queryByRole("button", { name: "일시정지", hidden: true }) !== null;

/** 이미 본 계정이 세션 중에 메뉴로 도움말을 연 상태까지 간다. */
async function renderWithMenuHelp() {
  localStorage.setItem(KEY, "seen");
  renderRoom();
  answerCameraPrompt("camera");
  await openHelpFromMenu();
}

/** 다음 단계까지 넘겨 마지막 단계에 둔다. */
async function goToLastStep() {
  for (let index = 0; index < 4; index += 1) {
    await userEvent.click(screen.getByRole("button", { name: "다음" }));
  }
}

describe("RoomPage 세션 도움말", () => {
  afterEach(() => {
    cleanup();
    resetGlassChrome();
    clearSessionInvite();
    mocks.source = null;
    mocks.restored = null;
    localStorage.clear();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("저장 기록이 없으면 띄우고 마지막 단계를 끝내면 seen을 남긴다", async () => {
    renderRoom();

    expect(helpDialog()).toBeInTheDocument();
    expect(sessionGuideState(1)).toBeNull();
    await finishHelp();

    expect(helpDialog()).not.toBeInTheDocument();
    expect(sessionGuideState(1)).toBe("seen");
  });

  it("첫 도움말이 떠 있는 동안에는 세션이 시작되지 않고, 순공 시작하기를 눌러야 시작한다", async () => {
    renderRoom();

    expect(helpDialog()).toBeInTheDocument();
    expect(sessionMounted()).toBe(false);
    expect(amplitude.trackStudySessionStarted).not.toHaveBeenCalled();

    await finishHelp();

    expect(sessionMounted()).toBe(true);
    expect(amplitude.trackStudySessionStarted).toHaveBeenCalledOnce();
  });

  it("나중에 시작할게요는 세션 없이 홈으로 가고 도움말을 완료로 남긴다", async () => {
    renderRoom();
    await goToLastStep();

    await userEvent.click(screen.getByRole("button", { name: "나중에 시작할게요" }));

    expect(await screen.findByTestId("home-stub")).toBeInTheDocument();
    expect(amplitude.trackStudySessionStarted).not.toHaveBeenCalled();
    expect(sessionGuideState(1)).toBe("seen");
    expect(amplitude.trackStudySessionHelpCompleted).toHaveBeenCalledExactlyOnceWith(
      "auto",
      "single",
      "later",
    );
  });

  it("나중에 시작할게요는 앱에 세션 화면을 닫아 달라고 알린다", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    renderRoom();
    await goToLastStep();

    await userEvent.click(screen.getByRole("button", { name: "나중에 시작할게요" }));

    expect(postMessage.mock.calls.map(([raw]) => JSON.parse(raw as string).type)).toContain(
      "navigate-home",
    );
    vi.unstubAllGlobals();
  });

  it("세션 중에 메뉴로 다시 본 도움말에는 나중에 시작할게요가 없다", async () => {
    await renderWithMenuHelp();
    await goToLastStep();

    expect(screen.getByRole("button", { name: "순공 시작하기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "나중에 시작할게요" })).not.toBeInTheDocument();
  });

  it("복원된 세션은 도움말로 막지 않는다", () => {
    mocks.restored = {
      startedAtMs: Date.now() - 600_000,
      reportedAtMs: Date.now() - 1_000,
      baseStudySec: 500,
      baseFocusSec: 400,
      events: [],
    };
    renderRoom();

    expect(helpDialog()).not.toBeInTheDocument();
    expect(amplitude.trackStudySessionStarted).toHaveBeenCalledOnce();
  });

  it("첫 도움말 중에 온 초대는 끝낼 세션이 없어 확인 없이 바로 따라간다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    renderRoom();

    receiveInvite("ABC123");

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(postMessage.mock.calls.map(([raw]) => JSON.parse(raw as string))).toContainEqual(
      expect.objectContaining({ type: "navigate-home", inviteCode: "ABC123" }),
    );
    expect(sessionMounted()).toBe(false);
    vi.unstubAllGlobals();
  });

  it("Escape로 닫으면 seen을 남기지 않고 세션을 시작하며 같은 화면에서는 다시 띄우지 않는다", async () => {
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "다음" }));

    fireEvent.keyDown(screen.getByRole("dialog", { name: "세션 도움말" }), { key: "Escape" });
    expect(helpDialog()).not.toBeInTheDocument();
    expect(sessionGuideState(1)).toBeNull();
    expect(sessionMounted()).toBe(true);
    // Escape 뒤에는 입장 카메라 확인 창이 뜨니 답을 해야 아래 초대 확인 창만 남는다.
    answerCameraPrompt("simple");

    // 다른 화면이 열렸다 닫혀도 다시 뜨지 않는다.
    receiveInvite("ABC123");
    const invite = await screen.findByRole("alertdialog");
    await userEvent.click(within(invite).getByRole("button", { name: "계속하기" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(helpDialog()).not.toBeInTheDocument();
  });

  it("Escape로 닫은 뒤 더보기로 다시 열어 끝까지 보면 seen을 남긴다", async () => {
    renderRoom();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "세션 도움말" }), { key: "Escape" });
    expect(sessionGuideState(1)).toBeNull();
    answerCameraPrompt("camera");

    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "도움말 보기" }));
    expect(helpDialog()).toBeInTheDocument();
    await finishHelp();

    expect(helpDialog()).not.toBeInTheDocument();
    expect(sessionGuideState(1)).toBe("seen");
  });

  it("끝까지 보지 않고 닫은 계정은 화면을 다시 열면 1단계부터 다시 뜬다", async () => {
    const first = renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.keyDown(screen.getByRole("dialog", { name: "세션 도움말" }), { key: "Escape" });
    expect(helpDialog()).not.toBeInTheDocument();
    first.unmount();

    renderRoom();
    expect(helpDialog()).toBeInTheDocument();
    expect(screen.getByText("1/5")).toBeInTheDocument();
  });

  it("이미 본 계정(seen)에는 띄우지 않는다", () => {
    localStorage.setItem(KEY, "seen");
    renderRoom();
    expect(helpDialog()).not.toBeInTheDocument();
  });

  it("더보기의 도움말 보기로 언제든 다시 연다", async () => {
    localStorage.setItem(KEY, "seen");
    renderRoom();
    answerCameraPrompt("camera");

    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "도움말 보기" }));

    expect(helpDialog()).toBeInTheDocument();
    await finishHelp();
    expect(helpDialog()).not.toBeInTheDocument();
    expect(sessionGuideState(1)).toBe("seen");
  });

  it("메뉴로 연 도움말이 떠 있는 동안 덮개 뒤 실제 버튼과 화면 탭은 inert로 막고, 닫으면 풀린다", async () => {
    await renderWithMenuHelp();

    const pause = screen.getByRole("button", { name: "일시정지", hidden: true });
    const surface = screen.getByRole("button", { name: "심플 모드 전환", hidden: true });
    expect(pause.closest("[inert]")).not.toBeNull();
    expect(surface).toHaveAttribute("inert");

    await finishHelp();
    expect(pause.closest("[inert]")).toBeNull();
    expect(surface).not.toHaveAttribute("inert");
  });

  it("메뉴로 연 도움말은 과목 페이지가 열려 있는 동안 숨기고 닫히면 같은 단계로 다시 보인다", async () => {
    await renderWithMenuHelp();
    expect(helpDialog()).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByText("2/5")).toBeInTheDocument();

    // jsdom은 inert를 지키지 않아 덮개 뒤 버튼을 직접 눌러 페이지를 연 상황을 만든다.
    fireEvent.click(screen.getByRole("button", { name: "과목", hidden: true }));
    await waitFor(() => expect(helpDialog()).not.toBeInTheDocument());

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(helpDialog()).toBeInTheDocument());
    expect(screen.getByText("2/5")).toBeInTheDocument();
  });

  it("덮개 탭으로 5단계까지 넘어가고, 마지막은 순공 시작하기로만 끝내며 그때 seen을 남긴다", async () => {
    renderRoom();

    for (let index = 0; index < 4; index += 1) fireEvent.click(screen.getByLabelText("다음 안내"));
    expect(screen.getByText("5/5")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("다음 안내"));
    expect(helpDialog()).toBeInTheDocument();
    expect(sessionGuideState(1)).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "순공 시작하기" }));
    expect(helpDialog()).not.toBeInTheDocument();
    expect(sessionGuideState(1)).toBe("seen");
  });

  it("신원이 없어도 메뉴로 열고 닫을 수 있고 기기에 아무것도 남기지 않는다", async () => {
    renderRoom("/room/7");
    answerCameraPrompt("camera");

    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "도움말 보기" }));
    expect(helpDialog()).toBeInTheDocument();

    await finishHelp();
    expect(helpDialog()).not.toBeInTheDocument();
    expect(Object.keys(localStorage).filter((key) => key.includes("session-guide"))).toEqual([]);
  });

  it("메뉴로 열었다 닫으면 초점이 더보기 버튼으로 돌아온다", async () => {
    localStorage.setItem(KEY, "seen");
    renderRoom();
    answerCameraPrompt("camera");
    const more = screen.getByRole("button", { name: "더보기" });

    await userEvent.click(more);
    await userEvent.click(screen.getByRole("menuitem", { name: "도움말 보기" }));
    await finishHelp();

    expect(document.activeElement).toBe(more);
  });

  it("메뉴로 연 도움말은 종료 확인 대화상자가 열린 동안 숨기고 닫히면 다시 보인다", async () => {
    await renderWithMenuHelp();

    // jsdom은 inert를 지키지 않아 덮개 뒤 종료 버튼을 직접 누른다.
    fireEvent.click(screen.getByRole("button", { name: "공부 종료", hidden: true }));
    const dialog = await screen.findByRole("alertdialog");
    expect(helpDialog()).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "계속하기" }));
    await waitFor(() => expect(helpDialog()).toBeInTheDocument());
  });

  it("메뉴로 연 도움말은 다른 웹 모달(aria-modal)이 떠 있는 동안 숨긴다", async () => {
    await renderWithMenuHelp();
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");

    act(() => {
      document.body.append(modal);
    });
    await waitFor(() => expect(helpDialog()).not.toBeInTheDocument());

    act(() => {
      modal.remove();
    });
    await waitFor(() => expect(helpDialog()).toBeInTheDocument());
  });

  it("메뉴로 연 도움말이 떠 있는 동안 앱 glass 버튼 다섯 개를 faded로 감추고 닫으면 되돌린다", async () => {
    const postMessage = enterGlassChrome("/room/7", "segment,switch,button,button-style");
    measureControlsNow();
    // jsdom은 CSS를 계산하지 않아서 아이콘 svg의 CSS 폭만 돌려준다(RoomPage.test와 같은 방식).
    const computedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) =>
      element instanceof SVGElement
        ? ({ width: "23px" } as CSSStyleDeclaration)
        : computedStyle(element, pseudo),
    );
    await renderWithMenuHelp();
    const ids = [
      "session-ambient",
      "session-subject",
      "session-timer",
      "session-pause",
      "session-exit",
    ];
    const faded = () =>
      Object.fromEntries(
        lastInlineControls(postMessage)
          .filter((control) => ids.includes(control.id))
          .map((control) => [control.id, control.faded]),
      );

    await waitFor(() => expect(Object.values(faded())).toEqual([true, true, true, true, true]));

    fireEvent.keyDown(screen.getByRole("dialog", { name: "세션 도움말" }), { key: "Escape" });
    await waitFor(() =>
      expect(Object.values(faded())).toEqual([false, false, false, false, false]),
    );
  });

  it("신원이 늦게 도착해도 도움말을 띄운다", () => {
    const { source, arrive } = pendingSource();
    mocks.source = source;
    renderRoom("/room/7");
    expect(helpDialog()).not.toBeInTheDocument();

    act(() => {
      arrive(1);
    });

    expect(helpDialog()).toBeInTheDocument();
  });

  it("메뉴로 연 도움말은 타이머 화면이 열린 동안 숨긴다", async () => {
    await renderWithMenuHelp();

    // jsdom은 inert를 지키지 않아 덮개 뒤 타이머 버튼을 직접 누른다.
    fireEvent.click(screen.getByRole("button", { name: "타이머", hidden: true }));

    await waitFor(() => expect(helpDialog()).not.toBeInTheDocument());
  });

  it("메뉴로 연 도움말은 초대 대화상자가 열린 동안 숨긴다", async () => {
    await renderWithMenuHelp();
    expect(helpDialog()).toBeInTheDocument();

    receiveInvite("ABC123");

    await waitFor(() => expect(helpDialog()).not.toBeInTheDocument());
  });

  describe("분석 이벤트", () => {
    it("세션 진입으로 자동 노출되면 shown(auto)과 1단계 step_viewed를 한 번씩 보낸다", () => {
      renderRoom();

      expect(amplitude.trackStudySessionHelpShown).toHaveBeenCalledExactlyOnceWith(
        "auto",
        "single",
      );
      expect(amplitude.trackStudySessionHelpStepViewed).toHaveBeenCalledExactlyOnceWith({
        step: 1,
        stepId: "away",
        trigger: "auto",
        roomType: "single",
      });
    });

    it("이미 본 계정은 자동 노출이 없어 아무것도 보내지 않는다", () => {
      localStorage.setItem(KEY, "seen");
      renderRoom();

      expect(amplitude.trackStudySessionHelpShown).not.toHaveBeenCalled();
      expect(amplitude.trackStudySessionHelpStepViewed).not.toHaveBeenCalled();
    });

    it("더보기의 도움말 보기로 열면 shown(menu)과 1단계 step_viewed를 보낸다", async () => {
      localStorage.setItem(KEY, "seen");
      renderRoom();
      answerCameraPrompt("camera");

      await openHelpFromMenu();

      expect(amplitude.trackStudySessionHelpShown).toHaveBeenCalledExactlyOnceWith(
        "menu",
        "single",
      );
      expect(amplitude.trackStudySessionHelpStepViewed).toHaveBeenCalledExactlyOnceWith({
        step: 1,
        stepId: "away",
        trigger: "menu",
        roomType: "single",
      });
    });

    it("다음과 이전으로 단계가 바뀔 때마다 step_viewed를 보낸다", async () => {
      renderRoom();

      await userEvent.click(screen.getByRole("button", { name: "다음" }));
      await userEvent.click(screen.getByRole("button", { name: "다음" }));
      await userEvent.click(screen.getByRole("button", { name: "이전" }));

      expect(viewedSteps()).toEqual([1, 2, 3, 2]);
      expect(amplitude.trackStudySessionHelpShown).toHaveBeenCalledOnce();
    });

    it("다른 화면에 가려졌다 같은 단계로 돌아와도 shown과 step_viewed를 다시 보내지 않는다", async () => {
      await renderWithMenuHelp();
      await userEvent.click(screen.getByRole("button", { name: "다음" }));

      // jsdom은 inert를 지키지 않아 덮개 뒤 버튼을 직접 눌러 페이지를 연 상황을 만든다.
      fireEvent.click(screen.getByRole("button", { name: "과목", hidden: true }));
      await waitFor(() => expect(helpDialog()).not.toBeInTheDocument());
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(helpDialog()).toBeInTheDocument());
      expect(screen.getByText("2/5")).toBeInTheDocument();

      expect(amplitude.trackStudySessionHelpShown).toHaveBeenCalledOnce();
      expect(viewedSteps()).toEqual([1, 2]);
    });

    it("끝까지 넘기면 단계 1~5를 차례로 보내고 completed를 한 번 보낸다", async () => {
      renderRoom();

      await finishHelp();

      expect(viewedSteps()).toEqual([1, 2, 3, 4, 5]);
      expect(viewedStepIds()).toEqual(["away", "measuring", "camera", "buttons", "finish"]);
      expect(amplitude.trackStudySessionHelpCompleted).toHaveBeenCalledExactlyOnceWith(
        "auto",
        "single",
      );
      expect(amplitude.trackStudySessionHelpDismissed).not.toHaveBeenCalled();
    });

    it("Escape로 닫으면 닫은 단계와 reason을 담은 dismissed를 보내고 completed는 보내지 않는다", async () => {
      renderRoom();
      await userEvent.click(screen.getByRole("button", { name: "다음" }));

      fireEvent.keyDown(screen.getByRole("dialog", { name: "세션 도움말" }), { key: "Escape" });

      expect(amplitude.trackStudySessionHelpDismissed).toHaveBeenCalledExactlyOnceWith({
        step: 2,
        stepId: "measuring",
        trigger: "auto",
        roomType: "single",
        reason: "escape",
      });
      expect(amplitude.trackStudySessionHelpCompleted).not.toHaveBeenCalled();
    });

    it("닫은 뒤 메뉴로 다시 열면 새 노출로 menu 경로와 1단계부터 다시 보낸다", async () => {
      renderRoom();
      await userEvent.click(screen.getByRole("button", { name: "다음" }));
      fireEvent.keyDown(screen.getByRole("dialog", { name: "세션 도움말" }), { key: "Escape" });
      answerCameraPrompt("camera");
      amplitude.trackStudySessionHelpShown.mockClear();
      amplitude.trackStudySessionHelpStepViewed.mockClear();

      await openHelpFromMenu();
      await finishHelp();

      expect(amplitude.trackStudySessionHelpShown).toHaveBeenCalledExactlyOnceWith(
        "menu",
        "single",
      );
      expect(viewedSteps()).toEqual([1, 2, 3, 4, 5]);
      expect(amplitude.trackStudySessionHelpStepViewed).toHaveBeenLastCalledWith({
        step: 5,
        stepId: "finish",
        trigger: "menu",
        roomType: "single",
      });
      expect(amplitude.trackStudySessionHelpCompleted).toHaveBeenCalledExactlyOnceWith(
        "menu",
        "single",
      );
    });
  });
});
