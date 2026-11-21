import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Toaster } from "@/components/ui/sonner";
import { PcShell } from "@/desktop/PcShell";
import type * as amplitude from "@/lib/amplitude";
import type * as tokenSourceModule from "@/lib/auth/tokenSource";
import i18n from "@/lib/i18n";
import { getProfile } from "@/lib/profileApi";
import type * as userIdModule from "@/lib/userId";

const identity = vi.hoisted(() => ({ userId: null as number | null }));
vi.mock("@/lib/userId", async (original) => ({
  ...(await original<typeof userIdModule>()),
  useUserId: () => identity.userId,
}));
vi.mock("@/lib/profileApi", () => ({ getProfile: vi.fn() }));

const logoutBrowserGuest = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
vi.mock("@/lib/auth/tokenSource", async (original) => ({
  ...(await original<typeof tokenSourceModule>()),
  logoutBrowserGuest,
}));

const trackTabPressed = vi.hoisted(() => vi.fn());
const resetAmplitudeUser = vi.hoisted(() => vi.fn());
const setAmplitudeUserId = vi.hoisted(() => vi.fn());
vi.mock("@/lib/amplitude", async (original) => ({
  ...(await original<typeof amplitude>()),
  trackTabPressed,
  resetAmplitudeUser,
  setAmplitudeUserId,
}));

function Where() {
  const navigate = useNavigate();
  return (
    <>
      <p data-testid="where">{useLocation().pathname}</p>
      <p data-testid="search">{useLocation().search}</p>
      <button type="button" onClick={() => navigate(-1)}>
        뒤로
      </button>
    </>
  );
}

