import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Location } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import type { LoginEntry } from "@/lib/amplitude";
import {
  trackLoginScreenViewed,
  trackSocialLoginCancelled,
  trackSocialLoginFailed,
  trackSocialLoginSucceeded,
  trackSocialLoginTapped,
} from "@/lib/amplitude";
import { nativeSocialLoginProviders, requestNativeSocialLogin } from "@/lib/nativeSocialLogin";
import type * as NativeSocialLogin from "@/lib/nativeSocialLogin";
import type { NativeSocialLoginResult } from "@/lib/nativeSocialLogin";
import { __resetAuthSuccessToastForTests } from "@/lib/authSuccessToast";
import { profileKeys } from "@/lib/profileQueries";
import { showToast } from "@/lib/toast";
import { LocationProbe } from "@/test/LocationProbe";

import { GroupLoginScreen } from "../GroupLoginScreen";

vi.mock("@/lib/nativeSocialLogin", async (importOriginal) => ({
  ...(await importOriginal<typeof NativeSocialLogin>()),
  nativeSocialLoginProviders: vi.fn(() => ["GOOGLE", "KAKAO", "APPLE"]),
  requestNativeSocialLogin: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackLoginScreenViewed: vi.fn(),
  trackSocialLoginSucceeded: vi.fn(),
  trackSocialLoginFailed: vi.fn(),
  trackSocialLoginTapped: vi.fn(),
  trackSocialLoginCancelled: vi.fn(),
}));

afterEach(() => {
  __resetAuthSuccessToastForTests();
  vi.clearAllMocks();
  vi.mocked(nativeSocialLoginProviders).mockReturnValue(["GOOGLE", "KAKAO", "APPLE"]);
});

/**
 * 로그인 화면 그리기
 *
 * `leave`는 게이트가 회원으로 바뀌어 같은 주소에서 이 화면을 내린 때처럼 다시 그린다.
 * `location`은 앱 안에서 이동한 지금 주소다.
 */
function renderScreen({
  path = "/social",
  entry = "tab",
}: { path?: string; entry?: LoginEntry } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let current: Location | null = null;
  const tree = (shown: boolean) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/profile" element={<p>프로필 화면</p>} />
          <Route path="*" element={shown ? <GroupLoginScreen entry={entry} /> : <p>그룹 화면</p>} />
        </Routes>
        <LocationProbe
          onLocation={(location) => {
            current = location;
          }}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const { rerender } = render(tree(true));
  return { client, leave: () => rerender(tree(false)), location: () => current };
}

describe("그룹 로그인 화면", () => {
  it("앱이 알린 공급자만 Google, Apple, 카카오 순서로 보인다", () => {
    vi.mocked(nativeSocialLoginProviders).mockReturnValue(["KAKAO", "GOOGLE"]);
    renderScreen();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Google로 계속하기",
      "카카오로 계속하기",
    ]);
  });

  it("세 공급자를 모두 알리면 시안 순서대로 세 버튼이다", () => {
    renderScreen();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Google로 계속하기",
      "Apple로 계속하기",
      "카카오로 계속하기",
    ]);
  });

  it("동의 문구의 이용약관과 개인정보 처리방침은 각 문서로 가는 링크다", () => {
    renderScreen();
    expect(screen.getByText(/로그인하면 만 14세 이상임을 확인하고/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "이용약관" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "개인정보 처리방침" })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });

  it("동의 문구는 화면 폭과 상관없이 14세 확인 다음 줄에서 약관 동의가 시작된다", () => {
    renderScreen();
    const consent = screen.getByText(/로그인하면 만 14세 이상임을 확인하고/);
    expect(consent.textContent?.split("\n")).toEqual([
      "로그인하면 만 14세 이상임을 확인하고,",
      "이용약관과 개인정보 처리방침에 동의하게 돼요",
    ]);
  });

  it("기록 이어가기 안내를 보이지 않는다", () => {
    renderScreen();
    expect(
      screen.queryByText("지금까지의 기록이 로그인한 계정에 그대로 이어져요"),
    ).not.toBeInTheDocument();
  });

  it("탭 첫 화면에는 뒤로 가기가 없다", () => {
    renderScreen();
    expect(screen.queryByRole("button", { name: "뒤로 가기" })).not.toBeInTheDocument();
  });

  it("초대 참여처럼 탭 첫 화면이 아니면 뒤로 가기가 있다", () => {
    renderScreen({ path: "/social/join?code=K7Q2MX", entry: "invite" });
    expect(screen.getByRole("button", { name: "뒤로 가기" })).toBeInTheDocument();
  });

  it("화면이 보이면 들어온 곳을 실어 한 번 알린다", () => {
    renderScreen({ path: "/social/groups/11", entry: "group" });
    expect(trackLoginScreenViewed).toHaveBeenCalledTimes(1);
    expect(trackLoginScreenViewed).toHaveBeenCalledWith("group");
  });

  it("서비스 이름을 제목으로 보인다", () => {
    renderScreen();
    expect(screen.getByRole("heading", { level: 1, name: "포커스 메이커스" })).toBeInTheDocument();
  });

  it("마스코트 그림은 스크린 리더에 읽히지 않는다", () => {
    renderScreen();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });
});

