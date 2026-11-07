import type { SocialLoginProvider } from "@focusmakers/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import type * as LazyRoutes from "@/routes/lazyRoutes";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { __resetGroupRoomsForTests } from "@/lib/groupRoomCapability";
import { __resetNativeSocialLoginForTests } from "@/lib/nativeSocialLogin";
import { __resetNativeAccountForTests } from "@/lib/nativeAccount";
import { getProfile } from "@/lib/profileApi";
import { showToast } from "@/lib/toast";
import { SettingsPage } from "@/routes/SettingsPage";

vi.mock("@/lib/profileApi");
vi.mock("@/lib/interviewApi", () => ({
  getInterviewStatus: vi.fn(async () => ({
    cardEligible: false,
    cardUrl: null,
    settingsEnabled: false,
    settingsUrl: null,
  })),
}));
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));

const analytics = vi.hoisted(() => ({
  trackSettingsRowPressed: vi.fn(),
  trackAccountDeletionFailed: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  ...analytics,
}));

vi.mock("@/routes/lazyRoutes", async (importOriginal) => ({
  ...(await importOriginal<typeof LazyRoutes>()),
  prefetchSettingsSubPages: vi.fn(),
  prefetchBlockListPage: vi.fn(),
}));

const PROFILE = {
  nickname: "열공곰",
  goal: null,
  category: null,
  initial: "열",
  colorIndex: 0,
  profileImageUrl: null,
};

const postMessage = vi.fn();

/** 웹이 앱에 보낸 메시지 가운데 계정 요청만 */
function accountRequests(): { type: string; id: string; provider?: string }[] {
  return postMessage.mock.calls
    .map((call) => JSON.parse(call[0] as string) as { type: string; id: string })
    .filter((message) => message.type === "logout" || message.type === "delete-account");
}

function reply(message: Record<string, unknown>) {
  act(() => {
    (globalThis as unknown as Record<string, (raw: string) => void>)[NATIVE_MESSAGE_ENTRY](
      JSON.stringify({ atMs: 1, ...message }),
    );
  });
}

/**
 * 앱 웹뷰의 설정 화면
 *
 * 신원은 주소의 `userId`로 주고, 로그인 공급자는 프로필 응답으로 준다.
 * 계정 메뉴 표시는 창 주소에서 읽어서 창 기록에도 같은 주소를 넣고 기억한 판정을 비운다.
 */
function renderSettings({
  loginProvider,
  flag = true,
  social = false,
}: {
  loginProvider: SocialLoginProvider | null;
  flag?: boolean;
  social?: boolean;
}) {
  vi.mocked(getProfile).mockResolvedValue({ ...PROFILE, loginProvider });
  const path = `/settings?userId=1${flag ? "&accountActions=1" : ""}${social ? "&socialLogin=GOOGLE" : ""}`;
  window.history.replaceState(null, "", path);
  __resetGroupRoomsForTests();
  __resetNativeAccountForTests();
  __resetNativeSocialLoginForTests();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("ReactNativeWebView", { postMessage });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
  __resetNativeAccountForTests();
});

describe("설정 계정 섹션", () => {
  it("소셜 로그인 지원 앱의 비회원에게 로그인하기를 보인다", async () => {
    renderSettings({ loginProvider: null, social: true });
    expect(await screen.findByRole("button", { name: "로그인하기" })).toBeInTheDocument();
  });

  it("로그인한 사용자에게 로그인하기를 보이지 않는다", async () => {
    renderSettings({ loginProvider: "GOOGLE", social: true });
    expect(await screen.findByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "로그인하기" })).toBeNull();
  });
  it("비회원에게는 보이지 않는다", async () => {
    renderSettings({ loginProvider: null });

    await waitFor(() => expect(getProfile).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByText("계정")).toBeNull();
    expect(screen.queryByRole("button", { name: "로그아웃" })).toBeNull();
  });

  it("로그인했어도 앱이 accountActions를 알리지 않으면 보이지 않는다", async () => {
    renderSettings({ loginProvider: "GOOGLE", flag: false });

    await act(async () => {});
    expect(screen.queryByText("계정")).toBeNull();
    expect(screen.queryByRole("button", { name: "계정 삭제" })).toBeNull();
  });

  it("로그인했고 앱이 알렸으면 로그아웃과 계정 삭제를 보인다", async () => {
    renderSettings({ loginProvider: "GOOGLE" });

    expect(await screen.findByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "계정 삭제" })).toBeInTheDocument();
    expect(screen.getByText("계정")).toBeInTheDocument();
  });
});

describe("로그아웃", () => {
  it("확인하면 로그인 공급자를 실어 앱에 로그아웃을 한 번만 보내고, 결과가 와도 앱이 문서를 바꿀 때까지 진행 중으로 둔다", async () => {
    renderSettings({ loginProvider: "KAKAO" });

    fireEvent.click(await screen.findByRole("button", { name: "로그아웃" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("로그아웃할까요?")).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "로그아웃" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(accountRequests()).toEqual([
      { type: "logout", id: expect.any(String), provider: "KAKAO", atMs: expect.any(Number) },
    ]);
    expect(confirm).toBeDisabled();

    reply({ type: "logout-result", id: accountRequests()[0]?.id });
    await act(async () => {});
    // 완료 이벤트는 다시 띄운 문서로 넘어가도록 앱이 남긴다.
    expect(confirm).toBeDisabled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("취소하면 아무것도 보내지 않는다", async () => {
    renderSettings({ loginProvider: "KAKAO" });

    fireEvent.click(await screen.findByRole("button", { name: "로그아웃" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "취소" }));

    expect(accountRequests()).toEqual([]);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });
});

describe("계정 삭제", () => {
  it("확인하면 로그인 공급자를 실어 앱에 삭제를 보낸다", async () => {
    renderSettings({ loginProvider: "APPLE" });

    fireEvent.click(await screen.findByRole("button", { name: "계정 삭제" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("계정을 삭제할까요?")).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "삭제하기" });
    expect(confirm).toHaveAttribute("data-tone", "danger");
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(accountRequests()).toEqual([
      {
        type: "delete-account",
        id: expect.any(String),
        provider: "APPLE",
        atMs: expect.any(Number),
      },
    ]);

    reply({ type: "delete-account-result", id: accountRequests()[0]?.id, status: "success" });
    await act(async () => {});
    expect(confirm).toBeDisabled();
    expect(showToast).not.toHaveBeenCalled();
    expect(analytics.trackAccountDeletionFailed).not.toHaveBeenCalled();
  });

  it("실패하면 오류 토스트를 띄우고 계정 섹션에 그대로 머문다", async () => {
    renderSettings({ loginProvider: "GOOGLE" });

    fireEvent.click(await screen.findByRole("button", { name: "계정 삭제" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "삭제하기" }),
    );
    reply({
      type: "delete-account-result",
      id: accountRequests()[0]?.id,
      status: "failed",
      code: "NETWORK",
    });

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "계정을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요",
      ),
    );
    expect(analytics.trackAccountDeletionFailed).toHaveBeenCalledWith({
      provider: "GOOGLE",
      reason: "NETWORK",
    });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByRole("button", { name: "계정 삭제" })).toBeEnabled();
  });

  it("애플 창을 닫아 취소되면 토스트 없이 설정에 머문다", async () => {
    renderSettings({ loginProvider: "APPLE" });

    fireEvent.click(await screen.findByRole("button", { name: "계정 삭제" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "삭제하기" }),
    );
    reply({ type: "delete-account-result", id: accountRequests()[0]?.id, status: "cancelled" });

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(showToast).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "계정 삭제" })).toBeInTheDocument();
  });
});
