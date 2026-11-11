import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/lib/i18n";
import type * as NativeSocialLogin from "@/lib/nativeSocialLogin";

import { GroupLoginScreen } from "../GroupLoginScreen";

vi.mock("@/lib/nativeSocialLogin", async (importOriginal) => ({
  ...(await importOriginal<typeof NativeSocialLogin>()),
  nativeSocialLoginProviders: vi.fn(() => ["GOOGLE", "KAKAO", "APPLE"]),
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
  it("공급자 이름, 동의 문구, 서비스 이름에 한글이 남지 않는다", async () => {
    await i18n.changeLanguage("en");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/social/join?code=K7Q2MX"]}>
          <GroupLoginScreen entry="invite" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getAllByRole("button", { name: /^Continue with / })).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Terms of Service" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "FocusMakers" })).toBeInTheDocument();
    expect(visibleText()).not.toMatch(HANGUL);
  });

  it("동의 문구는 한국어와 같이 약관 동의 앞에서 줄을 나눈다", async () => {
    await i18n.changeLanguage("en");
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/social"]}>
          <GroupLoginScreen entry="tab" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText(/^By signing in/).textContent?.split("\n")).toEqual([
      "By signing in, you confirm that you're 14 or older",
      "and agree to the Terms of Service and Privacy Policy.",
    ]);
  });
});
