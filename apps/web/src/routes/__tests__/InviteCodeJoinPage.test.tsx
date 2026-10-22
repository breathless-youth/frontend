import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as AppHandoffModule from "@/features/social-room/appHandoff";
import { openInApp } from "@/features/social-room/appHandoff";
import type * as Amplitude from "@/lib/amplitude";
import { trackStoreLinkRedirected } from "@/lib/amplitude";

import { InviteCodeJoinPage } from "../InviteCodeJoinPage";

vi.mock("@/features/social-room/appHandoff", async (importOriginal) => ({
  ...(await importOriginal<typeof AppHandoffModule>()),
  openInApp: vi.fn(),
}));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackStoreLinkRedirected: vi.fn(),
}));

const KAKAO_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) KAKAOTALK 10.5.0";
const SAFARI_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1";
const WINDOWS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

function setUserAgent(ua: string, maxTouchPoints = 5) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
  Object.defineProperty(navigator, "maxTouchPoints", { value: maxTouchPoints, configurable: true });
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

  it("인앱 브라우저라도 미완성 코드면 첫 로드에 자동 발사하지 않는다", () => {
    setUserAgent(KAKAO_UA);
    renderAt("?code=12");
    expect(openInApp).not.toHaveBeenCalled();
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
    expect(trackStoreLinkRedirected).toHaveBeenCalledWith("ios");
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

describe("InviteCodeJoinPage 모바일 브라우저 안내", () => {
  it("코드가 있으면 읽기 전용 코드와 앱에서 참여하기만 보인다", () => {
    setUserAgent(SAFARI_UA);
    renderAt("?code=1234");
    expect(screen.getByRole("heading", { name: "그룹 스터디에 초대받았어요" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "초대코드 1234" })).toBeInTheDocument();
    expect(screen.getByText("앱에서 이 코드로 참여할 수 있어요")).toBeInTheDocument();
    expect(screen.queryByLabelText("초대코드 4자리")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "참여하기" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "앱에서 참여하기" })).toBeInTheDocument();
  });

  it("코드가 없으면 코드 묶음 없이 입력 안내 문구를 보여 준다", () => {
    setUserAgent(SAFARI_UA);
    renderAt("");
    expect(screen.queryByRole("group", { name: /초대코드/ })).not.toBeInTheDocument();
    expect(screen.getByText("앱에서 초대코드를 입력해 참여할 수 있어요")).toBeInTheDocument();
  });

  it("미완성 코드는 코드 없이 앱을 연다", async () => {
    setUserAgent(SAFARI_UA);
    renderAt("?code=12");
    await userEvent.click(screen.getByRole("button", { name: "앱에서 참여하기" }));
    expect(openInApp).toHaveBeenCalledWith("ios", "");
  });

  it("PC 브라우저는 기존 입력 화면을 본다", () => {
    setUserAgent(WINDOWS_UA, 0);
    renderAt("?code=1234");
    expect(screen.getByLabelText("초대코드 4자리")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "참여하기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "앱에서 참여하기" })).not.toBeInTheDocument();
  });
});

describe("InviteCodeJoinPage 상단 제목", () => {
  it("입력 화면은 상단 바 제목이 h1이고 입력 안내는 h2다", () => {
    setUserAgent(WINDOWS_UA, 0);
    renderAt("");
    expect(screen.getByRole("heading", { level: 1, name: "초대코드로 참여" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "초대코드를 입력해 주세요" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("모바일 브라우저 안내도 같은 상단 바 제목을 쓴다", () => {
    setUserAgent(SAFARI_UA);
    renderAt("?code=1234");
    expect(screen.getByRole("heading", { level: 1, name: "초대코드로 참여" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "그룹 스터디에 초대받았어요" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
