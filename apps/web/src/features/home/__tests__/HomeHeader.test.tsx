import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type * as UserIdModule from "@/lib/userId";

import { ddayKeys } from "@/lib/ddayQueries";

import { HomeHeader } from "../HomeHeader";

const tokenSource = vi.hoisted(() => ({ present: false }));

vi.mock("@/lib/userId", async (importOriginal) => ({
  ...(await importOriginal<typeof UserIdModule>()),
  hasTokenSource: () => tokenSource.present,
}));

function renderHeader(
  props: Partial<Parameters<typeof HomeHeader>[0]> = {},
  dday: { title: string; targetDate: string } | null = null,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(ddayKeys.detail(7), dday);
  return render(
    <QueryClientProvider client={queryClient}>
      <HomeHeader userId={7} dateKey="2026-10-26" focusSec={37800} studySec={48000} {...props} />
    </QueryClientProvider>,
  );
}

describe("HomeHeader", () => {
  it("첫 줄에 고른 날짜, 그 아래 줄에 그날 순공과 총 공부를 함께 보인다", () => {
    renderHeader();

    const title = screen.getByRole("heading", { level: 1, name: "10월 26일 월요일" });
    expect(title.parentElement?.nextElementSibling).toHaveTextContent(
      "순공 10시간 30분 · 총 13시간 20분",
    );
    // 눌러서 바꾸던 버튼은 없다.
    expect(screen.queryByRole("button", { name: /순공/ })).not.toBeInTheDocument();
  });

  it("값을 아직 받지 못했으면 시간 줄은 로딩이다", () => {
    renderHeader({ focusSec: null, studySec: null });

    expect(screen.queryByText(/순공/)).not.toBeInTheDocument();
    expect(screen.getByTestId("home-total-pending")).toBeInTheDocument();
  });

  it("설정한 D-Day 제목을 시간 줄 오른쪽에 둔다", () => {
    tokenSource.present = true;
    renderHeader({}, { title: "수능", targetDate: "2026-11-19" });
    tokenSource.present = false;

    const times = screen.getByText(/^순공/);
    expect(times.parentElement).toHaveTextContent(/순공.*총.*수능$/);
  });

  it("D-Day를 설정하지 않았으면 제목 자리를 비운다", () => {
    tokenSource.present = true;
    renderHeader();
    tokenSource.present = false;

    expect(screen.getByText(/^순공/).parentElement?.children).toHaveLength(1);
  });
});
