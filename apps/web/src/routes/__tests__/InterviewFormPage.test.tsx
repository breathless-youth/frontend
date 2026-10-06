import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as TokenSourceModule from "@/lib/auth/tokenSource";
import type { AuthSnapshot, TokenSource } from "@/lib/auth/tokenSource";
import { InterviewFormPage } from "@/routes/InterviewFormPage";

const getProfile = vi.hoisted(() => vi.fn());
// 기본은 출처 없음(브라우저 단독). 신원 대기 테스트만 가짜 출처를 끼운다.
const tokenSourceMock = vi.hoisted(() => ({ source: null as TokenSource | null }));
vi.mock("@/lib/auth/tokenSource", async (importOriginal) => ({
  ...(await importOriginal<typeof TokenSourceModule>()),
  getTokenSource: () => tokenSourceMock.source,
}));
vi.mock("@/lib/profileApi", () => ({ getProfile }));
vi.mock("@/lib/hardNavigation", () => ({
  hardNavigate: vi.fn(),
  hardReplace: vi.fn(),
  canExitViaHistoryBack: () => false,
}));

const FORM = "https://docs.google.com/forms/d/e/abc/viewform?usp=pp_url&entry.1=NICKNAME";

function renderAt(search: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/interview${search}`]}>
        <Routes>
          <Route path="/interview" element={<InterviewFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** 첫 auth-token이 아직 안 온 출처. deliver를 부르면 토큰이 도착한다. */
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

afterEach(() => {
  getProfile.mockReset();
  tokenSourceMock.source = null;
});

describe("InterviewFormPage", () => {
  it("닉네임을 채운 구글폼을 iframe으로 띄운다", async () => {
    getProfile.mockResolvedValue({ nickname: "포메 🐶" });
    renderAt(`?userId=7&form=${encodeURIComponent(FORM)}`);

    const frame = await screen.findByTitle("인터뷰 신청하기");
    await waitFor(() =>
      expect(new URL(frame.getAttribute("src")!).searchParams.get("entry.1")).toBe("포메 🐶"),
    );
  });

  it("프로필 조회가 실패하면 빈 닉네임으로 띄운다", async () => {
    getProfile.mockRejectedValue(new Error("x"));
    renderAt(`?userId=7&form=${encodeURIComponent(FORM)}`);

    const frame = await screen.findByTitle("인터뷰 신청하기");
    expect(new URL(frame.getAttribute("src")!).searchParams.get("entry.1")).toBe("");
  });

  it("구글폼이 아닌 주소면 iframe 없이 실패 화면을 보인다", () => {
    renderAt(`?userId=7&form=${encodeURIComponent("https://evil.example/x")}`);

    expect(screen.queryByTitle("인터뷰 신청하기")).toBeNull();
    expect(screen.getByText("신청 폼을 불러오지 못했어요")).toBeInTheDocument();
  });

  it("신원이 아직 오지 않았으면 iframe 없이 로딩을 보인다", () => {
    tokenSourceMock.source = createPendingSource().source;
    renderAt(`?form=${encodeURIComponent(FORM)}`);

    expect(screen.queryByTitle("인터뷰 신청하기")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("신청 폼을 불러오는 중");
    expect(getProfile).not.toHaveBeenCalled();
  });

  it("토큰이 늦게 와도 빈 닉네임으로 먼저 열지 않고 닉네임을 채워 연다", async () => {
    const { source, deliver } = createPendingSource();
    tokenSourceMock.source = source;
    let resolveProfile: (value: { nickname: string }) => void = () => {};
    getProfile.mockReturnValue(
      new Promise((resolve) => {
        resolveProfile = resolve;
      }),
    );
    renderAt(`?form=${encodeURIComponent(FORM)}`);
    expect(screen.queryByTitle("인터뷰 신청하기")).toBeNull();

    act(() => deliver(7));
    // 프로필을 기다리는 동안에도 빈 닉네임 iframe을 붙이지 않는다.
    expect(screen.queryByTitle("인터뷰 신청하기")).toBeNull();
    await waitFor(() => expect(getProfile).toHaveBeenCalled());

    await act(async () => resolveProfile({ nickname: "포메" }));
    const frame = await screen.findByTitle("인터뷰 신청하기");
    expect(new URL(frame.getAttribute("src")!).searchParams.get("entry.1")).toBe("포메");
  });
});
