import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as AppHandoffModule from "@/features/social-room/appHandoff";
import { openInApp } from "@/features/social-room/appHandoff";

import { InviteCodeJoinPage } from "../InviteCodeJoinPage";

vi.mock("@/features/social-room/appHandoff", async (importOriginal) => ({
  ...(await importOriginal<typeof AppHandoffModule>()),
  openInApp: vi.fn(),
}));

const KAKAO_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) KAKAOTALK 10.5.0";
const SAFARI_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1";

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
  Object.defineProperty(navigator, "maxTouchPoints", { value: 5, configurable: true });
}

function renderAt(search: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[`/social/join${search}`]}>
        <InviteCodeJoinPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("InviteCodeJoinPage 인앱 스킴 브리지", () => {
  it("인앱 브라우저 + 코드가 있으면 첫 로드에 openInApp을 한 번 부른다", () => {
    setUserAgent(KAKAO_UA);
    renderAt("?userId=7&code=1234");
    expect(openInApp).toHaveBeenCalledTimes(1);
    expect(openInApp).toHaveBeenCalledWith("ios", "1234");
  });

  it("일반 브라우저는 첫 로드에 자동 발사하지 않는다", () => {
    setUserAgent(SAFARI_UA);
    renderAt("?userId=7&code=1234");
    expect(openInApp).not.toHaveBeenCalled();
  });

  it("앱에서 참여하기 버튼은 눌렀을 때 openInApp을 부른다", async () => {
    setUserAgent(SAFARI_UA);
    renderAt("?userId=7&code=1234");
    await userEvent.click(screen.getByRole("button", { name: "앱에서 참여하기" }));
    expect(openInApp).toHaveBeenCalledWith("ios", "1234");
  });

  it("StrictMode에서 이펙트가 이중 실행돼도 openInApp은 한 번만 부른다", () => {
    setUserAgent(KAKAO_UA);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <StrictMode>
          <MemoryRouter initialEntries={["/social/join?userId=7&code=1234"]}>
            <InviteCodeJoinPage />
          </MemoryRouter>
        </StrictMode>
      </QueryClientProvider>,
    );
    expect(openInApp).toHaveBeenCalledTimes(1);
  });
});
