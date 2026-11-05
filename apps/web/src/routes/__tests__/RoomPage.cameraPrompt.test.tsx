import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clearSessionInvite } from "@/features/study-session/sessionInvite";
import type * as tokenSourceModule from "@/lib/auth/tokenSource";
import type { AuthSnapshot, TokenSource } from "@/lib/auth/tokenSource";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { CAMERA_PROMPT_NAME } from "@/test/cameraPrompt";
import { RoomPage } from "../RoomPage";

/**
 * 싱글룸 입장 카메라 확인 창과 심플 모드 시작의 RoomPage 연결만 본다.
 * 창 자체의 Escape·딤·초점 규칙은 `CameraOnConfirmDialog.test.tsx`가 검증한다.
 */
/** 신원 출처. 기본은 없음(쿼리 userId)이고, 늦게 도착하는 신원 테스트만 바꾼다. */
const mocks = vi.hoisted(() => ({ source: null as TokenSource | null }));
vi.mock("@/lib/auth/tokenSource", async (importOriginal) => ({
  ...(await importOriginal<typeof tokenSourceModule>()),
  getTokenSource: () => mocks.source,
}));

vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: () => ({ settled: true, restored: null }),
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
  trackStudySessionCameraPromptShown: vi.fn(),
  trackStudySessionCameraPromptAnswered: vi.fn(),
  trackSessionSimpleModeToggled: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...amplitude,
}));

