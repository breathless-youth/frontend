import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as ChannelTalkModule from "@/features/contact-chat/channelTalk";
import { ChannelLoadError, startChannelTalk } from "@/features/contact-chat/channelTalk";
import type { ChannelSession } from "@/features/contact-chat/channelTalk";
import type * as TokenSourceModule from "@/lib/auth/tokenSource";
import type { AuthSnapshot, TokenSource } from "@/lib/auth/tokenSource";
import {
  trackContactChatLoadFailed,
  trackContactChatOpened,
  trackErrorRetryPressed,
} from "@/lib/amplitude";
import { exitToPreviousDocument } from "@/lib/hardNavigation";
import { ContactChatPage } from "@/routes/ContactChatPage";

vi.mock("@/features/contact-chat/channelTalk", async (importOriginal) => ({
  ...(await importOriginal<typeof ChannelTalkModule>()),
  startChannelTalk: vi.fn(),
}));
vi.mock("@/lib/hardNavigation", () => ({
  hardNavigate: vi.fn(),
  hardReplace: vi.fn(),
  exitToPreviousDocument: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  trackContactChatOpened: vi.fn(),
  trackContactChatLoadFailed: vi.fn(),
  trackErrorRetryPressed: vi.fn(),
}));
const reportHandled = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sentry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  reportHandled,
}));
// 기본은 출처 없음(브라우저 단독). 신원 대기 테스트만 가짜 출처를 끼운다.
const tokenSourceMock = vi.hoisted(() => ({ source: null as TokenSource | null }));
vi.mock("@/lib/auth/tokenSource", async (importOriginal) => ({
  ...(await importOriginal<typeof TokenSourceModule>()),
  getTokenSource: () => tokenSourceMock.source,
}));

const SEARCH = "?userId=7&appVersion=26.46.0";

function renderPage({ strict = false } = {}) {
  const page = (
    <MemoryRouter initialEntries={[`/contact/chat${SEARCH}`]}>
      <Routes>
        <Route path="/contact/chat" element={<ContactChatPage />} />
      </Routes>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{page}</StrictMode> : page);
}

/** startChannelTalk이 돌려줄 시도 */
function mockAttempt(result: Promise<ChannelSession>) {
  const cancel = vi.fn();
  vi.mocked(startChannelTalk).mockReturnValue({ result, cancel });
  return { cancel };
}

/** 콜백을 붙잡아 두는 가짜 세션 */
function fakeSession() {
  const callbacks: { show?: () => void; hide?: () => void } = {};
  const session: ChannelSession = {
    onShow: vi.fn((cb: () => void) => {
      callbacks.show = cb;
    }),
    onHide: vi.fn((cb: () => void) => {
      callbacks.hide = cb;
    }),
    openChat: vi.fn(),
  };
  return { session, callbacks };
}

/**
 * 첫 auth-token이 아직 안 온 출처
 *
 * deliver를 부르면 토큰이 도착한다.
 */
function createPendingSource() {
  let userId: number | null = null;
  let settled = false;
  const listeners = new Set<(snapshot: AuthSnapshot) => void>();
  const source = {
    getUserId: () => userId,
    getAccessToken: () => Promise.resolve(null),
    getCurrentToken: () => null,
    refresh: () => Promise.resolve(null),
    hasSettled: () => settled,
    subscribe: (listener: (snapshot: AuthSnapshot) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } satisfies TokenSource;
  const deliver = (id: number) => {
    userId = id;
    settled = true;
    for (const listener of [...listeners]) listener({ userId: id, accessToken: "token" });
  };
  return { source, deliver };
}

const never = () => new Promise<ChannelSession>(() => {});

/**
 * 이탈 전 시도 취소 확인
 *
 * 문서 이동은 정리를 기다리지 않아 시도 취소가 이탈 호출보다 먼저여야 한다.
 */
function expectCancelledBeforeExit(cancel: ReturnType<typeof vi.fn>) {
  const cancelledAt = cancel.mock.invocationCallOrder[0];
  const exitedAt = vi.mocked(exitToPreviousDocument).mock.invocationCallOrder[0];
  expect(cancelledAt).toBeDefined();
  expect(cancelledAt!).toBeLessThan(exitedAt!);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  tokenSourceMock.source = null;
});

