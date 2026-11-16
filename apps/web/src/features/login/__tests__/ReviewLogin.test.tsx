import { REVIEW_LOGIN_ID_MAX_LENGTH, REVIEW_LOGIN_PASSWORD_MAX_LENGTH } from "@focusmakers/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Location } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LoginEntry } from "@/lib/amplitude";
import { __resetAuthSuccessToastForTests } from "@/lib/authSuccessToast";
import { nativeReviewLoginAppVersion, requestNativeReviewLogin } from "@/lib/nativeReviewLogin";
import type * as NativeReviewLogin from "@/lib/nativeReviewLogin";
import { getReviewLoginStatus } from "@/lib/reviewLoginApi";
import { showToast } from "@/lib/toast";
import { LocationProbe } from "@/test/LocationProbe";

import { GroupLoginScreen } from "../GroupLoginScreen";

vi.mock("@/lib/nativeSocialLogin", () => ({
  nativeSocialLoginProviders: vi.fn(() => ["GOOGLE", "KAKAO"]),
  requestNativeSocialLogin: vi.fn(),
}));
vi.mock("@/lib/nativeReviewLogin", async (importOriginal) => ({
  ...(await importOriginal<typeof NativeReviewLogin>()),
  nativeReviewLoginAppVersion: vi.fn(() => "26.47.0"),
  requestNativeReviewLogin: vi.fn(),
}));
vi.mock("@/lib/reviewLoginApi", () => ({ getReviewLoginStatus: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));

afterEach(() => {
  __resetAuthSuccessToastForTests();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.mocked(nativeReviewLoginAppVersion).mockReturnValue("26.47.0");
});

function renderScreen({
  path = "/social",
  entry = "tab",
}: { path?: string; entry?: LoginEntry } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let current: Location | null = null;
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/settings" element={<p>설정 화면</p>} />
          <Route path="*" element={<GroupLoginScreen entry={entry} />} />
        </Routes>
        <LocationProbe
          onLocation={(location) => {
            current = location;
          }}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { location: () => current };
}

async function openSheet() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "심사용 로그인" }));
  // 창은 누를 때 따로 받아서 칸이 그려질 때까지 기다린다.
  await screen.findByLabelText("아이디");
  return user;
}

async function submit(user: ReturnType<typeof userEvent.setup>, password = "pw-1234") {
  await user.type(screen.getByLabelText("아이디"), "review");
  await user.type(screen.getByLabelText("비밀번호"), password);
  await user.click(screen.getByRole("button", { name: "로그인" }));
}

describe("심사용 로그인 입구", () => {
  it("앱 버전을 모르면 서버에 묻지 않고 입구도 없다", () => {
    vi.mocked(nativeReviewLoginAppVersion).mockReturnValue(null);
    renderScreen();

    expect(getReviewLoginStatus).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "심사용 로그인" })).not.toBeInTheDocument();
  });

  it("서버가 이 앱 버전에 꺼 두었으면 입구를 그리지 않는다", async () => {
    vi.mocked(getReviewLoginStatus).mockResolvedValue({ enabled: false });
    renderScreen();

    await waitFor(() => expect(getReviewLoginStatus).toHaveBeenCalledWith("26.47.0"));
    expect(screen.queryByRole("button", { name: "심사용 로그인" })).not.toBeInTheDocument();
  });

  it("상태를 묻지 못하면 입구를 그리지 않는다", async () => {
    vi.mocked(getReviewLoginStatus).mockRejectedValue(new Error("down"));
    renderScreen();

    await waitFor(() => expect(getReviewLoginStatus).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "심사용 로그인" })).not.toBeInTheDocument();
  });

  it("켜져 있으면 약관 문구 아래 입구를 그리고, 누르면 아이디와 비밀번호 창이 열린다", async () => {
    vi.mocked(getReviewLoginStatus).mockResolvedValue({ enabled: true });
    renderScreen();
    await openSheet();

    const loginId = screen.getByLabelText("아이디");
    const password = screen.getByLabelText("비밀번호");
    expect(password).toHaveAttribute("type", "password");
    for (const input of [loginId, password]) {
      expect(input).toHaveAttribute("autocomplete", "off");
      expect(input).toHaveAttribute("autocapitalize", "none");
      expect(input).toHaveAttribute("autocorrect", "off");
      expect(input).toHaveAttribute("spellcheck", "false");
    }
    expect(screen.getByRole("button", { name: "로그인" })).toBeDisabled();
  });

  it("아이디와 비밀번호 칸은 앱이 받는 길이까지만 입력된다", async () => {
    vi.mocked(getReviewLoginStatus).mockResolvedValue({ enabled: true });
    renderScreen();
    await openSheet();

    expect(screen.getByLabelText("아이디")).toHaveAttribute(
      "maxlength",
      String(REVIEW_LOGIN_ID_MAX_LENGTH),
    );
    expect(screen.getByLabelText("비밀번호")).toHaveAttribute(
      "maxlength",
      String(REVIEW_LOGIN_PASSWORD_MAX_LENGTH),
    );
  });
});

describe("심사용 로그인 결과", () => {
  it("앱에 아이디와 비밀번호를 넘기고, 성공하면 소셜 로그인처럼 알리고 설정으로 돌아간다", async () => {
    vi.mocked(getReviewLoginStatus).mockResolvedValue({ enabled: true });
    vi.mocked(requestNativeReviewLogin).mockResolvedValue({ status: "success" });
    const view = renderScreen({ path: "/settings/login", entry: "settings" });
    const user = await openSheet();
    await submit(user);

    expect(requestNativeReviewLogin).toHaveBeenCalledWith("review", "pw-1234");
    await waitFor(() => expect(view.location()?.pathname).toBe("/settings"));
    expect(showToast).toHaveBeenCalledExactlyOnceWith("로그인을 성공했어요!", {
      persistOnNavigation: true,
    });
  });

  it.each([
    ["INVALID_REVIEW_CREDENTIALS", "아이디나 비밀번호가 맞지 않아요."],
    ["REVIEW_LOGIN_DISABLED", "지금은 심사용 로그인을 쓸 수 없어요."],
    ["TOO_MANY_REQUESTS", "여러 번 틀려서 잠시 뒤에 다시 시도해 주세요."],
    ["UNKNOWN", "로그인하지 못했으니 다시 시도해 주세요."],
  ] as const)("%s이면 입력칸 아래에 한 문장으로 알리고 창을 그대로 둔다", async (code, text) => {
    vi.mocked(getReviewLoginStatus).mockResolvedValue({ enabled: true });
    vi.mocked(requestNativeReviewLogin).mockResolvedValue({ status: "failed", code });
    renderScreen();
    const user = await openSheet();
    await submit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(screen.getByLabelText("비밀번호")).toHaveAttribute("aria-invalid", "true");
    expect(showToast).not.toHaveBeenCalled();
  });

  it("비밀번호를 고치면 오류를 지운다", async () => {
    vi.mocked(getReviewLoginStatus).mockResolvedValue({ enabled: true });
    vi.mocked(requestNativeReviewLogin).mockResolvedValue({
      status: "failed",
      code: "INVALID_REVIEW_CREDENTIALS",
    });
    renderScreen();
    const user = await openSheet();
    await submit(user);
    await screen.findByRole("alert");

    await user.type(screen.getByLabelText("비밀번호"), "x");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