function renderRoom(url = "/room/7?userId=1") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** 아직 `auth-token`이 오지 않은 출처. `arrive`로 도착을 흉내낸다(`RoomPage.help.test.tsx`와 같다). */
function pendingSource(): { source: TokenSource; arrive: (userId: number | null) => void } {
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

const prompt = () => screen.queryByRole("alertdialog", { name: CAMERA_PROMPT_NAME });
/** 지금 보이는 세션 배경. 숨은 쪽은 표식을 떼므로 하나만 남는다. */
const surface = () =>
  document.querySelector("[data-session-surface]")?.getAttribute("data-session-surface");

/** 단계 수와 상관없이 다음을 눌러 끝까지 간 뒤 순공 시작하기로 끝낸다. */
async function finishHelp() {
  while (screen.queryByRole("button", { name: "다음" }) !== null) {
    await userEvent.click(screen.getByRole("button", { name: "다음" }));
  }
  await userEvent.click(screen.getByRole("button", { name: "순공 시작하기" }));
}

describe("RoomPage 심플 모드 시작과 입장 카메라 확인 창", () => {
  afterEach(() => {
    cleanup();
    act(() => {
      clearSessionInvite();
    });
    mocks.source = null;
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("심플 모드로 들어오자마자 확인 창을 본다", () => {
    renderRoom();

    const dialog = prompt();
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAccessibleDescription("얼굴과 책상이 보이게 자리를 잡아 주세요");
    expect(within(dialog!).getByText("영상은 기기 밖으로 나가지 않아요")).toBeInTheDocument();
    expect(within(dialog!).getByRole("button", { name: "심플 모드로 시작" })).toHaveFocus();
    expect(surface()).toBe("simple");
    expect(amplitude.trackStudySessionCameraPromptShown).toHaveBeenCalledExactlyOnceWith("single");
  });

  it("카메라 켜기를 누르면 촬영 화면으로 바꾸고 camera로 답한 것을 보낸다", async () => {
    renderRoom();

    await userEvent.click(within(prompt()!).getByRole("button", { name: "카메라 켜기" }));

    expect(prompt()).not.toBeInTheDocument();
    expect(surface()).toBe("camera");
    expect(amplitude.trackStudySessionCameraPromptAnswered).toHaveBeenCalledExactlyOnceWith({
      choice: "camera",
      roomType: "single",
      faceMask: false,
    });
    expect(amplitude.trackSessionSimpleModeToggled).not.toHaveBeenCalled();
  });

  // 심플 모드에서는 더보기 버튼이 inert라 초점을 못 받으므로 화면 탭 전환 버튼으로 돌린다.
  it.each(["카메라 켜기", "심플 모드로 시작"])(
    "닫히면 초점이 화면 탭 전환 버튼으로 간다(%s)",
    async (name) => {
      renderRoom();

      await userEvent.click(within(prompt()!).getByRole("button", { name }));

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "심플 모드 전환" })).toHaveFocus(),
      );
    },
  );

  it("심플 모드로 시작을 누르면 심플 모드를 지키고, 화면을 탭하면 촬영 화면으로 바뀐다", async () => {
    renderRoom();

    await userEvent.click(within(prompt()!).getByRole("button", { name: "심플 모드로 시작" }));
    expect(prompt()).not.toBeInTheDocument();
    expect(surface()).toBe("simple");
    expect(amplitude.trackStudySessionCameraPromptAnswered).toHaveBeenCalledExactlyOnceWith({
      choice: "simple",
      roomType: "single",
      faceMask: false,
    });

    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));
    expect(surface()).toBe("camera");
    expect(amplitude.trackSessionSimpleModeToggled).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("Escape는 심플 모드로 시작과 같다", async () => {
    renderRoom();

    await userEvent.keyboard("{Escape}");

    expect(prompt()).not.toBeInTheDocument();
    expect(surface()).toBe("simple");
    expect(amplitude.trackStudySessionCameraPromptAnswered).toHaveBeenCalledExactlyOnceWith({
      choice: "simple",
      roomType: "single",
      faceMask: false,
    });
  });

  it("딤을 눌러도 닫히지 않는다", async () => {
    renderRoom();
    const dim = document.querySelector<HTMLElement>(
      '[data-state="open"]:not([role="alertdialog"])',
    );
    if (dim === null) throw new Error("딤을 찾지 못했다");

    await userEvent.click(dim);

    expect(prompt()).toBeInTheDocument();
    expect(amplitude.trackStudySessionCameraPromptAnswered).not.toHaveBeenCalled();
  });

  it("세션 화면마다 한 번만 묻는다", async () => {
    renderRoom();
    await userEvent.click(within(prompt()!).getByRole("button", { name: "심플 모드로 시작" }));

    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));
    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));
    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "도움말 보기" }));
    await finishHelp();

    expect(prompt()).not.toBeInTheDocument();
    expect(amplitude.trackStudySessionCameraPromptShown).toHaveBeenCalledOnce();
  });

  it("브라우저 단독처럼 신원이 없어도 바로 묻는다", () => {
    renderRoom("/room/7");

    expect(prompt()).toBeInTheDocument();
    expect(surface()).toBe("simple");
    expect(amplitude.trackStudySessionCameraPromptShown).toHaveBeenCalledExactlyOnceWith("single");
  });

  it("신원이 늦게 도착하면 그때 묻는다", () => {
    const { source, arrive } = pendingSource();
    mocks.source = source;
    renderRoom("/room/7");
    expect(prompt()).not.toBeInTheDocument();

    act(() => {
      arrive(1);
    });

    expect(prompt()).toBeInTheDocument();
  });

  it("출처가 있으면 첫 토큰을 기다리고, 신원 없이 확정돼도 그때 묻는다", () => {
    const { source, arrive } = pendingSource();
    mocks.source = source;
    renderRoom("/room/7");
    expect(prompt()).not.toBeInTheDocument();

    act(() => {
      arrive(null);
    });

    expect(prompt()).toBeInTheDocument();
  });

  it("초대 확인 창이 열린 채 마운트되면 닫힐 때까지 묻지 않는다", async () => {
    const { source, arrive } = pendingSource();
    mocks.source = source;
    renderRoom("/room/7");
    // 게이트가 세션 화면을 막는 동안 초대가 먼저 도착한 상황
    const entry = (globalThis as unknown as Record<string, (raw: string) => void>)[
      NATIVE_MESSAGE_ENTRY
    ];
    act(() => {
      entry(JSON.stringify({ type: "session-invite", code: "4680", atMs: Date.now() }));
    });

    act(() => {
      arrive(1);
    });
    const invite = await screen.findByRole("alertdialog", {
      name: /초대에 참여할까요/,
    });
    expect(prompt()).not.toBeInTheDocument();

    await userEvent.click(within(invite).getByRole("button", { name: "계속하기" }));

    await waitFor(() => expect(prompt()).toBeInTheDocument());
  });
});