describe("ContactChatPage", () => {
  it("플러그인 키가 없으면 다시 시도 없이 실패 화면을 보인다", async () => {
    vi.stubEnv("VITE_CHANNEL_PLUGIN_KEY", "");
    renderPage();

    expect(await screen.findByText("상담창을 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
    expect(trackContactChatLoadFailed).toHaveBeenCalledTimes(1);
    expect(trackContactChatLoadFailed).toHaveBeenCalledWith("no_key");
    expect(startChannelTalk).not.toHaveBeenCalled();
    expect(reportHandled).not.toHaveBeenCalled();
  });

  it("StrictMode에서도 키 없음 실패를 한 번만 남긴다", async () => {
    vi.stubEnv("VITE_CHANNEL_PLUGIN_KEY", "");
    renderPage({ strict: true });

    expect(await screen.findByText("상담창을 불러오지 못했어요")).toBeInTheDocument();
    expect(trackContactChatLoadFailed).toHaveBeenCalledTimes(1);
  });

  it("StrictMode에서 첫 시도는 놓고 boot 실패는 한 번만 남긴다", async () => {
    vi.stubEnv("VITE_CHANNEL_PLUGIN_KEY", "test-key");
    const { cancel } = mockAttempt(Promise.reject(new ChannelLoadError("boot")));
    renderPage({ strict: true });

    expect(await screen.findByText("상담창을 불러오지 못했어요")).toBeInTheDocument();
    expect(startChannelTalk).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(trackContactChatLoadFailed).toHaveBeenCalledTimes(1);
    expect(trackContactChatLoadFailed).toHaveBeenCalledWith("boot");
    expect(reportHandled).toHaveBeenCalledTimes(1);
  });

  it("키가 있으면 로딩 문구를 보이고 익명 프로필로 한 번 boot한다", async () => {
    vi.stubEnv("VITE_CHANNEL_PLUGIN_KEY", "test-key");
    mockAttempt(never());
    renderPage();

    expect(await screen.findByRole("status")).toHaveTextContent("상담창을 불러오는 중");
    await waitFor(() => expect(startChannelTalk).toHaveBeenCalledTimes(1));
    const options = vi.mocked(startChannelTalk).mock.calls[0]![0];
    expect(options).toMatchObject({ pluginKey: "test-key", language: "ko", appearance: "system" });
    expect(Object.keys(options.profile).sort()).toEqual([
      "appUserId",
      "appVersion",
      "locale",
      "platform",
    ]);
    expect(options.profile).toMatchObject({ appUserId: 7, locale: "ko", platform: "web" });
  });

  it("신원이 정해지기 전에는 boot하지 않는다", async () => {
    vi.stubEnv("VITE_CHANNEL_PLUGIN_KEY", "test-key");
    mockAttempt(never());
    const pending = createPendingSource();
    tokenSourceMock.source = pending.source;
    renderPage();

    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(startChannelTalk).not.toHaveBeenCalled();

    act(() => pending.deliver(42));
    await waitFor(() => expect(startChannelTalk).toHaveBeenCalledTimes(1));
    expect(vi.mocked(startChannelTalk).mock.calls[0]![0].profile).toMatchObject({
      appUserId: 42,
    });
  });

  it("세션이 열리면 상담창을 열고 열림을 한 번 남긴다", async () => {
    vi.stubEnv("VITE_CHANNEL_PLUGIN_KEY", "test-key");
    const { session, callbacks } = fakeSession();
    mockAttempt(Promise.resolve(session));
    renderPage();

    await waitFor(() => expect(session.openChat).toHaveBeenCalledTimes(1));
    callbacks.show?.();
    expect(trackContactChatOpened).toHaveBeenCalledTimes(1);
  });

  it("상담창을 닫으면 상담을 끈 뒤 이전 문서로 돌아간다", async () => {
    vi.stubEnv("VITE_CHANNEL_PLUGIN_KEY", "test-key");
    const { session, callbacks } = fakeSession();
    const { cancel } = mockAttempt(Promise.resolve(session));
    renderPage();

    await waitFor(() => expect(callbacks.hide).toBeDefined());
    callbacks.hide?.();
    expect(exitToPreviousDocument).toHaveBeenCalledWith("/home", SEARCH);
    expectCancelledBeforeExit(cancel);
  });

  it("boot가 실패하면 다시 시도할 수 있다", async () => {
    vi.stubEnv("VITE_CHANNEL_PLUGIN_KEY", "test-key");
    mockAttempt(Promise.reject(new ChannelLoadError("boot")));
    renderPage();

    expect(await screen.findByText("상담창을 불러오지 못했어요")).toBeInTheDocument();
    expect(trackContactChatLoadFailed).toHaveBeenCalledWith("boot");
    expect(reportHandled).toHaveBeenCalledWith(expect.any(ChannelLoadError), "contact-chat-load");

    mockAttempt(never());
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(trackErrorRetryPressed).toHaveBeenCalledWith("contact_chat");
    await waitFor(() => expect(startChannelTalk).toHaveBeenCalledTimes(2));
  });

  it("스크립트를 받지 못하면 실패 화면을 보이고 다시 시도할 수 있다", async () => {
    vi.stubEnv("VITE_CHANNEL_PLUGIN_KEY", "test-key");
    mockAttempt(Promise.reject(new ChannelLoadError("script")));
    renderPage();

    expect(await screen.findByText("상담창을 불러오지 못했어요")).toBeInTheDocument();
    expect(trackContactChatLoadFailed).toHaveBeenCalledTimes(1);
    expect(trackContactChatLoadFailed).toHaveBeenCalledWith("script");
    expect(reportHandled).toHaveBeenCalledTimes(1);
    expect(reportHandled).toHaveBeenCalledWith(expect.any(ChannelLoadError), "contact-chat-load");

    mockAttempt(never());
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(trackErrorRetryPressed).toHaveBeenCalledWith("contact_chat");
    await waitFor(() => expect(startChannelTalk).toHaveBeenCalledTimes(2));
  });

  it("상담창이 열리면 우리 뒤로 가기 줄을 그리지 않는다", async () => {
    vi.stubEnv("VITE_CHANNEL_PLUGIN_KEY", "test-key");
    const { session } = fakeSession();
    mockAttempt(Promise.resolve(session));
    renderPage();

    await waitFor(() => expect(session.openChat).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "뒤로 가기" })).not.toBeInTheDocument();
  });

  it("불러오는 중과 실패 화면에는 뒤로 가기 줄이 있다", async () => {
    vi.stubEnv("VITE_CHANNEL_PLUGIN_KEY", "test-key");
    mockAttempt(never());
    const { unmount } = renderPage();
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "뒤로 가기" })).toBeInTheDocument();
    unmount();

    mockAttempt(Promise.reject(new ChannelLoadError("boot")));
    renderPage();
    expect(await screen.findByText("상담창을 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "뒤로 가기" })).toBeInTheDocument();
  });

  it("헤더 뒤로 가기는 시도를 놓은 뒤 이전 문서로 돌아간다", async () => {
    vi.stubEnv("VITE_CHANNEL_PLUGIN_KEY", "test-key");
    const { cancel } = mockAttempt(never());
    renderPage();

    await waitFor(() => expect(startChannelTalk).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("button", { name: "뒤로 가기" }));
    expect(exitToPreviousDocument).toHaveBeenCalledWith("/home", SEARCH);
    expectCancelledBeforeExit(cancel);
  });

  it("문서가 숨겨지면 시도를 놓는다", async () => {
    vi.stubEnv("VITE_CHANNEL_PLUGIN_KEY", "test-key");
    const { cancel } = mockAttempt(never());
    renderPage();

    await waitFor(() => expect(startChannelTalk).toHaveBeenCalled());
    window.dispatchEvent(new Event("pagehide"));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("화면을 벗어나면 시도를 취소한다", async () => {
    vi.stubEnv("VITE_CHANNEL_PLUGIN_KEY", "test-key");
    const { session } = fakeSession();
    const { cancel } = mockAttempt(Promise.resolve(session));
    const { unmount } = renderPage();

    await waitFor(() => expect(session.openChat).toHaveBeenCalled());
    unmount();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  describe("실제 채널톡 모듈", () => {
    afterEach(async () => {
      const actual = await vi.importActual<typeof ChannelTalkModule>(
        "@/features/contact-chat/channelTalk",
      );
      actual.__resetChannelTalkForTests();
    });

    it("boot 중에 화면을 벗어나면 콜백을 기다리지 않고 바로 상담을 끈다", async () => {
      vi.stubEnv("VITE_CHANNEL_PLUGIN_KEY", "test-key");
      const actual = await vi.importActual<typeof ChannelTalkModule>(
        "@/features/contact-chat/channelTalk",
      );
      vi.mocked(startChannelTalk).mockImplementation(actual.startChannelTalk);
      // 스크립트가 실행되지 않으면 SDK 호출은 공식 스니펫의 큐에 쌓인다.
      const queued = (name: string) =>
        ((window.ChannelIO?.q ?? []) as unknown[][]).filter((args) => args[0] === name);
      const { unmount } = renderPage({ strict: true });

      const script = await waitFor(() => {
        const el = document.querySelector("script[src*='ch-plugin-web.js']");
        expect(el).not.toBeNull();
        return el!;
      });
      script.dispatchEvent(new Event("load"));
      // StrictMode의 첫 시도는 스크립트가 뜨기 전에 놓여 boot까지 가지 않는다.
      await waitFor(() => expect(queued("boot")).toHaveLength(1));
      unmount();
      expect(queued("clearCallbacks")).toHaveLength(1);
      expect(queued("shutdown")).toHaveLength(1);

      (queued("boot")[0]![2] as (error: unknown) => void)(null);
      await Promise.resolve();

      expect(queued("shutdown")).toHaveLength(1);
      expect(queued("openChat")).toHaveLength(0);
    });
  });
});