describe("그룹 로그인 결과", () => {
  /** 앱이 이 결과로 답하는 로그인 요청 */
  function answerWith(result: NativeSocialLoginResult) {
    vi.mocked(requestNativeSocialLogin).mockResolvedValue(result);
  }

  async function press(name: string) {
    await userEvent.setup().click(screen.getByRole("button", { name }));
  }

  /** 게이트가 보고 있는 것처럼 비회원 프로필을 켜 두고, 다시 받기는 `load`에 맡긴다 */
  function watchProfile(client: QueryClient, load: () => Promise<never>) {
    client.setQueryData(profileKeys.detail(1), { loginProvider: null });
    new QueryObserver(client, {
      queryKey: profileKeys.detail(1),
      queryFn: load,
      retry: false,
    }).subscribe(() => {});
  }

  it("설정에서 로그인하면 홈 이동 없이 설정에 남아 성공을 한 번 알린다", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    answerWith({ status: "success", isNewUser: false });
    const view = renderScreen({ path: "/settings/login", entry: "settings" });
    await press("Google로 계속하기");
    await waitFor(() => expect(view.location()?.pathname).toBe("/settings"));
    expect(postMessage).not.toHaveBeenCalledWith(expect.stringContaining('"type":"navigate-home"'));
    expect(showToast).toHaveBeenCalledExactlyOnceWith("로그인을 성공했어요!", {
      persistOnNavigation: true,
    });
    vi.unstubAllGlobals();
  });

  it("앱이 답하기 전에는 모든 버튼을 막는다", async () => {
    vi.mocked(requestNativeSocialLogin).mockReturnValue(new Promise(() => {}));
    renderScreen();
    await press("카카오로 계속하기");
    expect(requestNativeSocialLogin).toHaveBeenCalledWith("KAKAO");
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });

  it("앱이 답하기 전에는 누른 버튼만 진행 중이고 나머지는 막기만 한다", async () => {
    vi.mocked(requestNativeSocialLogin).mockReturnValue(new Promise(() => {}));
    renderScreen();
    await press("카카오로 계속하기");
    expect(screen.getByRole("button", { name: "카카오로 계속하기" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    for (const name of ["Google로 계속하기", "Apple로 계속하기"]) {
      const other = screen.getByRole("button", { name });
      expect(other).toBeDisabled();
      expect(other).not.toHaveAttribute("aria-busy", "true");
    }
  });

  it.each<NativeSocialLoginResult>([
    { status: "cancelled" },
    { status: "failed", code: "INVALID_SOCIAL_TOKEN" },
  ])("$status 답을 받으면 진행 표시를 거둔다", async (result) => {
    answerWith(result);
    renderScreen();
    await press("카카오로 계속하기");
    const button = screen.getByRole("button", { name: "카카오로 계속하기" });
    await waitFor(() => expect(button).toBeEnabled());
    expect(button).not.toHaveAttribute("aria-busy", "true");
  });

  it("로그인에 성공하면 프로필을 다시 받는 동안 진행 표시를 유지한다", async () => {
    answerWith({ status: "success", isNewUser: false });
    const { client } = renderScreen();
    const load = vi.fn(() => new Promise<never>(() => {}));
    watchProfile(client, load);
    await press("Google로 계속하기");
    await waitFor(() => expect(trackSocialLoginSucceeded).toHaveBeenCalled());
    const button = screen.getByRole("button", { name: "Google로 계속하기" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("로그인에 성공했는데 프로필을 다시 받지 못하면 버튼을 다시 연다", async () => {
    answerWith({ status: "success", isNewUser: false });
    const { client } = renderScreen();
    watchProfile(client, () => Promise.reject(new Error("network")));
    await press("Google로 계속하기");
    const button = screen.getByRole("button", { name: "Google로 계속하기" });
    await waitFor(() => expect(button).toBeEnabled());
    expect(button).not.toHaveAttribute("aria-busy", "true");
  });

  it("새로 가입해도 이 화면에 남아 게이트가 바뀌기를 기다린다", async () => {
    answerWith({ status: "success", isNewUser: true });
    const { location } = renderScreen();
    await press("Google로 계속하기");
    await waitFor(() =>
      expect(trackSocialLoginSucceeded).toHaveBeenCalledWith({
        provider: "GOOGLE",
        isNewUser: true,
      }),
    );
    expect(screen.queryByText("프로필 화면")).not.toBeInTheDocument();
    expect(location()?.pathname).toBe("/social");
  });

  it("기존 계정으로 로그인했으면 이 화면에 남아 게이트가 바뀌기를 기다린다", async () => {
    answerWith({ status: "success", isNewUser: false });
    renderScreen();
    await press("Apple로 계속하기");
    await waitFor(() =>
      expect(trackSocialLoginSucceeded).toHaveBeenCalledWith({
        provider: "APPLE",
        isNewUser: false,
      }),
    );
    expect(screen.queryByText("프로필 화면")).not.toBeInTheDocument();
    expect(showToast).toHaveBeenCalledExactlyOnceWith("로그인을 성공했어요!", {
      persistOnNavigation: true,
    });
  });

  it("버튼을 누르면 누른 공급자를 한 번 알린다", async () => {
    answerWith({ status: "cancelled" });
    renderScreen();
    await press("카카오로 계속하기");
    expect(trackSocialLoginTapped).toHaveBeenCalledTimes(1);
    expect(trackSocialLoginTapped).toHaveBeenCalledWith({ provider: "KAKAO" });
  });

  it("로그인 창을 닫으면 취소를 알리고 실패로 세지 않는다", async () => {
    answerWith({ status: "cancelled" });
    renderScreen();
    await press("Apple로 계속하기");
    await waitFor(() =>
      expect(trackSocialLoginCancelled).toHaveBeenCalledWith({ provider: "APPLE" }),
    );
    expect(trackSocialLoginFailed).not.toHaveBeenCalled();
  });

  it("앱이 답하기 전에 다시 눌러도 누름은 한 번만 알린다", async () => {
    vi.mocked(requestNativeSocialLogin).mockReturnValue(new Promise(() => {}));
    renderScreen();
    const button = screen.getByRole("button", { name: "Google로 계속하기" });
    const user = userEvent.setup();
    await user.click(button);
    await user.click(button);
    expect(trackSocialLoginTapped).toHaveBeenCalledTimes(1);
  });

  it("로그인 창을 닫으면 아무것도 하지 않고 버튼을 다시 연다", async () => {
    answerWith({ status: "cancelled" });
    renderScreen();
    await press("카카오로 계속하기");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "카카오로 계속하기" })).toBeEnabled(),
    );
    expect(showToast).not.toHaveBeenCalled();
    expect(trackSocialLoginSucceeded).not.toHaveBeenCalled();
    expect(trackSocialLoginFailed).not.toHaveBeenCalled();
  });

  it("이미 로그인한 계정이라고 답하면 프로필을 다시 받아 확인한다", async () => {
    answerWith({ status: "failed", code: "ALREADY_LINKED" });
    const { client } = renderScreen();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await press("Google로 계속하기");
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: profileKeys.all }));
    expect(showToast).not.toHaveBeenCalled();
    expect(trackSocialLoginFailed).toHaveBeenCalledWith({
      provider: "GOOGLE",
      reason: "ALREADY_LINKED",
    });
  });

  it("공급자 장애면 잠시 후 다시 시도하라고 알린다", async () => {
    answerWith({ status: "failed", code: "SOCIAL_PROVIDER_UNAVAILABLE" });
    renderScreen();
    await press("카카오로 계속하기");
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("잠시 후 다시 시도해 주세요"));
    expect(trackSocialLoginFailed).toHaveBeenCalledWith({
      provider: "KAKAO",
      reason: "SOCIAL_PROVIDER_UNAVAILABLE",
    });
  });

  it("그 밖의 실패면 로그인하지 못했다고 알리고 버튼을 다시 연다", async () => {
    answerWith({ status: "failed", code: "INVALID_SOCIAL_TOKEN" });
    renderScreen();
    await press("Apple로 계속하기");
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("로그인하지 못했어요. 다시 시도해 주세요"),
    );
    expect(screen.getByRole("button", { name: "Apple로 계속하기" })).toBeEnabled();
    expect(trackSocialLoginFailed).toHaveBeenCalledWith({
      provider: "APPLE",
      reason: "INVALID_SOCIAL_TOKEN",
    });
  });

  it("같은 순간에 두 번 눌러도 앱에 한 번만 요청한다", () => {
    vi.mocked(requestNativeSocialLogin).mockReturnValue(new Promise(() => {}));
    renderScreen();
    const button = screen.getByRole("button", { name: "Google로 계속하기" });
    act(() => {
      button.click();
      button.click();
    });
    expect(requestNativeSocialLogin).toHaveBeenCalledTimes(1);
  });

  it("성공 응답 전에 게이트가 로그인 화면을 내려도 성공은 한 번 알린다", async () => {
    let answer: (result: NativeSocialLoginResult) => void = () => {};
    vi.mocked(requestNativeSocialLogin).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const { leave } = renderScreen();
    await press("카카오로 계속하기");
    leave();
    await act(async () => {
      answer({ status: "success", isNewUser: false });
    });
    expect(showToast).toHaveBeenCalledExactlyOnceWith("로그인을 성공했어요!", {
      persistOnNavigation: true,
    });
  });

  it("화면을 떠난 뒤 온 실패 응답은 알리지 않는다", async () => {
    let answer: (result: NativeSocialLoginResult) => void = () => {};
    vi.mocked(requestNativeSocialLogin).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const { leave } = renderScreen();
    await press("카카오로 계속하기");
    leave();
    await act(async () => {
      answer({ status: "failed", code: "INVALID_SOCIAL_TOKEN" });
    });
    expect(showToast).not.toHaveBeenCalled();
  });
});
