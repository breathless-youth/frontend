import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";

import { HomeHeader } from "../HomeHeader";

const analytics = vi.hoisted(() => ({ trackHomeTotalTimeRevealed: vi.fn() }));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  ...analytics,
}));

function renderHeader(props: Partial<Parameters<typeof HomeHeader>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HomeHeader userId={7} dateKey="2026-10-26" focusSec={37800} studySec={48000} {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HomeHeader", () => {
  it("고른 날짜를 제목으로, 그날 순공을 오른쪽에 보인다", () => {
    renderHeader();

    expect(screen.getByRole("heading", { level: 1, name: "10월 26일 월요일" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /순공 10시간 30분/ })).toBeInTheDocument();
  });

  it("순공을 누르면 총 공부를 보이고 3초 뒤 순공으로 돌아온다", () => {
    renderHeader();

    fireEvent.click(screen.getByRole("button", { name: /순공/ }));
    expect(screen.getByRole("button", { name: /총 공부 13시간 20분/ })).toBeInTheDocument();
    expect(analytics.trackHomeTotalTimeRevealed).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(screen.getByRole("button", { name: /총 공부/ })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("button", { name: /순공 10시간 30분/ })).toBeInTheDocument();
  });

  it("총 공부가 보이는 동안 다시 누르면 바로 순공으로 돌아오고 이벤트는 더 보내지 않는다", () => {
    renderHeader();

    fireEvent.click(screen.getByRole("button", { name: /순공/ }));
    fireEvent.click(screen.getByRole("button", { name: /총 공부/ }));

    expect(screen.getByRole("button", { name: /순공 10시간 30분/ })).toBeInTheDocument();
    expect(analytics.trackHomeTotalTimeRevealed).toHaveBeenCalledTimes(1);
  });

  it("날짜가 바뀌면 순공으로 돌아온다", () => {
    const { rerender } = renderHeader();
    fireEvent.click(screen.getByRole("button", { name: /순공/ }));

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <HomeHeader userId={7} dateKey="2026-10-25" focusSec={600} studySec={900} />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("button", { name: /순공 10분/ })).toBeInTheDocument();
  });

  it("값을 아직 받지 못했으면 순공 자리는 로딩이다", () => {
    renderHeader({ focusSec: null, studySec: null });

    expect(screen.queryByRole("button", { name: /순공/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("home-total-pending")).toBeInTheDocument();
  });
});
