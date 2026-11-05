import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/lib/i18n";
import type * as NativeSocialLogin from "@/lib/nativeSocialLogin";
import { getStudyDays } from "@/lib/statsApi";
import type * as UserId from "@/lib/userId";

import { GroupLoginScreen } from "../GroupLoginScreen";

vi.mock("@/lib/nativeSocialLogin", async (importOriginal) => ({
  ...(await importOriginal<typeof NativeSocialLogin>()),
  nativeSocialLoginProviders: vi.fn(() => ["GOOGLE", "KAKAO", "APPLE"]),
}));
vi.mock("@/lib/statsApi", () => ({ getStudyDays: vi.fn() }));
vi.mock("@/lib/userId", async (importOriginal) => ({
  ...(await importOriginal<typeof UserId>()),
  useUserId: vi.fn(() => 1),
  useIdentityPending: vi.fn(() => false),
}));

const HANGUL = /[가-힣]/;

/** 화면 글자와 aria-label을 함께 모은다. 스크린리더가 읽는 이름도 영어여야 한다. */
function visibleText(): string {
  const labels = [...document.body.querySelectorAll("[aria-label]")].map((el) =>
    el.getAttribute("aria-label"),
  );
  return [document.body.textContent, ...labels].join("\n");
}

afterEach(async () => {
  await i18n.changeLanguage("ko");
});

describe("그룹 로그인 영어 화면", () => {
  it("공급자 이름, 동의 문구, 기록 안내, 로고 이름에 한글이 남지 않는다", async () => {
    await i18n.changeLanguage("en");
    vi.mocked(getStudyDays).mockResolvedValue({ totalDays: 2 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/social/join?code=K7Q2MX"]}>
          <GroupLoginScreen entry="invite" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(
        "Your study history so far will carry over to the account you sign in with.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Continue with / })).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Terms of Service" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "FocusMakers" })).toBeInTheDocument();
    expect(visibleText()).not.toMatch(HANGUL);
  });
});
