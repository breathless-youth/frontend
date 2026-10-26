import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clearSessionInvite } from "@/features/study-session/sessionInvite";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { RoomPage } from "../RoomPage";

/**
 * 과목 페이지와 하단 버튼의 RoomPage 연결만 본다.
 * 페이지 안 조작은 `SubjectPanel.test.tsx`, 껍데기는 `SessionPage.test.tsx`가 검증한다.
 */
vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: () => ({ settled: true, restored: null }),
}));

vi.mock("@/features/study-session/submitStudySession", () => ({
  submitStudySession: vi.fn(),
}));

const listSubjects = vi.hoisted(() => vi.fn(async (): Promise<unknown[]> => []));
const createTask = vi.hoisted(() => vi.fn());
vi.mock("@/lib/subjectApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listSubjects,
  createTask,
}));

vi.mock("@/routes/lazyRoutes", () => ({ prefetchResultPage: vi.fn() }));

const amplitude = vi.hoisted(() => ({
  trackSubjectSheetOpened: vi.fn(),
  trackSubjectSheetClosed: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...amplitude,
}));

const MATH = { id: 3, name: "수학", colorIndex: 0, studySec: 0, focusSec: 0, tasks: [] };

function renderRoom() {
  return render(
    <MemoryRouter initialEntries={["/room/7?userId=1"]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
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

/**
 * jsdom은 CSS 애니메이션을 돌리지 않아 Radix가 닫힌 페이지를 곧바로 걷는다.
 * 페이지 내용의 `animationName`을 상태에 따라 돌려줘 퇴장 모션이 도는 중인 것처럼 만든다.
 */
function simulatePageAnimations() {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const styles = real(element, pseudo);
    if (!(element instanceof HTMLElement) || element.getAttribute("role") !== "dialog") {
      return styles;
    }
    return new Proxy(styles, {
      get(target, property) {
        if (property === "animationName") {
          return element.dataset.state === "closed" ? "exit" : "enter";
        }
        const value = Reflect.get(target, property) as unknown;
        return typeof value === "function" ? (value as () => unknown).bind(target) : value;
      },
    });
  });
  if (typeof CSS === "undefined" || typeof CSS.escape !== "function") {
    vi.stubGlobal("CSS", { escape: (value: string) => value });
  }
}

/** 퇴장 모션이 끝났다고 알린다. */
function finishExitAnimation(dialog: HTMLElement) {
  const event = new Event("animationend", { bubbles: true });
  Object.defineProperty(event, "animationName", { value: "exit" });
  act(() => {
    dialog.dispatchEvent(event);
  });
}

/** 세션 레이어의 화면 알림 영역. 페이지 안의 알림 영역은 세지 않는다. */
function layerToasters() {
  return screen
    .queryAllByRole("region", { name: "화면 알림", hidden: true })
    .filter((region) => region.closest('[role="dialog"]') === null);
}

/** 앞선 테스트가 남긴 앞으로 가기 항목을 끊어 history 길이를 셀 기준을 새로 잡는다. */
function freshHistory() {
  window.history.pushState(null, "");
  return window.history.length;
}

/** 지금 history 항목이 세션 페이지 표시인가. */
function pageEntryOnTop() {
  const state = window.history.state as { sessionPage?: string } | null;
  return state?.sessionPage !== undefined;
}

/** 라우터가 지금 보는 경로. 페이지가 열리면 뒤 화면이 aria-hidden이라 `hidden: true`로 찾는다. */
function RouterPath() {
  return <output aria-label="라우터 경로">{useLocation().pathname}</output>;
}

/** `main.tsx`와 같은 BrowserRouter로 띄운다. popstate를 받으면 라우터도 위치를 다시 읽는다. */
function renderRoomInBrowserRouter() {
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

function routerPath() {
  return screen.getByRole("status", { name: "라우터 경로", hidden: true }).textContent;
}

async function selectMathFromPage() {
  await userEvent.click(screen.getByRole("button", { name: "과목" }));
  await userEvent.click(await screen.findByRole("button", { name: "수학 측정 시작" }));
}

describe("RoomPage 과목 페이지와 하단 버튼", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    act(() => {
      clearSessionInvite();
      toast.dismiss();
    });
  });

  it("하단 바 없이 일시정지와 공부 종료 버튼이 있다", () => {
    renderRoom();

    expect(screen.queryByRole("group", { name: "세션 컨트롤" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "일시정지" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "공부 종료" })).toBeInTheDocument();
  });

  it("오른쪽 위 열은 카메라 전환, 배경음, 과목, 타이머 순서이고 심플 모드에서는 열 전체를 숨긴다", async () => {
    renderRoom();
    const group = screen.getByRole("group", { name: "부가 기능" });
    const names = within(group)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));

    expect(names).toEqual(["카메라 전환", "배경음", "과목", "타이머"]);
    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));
    expect(group).toHaveAttribute("inert");
  });

  it("선택한 과목이 없으면 라벨이 없다", async () => {
    listSubjects.mockResolvedValueOnce([MATH]);
    renderRoom();

    await waitFor(() => expect(listSubjects).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /순공/ })).not.toBeInTheDocument();
  });

  it("과목 버튼으로 열면 세션이 계속되고, 뒤로 닫으면 열린 초가 찍히고 포커스가 돌아온다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderRoom();
    const subjectButton = screen.getByRole("button", { name: "과목" });

    await user.click(subjectButton);
    const dialog = screen.getByRole("dialog", { name: "과목" });
    expect(amplitude.trackSubjectSheetOpened).toHaveBeenCalledWith("button");
    expect(within(dialog).getByText("00:00:00")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    // 열린 동안에도 순공이 쌓이고, 페이지를 열었다고 일시정지되지 않는다.
    expect(within(dialog).getByText(/^00:00:0[34]$/)).toBeInTheDocument();
    expect(screen.getByRole("status", { hidden: true })).toHaveTextContent("순공시간 측정 중");
    expect(screen.getByRole("button", { name: "일시정지", hidden: true })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "뒤로 가기" }));

    expect(amplitude.trackSubjectSheetClosed).toHaveBeenCalledWith({
      openSec: 3,
      closedBy: "back",
    });
    await waitFor(() => expect(subjectButton).toHaveFocus());
  });

  it("일시정지 중 재생 버튼은 세션을 다시 시작하고 페이지를 닫는다", async () => {
    listSubjects.mockResolvedValueOnce([MATH]);
    renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "일시정지" }));
    await selectMathFromPage();

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "과목" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "일시정지" })).toBeInTheDocument();
    expect(amplitude.trackSubjectSheetClosed).toHaveBeenCalledOnce();
    expect(amplitude.trackSubjectSheetClosed).toHaveBeenCalledWith(
      expect.objectContaining({ closedBy: "play" }),
    );
  });

  it("라벨로 열면 진입 경로가 label이고, 닫으면 라벨로 포커스가 돌아온다", async () => {
    listSubjects.mockResolvedValueOnce([MATH]);
    renderRoom();
    await selectMathFromPage();
    const label = await screen.findByRole("button", { name: /^수학.*순공/ });

    await userEvent.click(label);
    expect(amplitude.trackSubjectSheetOpened).toHaveBeenLastCalledWith("label");
    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(label).toHaveFocus());
  });

  it("라벨로 열고 과목을 해제한 뒤 닫으면 과목 버튼으로 포커스가 간다", async () => {
    listSubjects.mockResolvedValueOnce([MATH]);
    renderRoom();
    await selectMathFromPage();

    await userEvent.click(await screen.findByRole("button", { name: /^수학.*순공/ }));
    await userEvent.click(screen.getByRole("button", { name: "수학 측정 멈추기" }));
    expect(screen.getByRole("dialog", { name: "과목" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "과목" })).toHaveFocus());
  });

  it("페이지가 열린 동안 세션 레이어가 접근성 트리에서 가려진다", async () => {
    renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "과목" }));

    expect(screen.queryByRole("button", { name: "공부 종료" })).not.toBeInTheDocument();
  });

  it("페이지가 열린 동안 초대가 오면 초대 확인 창이 페이지 위에 뜬다", async () => {
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "과목" }));

    receiveInvite("4680");

    const dialog = await screen.findByRole("alertdialog");
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "계속하기" })).toHaveFocus(),
    );
  });

  it("페이지가 열린 동안 난 저장 실패 토스트는 페이지 안에 한 번만 뜬다", async () => {
    listSubjects.mockResolvedValueOnce([MATH]);
    createTask.mockRejectedValueOnce(new Error("network"));
    renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "과목" }));
    await userEvent.click(await screen.findByRole("button", { name: /할 일 추가/ }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "새 할 일 이름" }),
      "오답 정리{Enter}",
    );

    const dialog = screen.getByRole("dialog", { name: "과목" });
    expect(
      await within(dialog).findByText("저장하지 못했어요. 다시 시도해주세요"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("저장하지 못했어요. 다시 시도해주세요", { exact: true }),
    ).toHaveLength(1);
  });

  it("불투명한 페이지가 밀려 나가는 동안 뒤에 세션 화면이 그대로 보이고, 알림 영역은 하나뿐이다", async () => {
    simulatePageAnimations();
    renderRoom();
    // 레이어는 상태 필의 부모다. 숨김이 클래스로만 드러나서 이 테스트에 한해 클래스를 본다.
    const layer = screen.getByRole("status").parentElement!;
    await userEvent.click(screen.getByRole("button", { name: "과목" }));
    expect(layerToasters()).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));
    const closing = screen.getByRole("dialog", { name: "과목", hidden: true });
    expect(layer).not.toHaveClass("invisible");
    expect(layerToasters()).toHaveLength(1);
    expect(screen.getAllByRole("region", { name: "화면 알림", hidden: true })).toHaveLength(1);

    finishExitAnimation(closing);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "과목", hidden: true })).not.toBeInTheDocument(),
    );
    expect(layerToasters()).toHaveLength(1);
  });

  it("페이지가 열린 채 세션이 끝나 화면이 사라지면 닫힘 이벤트를 남기지 않는다", async () => {
    const { unmount } = renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "과목" }));

    // 초대 확인 창의 참여하기가 페이지를 연 채로 세션을 끝내는 실제 경로다.
    receiveInvite("4680");
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "참여하기" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "과목" })).not.toBeInTheDocument(),
    );
    // 페이지가 history를 거치지 않고 닫혀도 우리 항목은 걷어 내고, 그 뒤의 popstate에는 반응하지 않는다.
    await waitFor(() => expect(pageEntryOnTop()).toBe(false));
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    unmount();

    expect(amplitude.trackSubjectSheetClosed).not.toHaveBeenCalled();
  });

  it("과목을 고른 동안 과목 버튼이 배경음 버튼처럼 켜진 모양이 되고, 해제하면 돌아온다", async () => {
    listSubjects.mockResolvedValueOnce([MATH]);
    renderRoom();
    expect(screen.getByRole("button", { name: "과목" })).toHaveAttribute("data-on", "false");

    await selectMathFromPage();
    expect(await screen.findByRole("button", { name: "과목 선택됨" })).toHaveAttribute(
      "data-on",
      "true",
    );

    await userEvent.click(screen.getByRole("button", { name: "과목 선택됨" }));
    await userEvent.click(screen.getByRole("button", { name: "수학 측정 멈추기" }));
    await userEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));
    expect(screen.getByRole("button", { name: "과목" })).toHaveAttribute("data-on", "false");
  });

  it("페이지를 열 때만 history 항목을 하나 쌓는다", async () => {
    const before = freshHistory();
    renderRoom();
    expect(window.history.length).toBe(before);

    await userEvent.click(screen.getByRole("button", { name: "과목" }));

    expect(window.history.length).toBe(before + 1);
    expect(window.history.state).toMatchObject({ sessionPage: "subject" });
  });

  it("뒤로 가기(가장자리 스와이프·브라우저 뒤로)로 페이지가 닫히고 닫힘은 back으로 한 번 남는다", async () => {
    freshHistory();
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "과목" }));

    act(() => {
      window.history.back();
    });

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "과목" })).not.toBeInTheDocument(),
    );
    expect(amplitude.trackSubjectSheetClosed).toHaveBeenCalledOnce();
    expect(amplitude.trackSubjectSheetClosed).toHaveBeenCalledWith(
      expect.objectContaining({ closedBy: "back" }),
    );
  });

  it("‹와 재생 버튼도 history를 되돌려 닫아서, 열고 닫기를 되풀이해도 항목이 늘지 않는다", async () => {
    listSubjects.mockResolvedValueOnce([MATH]);
    const before = freshHistory();
    renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "과목" }));
    await userEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "과목" })).not.toBeInTheDocument(),
    );
    expect(pageEntryOnTop()).toBe(false);

    await selectMathFromPage();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "과목" })).not.toBeInTheDocument(),
    );
    expect(pageEntryOnTop()).toBe(false);
    expect(window.history.length).toBe(before + 1);
    expect(amplitude.trackSubjectSheetClosed.mock.calls.map(([input]) => input.closedBy)).toEqual([
      "back",
      "play",
    ]);
  });

  it("배경음 페이지도 뒤로 가기로 닫힌다", async () => {
    freshHistory();
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "배경음" }));
    expect(window.history.state).toMatchObject({ sessionPage: "ambient" });

    act(() => {
      window.history.back();
    });

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "배경음" })).not.toBeInTheDocument(),
    );
  });

  it("popstate가 오기 전에 ‹를 한 번 더 눌러도 history는 한 칸만 되돌린다", async () => {
    freshHistory();
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "과목" }));
    const historyBack = vi.spyOn(window.history, "back");

    const back = screen.getByRole("button", { name: "뒤로 가기" });
    fireEvent.click(back);
    fireEvent.click(back);

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "과목" })).not.toBeInTheDocument(),
    );
    expect(historyBack).toHaveBeenCalledOnce();
    expect(amplitude.trackSubjectSheetClosed).toHaveBeenCalledOnce();
  });

  it("앞으로 가기로 표시 항목에 돌아와 다시 열면 항목을 새로 쌓지 않는다", async () => {
    const before = freshHistory();
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "과목" }));
    await userEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));
    await waitFor(() => expect(pageEntryOnTop()).toBe(false));

    act(() => {
      window.history.forward();
    });
    await waitFor(() => expect(pageEntryOnTop()).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "과목" }));
    await userEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));

    await waitFor(() => expect(pageEntryOnTop()).toBe(false));
    expect(window.history.length).toBe(before + 1);
  });

  it("페이지가 열린 채 화면이 사라지면 쌓아 둔 항목을 걷어 낸다", async () => {
    freshHistory();
    const { unmount } = renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "배경음" }));
    expect(pageEntryOnTop()).toBe(true);

    unmount();

    await waitFor(() => expect(pageEntryOnTop()).toBe(false));
  });

  it("닫는 중에 화면이 사라져도 history는 한 번만 되돌린다", async () => {
    freshHistory();
    const { unmount } = renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "과목" }));
    const historyBack = vi.spyOn(window.history, "back");

    fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));
    unmount();

    await waitFor(() => expect(pageEntryOnTop()).toBe(false));
    expect(historyBack).toHaveBeenCalledOnce();
  });

  describe("실제 BrowserRouter", () => {
    afterEach(() => {
      window.history.replaceState(null, "", "/");
    });

    it("뒤로 가기로 닫고 다시 열 수 있고, 세션이 끝난 뒤의 popstate에는 반응하지 않으며 룸 경로에 머문다", async () => {
      renderRoomInBrowserRouter();
      await userEvent.click(screen.getByRole("button", { name: "과목" }));
      expect(pageEntryOnTop()).toBe(true);

      act(() => {
        window.history.back();
      });
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "과목" })).not.toBeInTheDocument(),
      );
      expect(routerPath()).toBe("/room/7");
      expect(amplitude.trackSubjectSheetClosed).toHaveBeenCalledOnce();

      await userEvent.click(screen.getByRole("button", { name: "과목" }));
      expect(await screen.findByRole("dialog", { name: "과목" })).toBeInTheDocument();
      expect(pageEntryOnTop()).toBe(true);

      receiveInvite("4680");
      await userEvent.click(
        within(await screen.findByRole("alertdialog")).getByRole("button", { name: "참여하기" }),
      );
      await waitFor(() => expect(pageEntryOnTop()).toBe(false));
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(amplitude.trackSubjectSheetClosed).toHaveBeenCalledOnce();
      expect(routerPath()).toBe("/room/7");
      expect(window.location.pathname).toBe("/room/7");
      expect(screen.queryByText("룸 밖 화면")).not.toBeInTheDocument();
    });

    it("페이지가 열린 채 화면이 사라지면 표시 항목만 걷어 내고 룸 주소에 머문다", async () => {
      const { unmount } = renderRoomInBrowserRouter();
      await userEvent.click(screen.getByRole("button", { name: "배경음" }));
      expect(pageEntryOnTop()).toBe(true);

      unmount();

      await waitFor(() => expect(pageEntryOnTop()).toBe(false));
      expect(window.location.pathname).toBe("/room/7");
      expect(window.location.search).toBe("?userId=1");
    });
  });
});