function renderShell(path = "/home") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Toaster />
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<PcShell />}>
            <Route path="*" element={<Where />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(async () => {
  await i18n.changeLanguage("ko");
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  identity.userId = null;
  window.history.replaceState(null, "", "/");
});

function signIn(loginProvider: "KAKAO" | null) {
  identity.userId = 7;
  vi.mocked(getProfile).mockResolvedValue({
    nickname: "열공곰",
    goal: null,
    category: null,
    initial: "열",
    colorIndex: 0,
    profileImageUrl: null,
    loginProvider,
  });
}

/** 앱 웹뷰처럼 브리지를 둔다. 없으면 브라우저로 본다. */
function inApp() {
  vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
}

async function openProfileMenu() {
  await userEvent.click(screen.getByRole("button", { name: "프로필 메뉴" }));
  return screen.findByRole("menu");
}

describe("PcShell 브랜드", () => {
  it("한국어는 포커스메이커스로 붙여 쓴다", () => {
    renderShell();

    expect(screen.getByText("포커스메이커스")).toBeInTheDocument();
  });

  it("다른 언어는 FocusMakers로 쓴다", async () => {
    await i18n.changeLanguage("ja");

    renderShell();

    expect(screen.getByText("FocusMakers")).toBeInTheDocument();
  });
});

describe("PcShell 상단 바", () => {
  it("상단 바는 글자 선택과 그림 끌기에서 빼고 페이지 상자는 그대로 둔다", () => {
    renderShell("/records");

    expect(screen.getByRole("banner")).toHaveClass("session-no-drag");
    expect(screen.getByTestId("where").closest(".session-no-drag")).toBeNull();
  });
});

describe("PcShell 탭", () => {
  it("첫 출시 동안 상단 바에는 홈 탭 하나만 보인다", () => {
    renderShell("/home");

    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["홈"]);
  });

  it.each(["/home", "/planner?from=home", "/planner"])(
    "%s에서는 홈 탭을 현재 화면으로 표시한다",
    (path) => {
      renderShell(path);

      expect(screen.getByRole("link", { name: "홈" })).toHaveAttribute("aria-current", "page");
    },
  );

  it.each([
    "/records",
    "/social/groups/123",
    "/ranking/records",
    "/planner?from=records&date=2026-11-17",
  ])("숨긴 탭의 화면 %s에서는 홈 탭을 현재로 표시하지 않는다", (path) => {
    renderShell(path);

    expect(screen.getByRole("link", { name: "홈" })).not.toHaveAttribute("aria-current");
  });

  it("홈 탭을 누르면 홈으로 이동한다", async () => {
    renderShell("/records");

    await userEvent.click(screen.getByRole("link", { name: "홈" }));

    expect(screen.getByTestId("where")).toHaveTextContent("/home");
  });

  it("키보드만으로 홈 탭에 가서 Enter로 이동한다", async () => {
    renderShell("/records");

    await userEvent.tab();
    expect(screen.getByRole("link", { name: "홈" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    expect(screen.getByTestId("where")).toHaveTextContent("/home");
  });

  it("구 앱 신원 쿼리는 다른 탭으로 들고 가고 화면 전용 쿼리는 버린다", async () => {
    window.history.replaceState(null, "", "/planner?userId=7&from=records&date=2026-11-17");
    renderShell("/planner?userId=7&from=records&date=2026-11-17");

    await userEvent.click(screen.getByRole("link", { name: "홈" }));

    expect(screen.getByTestId("search")).toHaveTextContent(/^\?userId=7$/);
  });

  it("탭 이동을 모바일 탭 바와 같은 이벤트로 남기고 PC 상단 바 경로를 구분한다", async () => {
    renderShell("/social/groups/1");

    await userEvent.click(screen.getByRole("link", { name: "홈" }));

    expect(trackTabPressed).toHaveBeenCalledExactlyOnceWith({
      tab: "home",
      from_tab: "social",
      via: "pc_top_bar",
    });
  });

  it("키보드 단축키와 핀치·Ctrl+휠로는 페이지를 확대·축소하지 않는다", () => {
    renderShell();

    for (const key of ["+", "=", "-", "0"]) {
      expect(fireEvent.keyDown(window, { key, metaKey: true })).toBe(false);
      expect(fireEvent.keyDown(window, { key, ctrlKey: true })).toBe(false);
    }
    // 트랙패드 핀치는 Chrome에서 ctrlKey가 켜진 휠로, Safari에서 gesturestart로 온다.
    expect(fireEvent.wheel(window, { deltaY: 10, ctrlKey: true })).toBe(false);
    expect(fireEvent(window, new Event("gesturestart", { cancelable: true }))).toBe(false);
  });

  it("확대·축소가 아닌 키와 보통 휠은 막지 않는다", () => {
    renderShell();

    expect(fireEvent.keyDown(window, { key: "+" })).toBe(true);
    expect(fireEvent.keyDown(window, { key: "c", metaKey: true })).toBe(true);
    expect(fireEvent.keyDown(window, { key: "-", metaKey: true, altKey: true })).toBe(true);
    expect(fireEvent.wheel(window, { deltaY: 10 })).toBe(true);
  });

  it("홈에서는 페이지 상자가 스크롤되지 않는다", () => {
    renderShell("/home");

    expect(screen.getByTestId("where").parentElement).toHaveClass("overflow-hidden");
  });

  it("홈 밖의 화면에서는 페이지 상자가 스크롤된다", () => {
    renderShell("/records");

    expect(screen.getByTestId("where").parentElement).toHaveClass("overflow-y-auto");
  });

  it("다른 화면으로 옮기면 페이지 상자 스크롤을 맨 위로 올린다", async () => {
    renderShell("/records");
    const scroller = screen.getByTestId("where").parentElement!;
    scroller.scrollTop = 200;

    await userEvent.click(screen.getByRole("link", { name: "홈" }));

    expect(scroller.scrollTop).toBe(0);
  });

  it("뒤로 가기로 돌아와도 페이지 상자 스크롤을 맨 위로 올린다", async () => {
    renderShell("/records");
    await userEvent.click(screen.getByRole("link", { name: "홈" }));
    const scroller = screen.getByTestId("where").parentElement!;
    scroller.scrollTop = 200;

    await userEvent.click(screen.getByRole("button", { name: "뒤로" }));

    expect(screen.getByTestId("where")).toHaveTextContent("/records");
    expect(scroller.scrollTop).toBe(0);
  });

  it("지금 탭을 다시 누르면 탭 이동으로 세지 않는다", async () => {
    renderShell("/home");

    await userEvent.click(screen.getByRole("link", { name: "홈" }));

    expect(trackTabPressed).not.toHaveBeenCalled();
  });
});

describe("PcShell 프로필 메뉴", () => {
  it("앱에서 소셜 로그인한 사람에게는 닉네임을 보이고 로그인·로그아웃은 두지 않는다", async () => {
    inApp();
    signIn("KAKAO");
    renderShell();

    const menu = await openProfileMenu();

    expect(await within(menu).findByText("열공곰")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /내 정보/ })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "로그아웃" })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "로그인" })).not.toBeInTheDocument();
  });

  it("앱에서 비회원에게는 로그인을 보인다", async () => {
    inApp();
    signIn(null);
    renderShell();

    const menu = await openProfileMenu();

    expect(await within(menu).findByText("열공곰")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "로그인" })).toBeInTheDocument();
  });

  it("브라우저의 비회원에게는 로그인을 보이지 않는다", async () => {
    signIn(null);
    renderShell();

    const menu = await openProfileMenu();

    expect(await within(menu).findByText("열공곰")).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "로그인" })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "로그아웃" })).not.toBeInTheDocument();
  });

  it("브라우저의 소셜 회원은 로그아웃을 눌러 새 비회원이 되고 안내를 본다", async () => {
    signIn("KAKAO");
    renderShell();

    const menu = await openProfileMenu();
    await within(menu).findByText("열공곰");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "로그아웃" }));

    expect(logoutBrowserGuest).toHaveBeenCalledTimes(1);
    expect(resetAmplitudeUser).toHaveBeenCalledTimes(1);
    expect(resetAmplitudeUser.mock.invocationCallOrder[0]).toBeLessThan(
      logoutBrowserGuest.mock.invocationCallOrder[0]!,
    );
    expect(await screen.findByText("로그아웃 되었어요")).toBeInTheDocument();
  });

  it("로그아웃이 이전 회원을 남긴 채 실패하면 다시 시도하라고 안내한다", async () => {
    logoutBrowserGuest.mockResolvedValueOnce(false);
    signIn("KAKAO");
    renderShell();

    const menu = await openProfileMenu();
    await within(menu).findByText("열공곰");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "로그아웃" }));

    expect(await screen.findByText("잠시 후 다시 시도해 주세요")).toBeInTheDocument();
    expect(screen.queryByText("로그아웃 되었어요")).not.toBeInTheDocument();
    expect(setAmplitudeUserId).toHaveBeenCalledWith(expect.any(Number));
  });

  it("신원이 없는 앱 화면에서도 메뉴가 열리고 로그인을 보인다", async () => {
    inApp();
    renderShell();

    const menu = await openProfileMenu();

    expect(within(menu).getByRole("menuitem", { name: "로그인" })).toBeInTheDocument();
    expect(getProfile).not.toHaveBeenCalled();
  });

  it("내 정보를 누르면 설정 화면으로 간다", async () => {
    renderShell();

    const menu = await openProfileMenu();
    await userEvent.click(within(menu).getByRole("menuitem", { name: /내 정보/ }));

    expect(screen.getByTestId("where")).toHaveTextContent("/settings");
  });

  it("앱에서 로그인을 누르면 설정의 로그인 화면으로 간다", async () => {
    inApp();
    renderShell();

    const menu = await openProfileMenu();
    await userEvent.click(within(menu).getByRole("menuitem", { name: "로그인" }));

    expect(screen.getByTestId("where")).toHaveTextContent("/settings/login");
  });

  it("앱에서 프로필 요청이 실패해도 메뉴가 열리고 로그인을 보인다", async () => {
    inApp();
    identity.userId = 7;
    vi.mocked(getProfile).mockRejectedValue(new Error("network"));
    renderShell();
    await waitFor(() => expect(getProfile).toHaveBeenCalled());

    const menu = await openProfileMenu();

    expect(within(menu).getByRole("menuitem", { name: "로그인" })).toBeInTheDocument();
  });

  it("키보드로 메뉴를 열고 방향키로 항목을 옮긴다", async () => {
    inApp();
    renderShell();
    screen.getByRole("button", { name: "프로필 메뉴" }).focus();

    await userEvent.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    await waitFor(() =>
      expect(within(menu).getByRole("menuitem", { name: /내 정보/ })).toHaveFocus(),
    );
    await userEvent.keyboard("{ArrowDown}");

    expect(within(menu).getByRole("menuitem", { name: "로그인" })).toHaveFocus();
  });

  it("Space로도 메뉴가 열린다", async () => {
    renderShell();
    screen.getByRole("button", { name: "프로필 메뉴" }).focus();

    await userEvent.keyboard(" ");

    expect(await screen.findByRole("menu")).toBeInTheDocument();
  });

  it("메뉴 바깥을 누르면 메뉴가 닫힌다", async () => {
    renderShell();

    await openProfileMenu();
    // 메뉴가 열린 동안 Radix가 바깥에 pointer-events: none을 걸어서 그 검사만 끄고 누른다.
    await userEvent
      .setup({ pointerEventsCheck: 0 })
      .pointer({ keys: "[MouseLeft]", target: screen.getByTestId("where") });

    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("Esc를 누르면 메뉴가 닫힌다", async () => {
    renderShell();

    await openProfileMenu();
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

/** 창 폭을 흉내 내는 matchMedia. 쿼리의 min-width를 rem으로 읽어 지금 폭과 비교한다. */
function stubWidth(initialWidth: number) {
  let width = initialWidth;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => {
    const rem = /min-width:\s*([\d.]+)rem/.exec(query);
    const min = rem ? Number(rem[1]) * 16 : Number.POSITIVE_INFINITY;
    return {
      media: query,
      get matches() {
        return width >= min;
      },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    };
  });
  return (next: number) => {
    width = next;
    act(() => {
      for (const listener of listeners) listener();
    });
  };
}

describe("PcShell 좁은 창", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("960보다 좁으면 상자를 덮고 내용은 지우지 않은 채 막아 둔다", () => {
    const resize = stubWidth(900);
    renderShell("/home");
    const page = screen.getByTestId("where");

    expect(screen.getByRole("status")).toHaveTextContent(i18n.t("desktop:shell.narrow"));
    expect(page.closest("[inert]")).not.toBeNull();

    resize(1200);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByTestId("where")).toBe(page);
    expect(page.closest("[inert]")).toBeNull();
  });

  it("960 이상이면 덮개가 없다", () => {
    stubWidth(960);
    renderShell("/home");

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
