import "fake-indexeddb/auto";

import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getShopItems } from "@/lib/pointsApi";
import { queryClient } from "@/lib/queryClient";
import { PROCTOR_SPACE, RAIN_ITEM, shopSpace } from "@/test/spaceFixtures";

import { writeTimerBackground } from "../timerBackground";
import { useTimerBackgroundName } from "../useTimerBackgroundName";

vi.mock("@/lib/pointsApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getShopItems: vi.fn(),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe("useTimerBackgroundName", () => {
  beforeEach(() => {
    vi.mocked(getShopItems).mockResolvedValue({ items: [shopSpace(), RAIN_ITEM] });
  });
  afterEach(() => {
    queryClient.clear();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("고른 적이 없으면 심플이다", () => {
    const { result } = renderHook(() => useTimerBackgroundName(7), { wrapper });
    expect(result.current).toBe("심플");
  });

  it("서버 공간이면 가진 공간 목록의 이름을 보인다", async () => {
    writeTimerBackground(PROCTOR_SPACE);
    const { result } = renderHook(() => useTimerBackgroundName(7), { wrapper });

    await waitFor(() => expect(result.current).toBe("독서실 감독관"));
  });

  it("계정을 모르면 서버 공간 이름을 비워 둔다", () => {
    writeTimerBackground(PROCTOR_SPACE);
    const { result } = renderHook(() => useTimerBackgroundName(null), { wrapper });

    expect(result.current).toBe("");
    expect(getShopItems).not.toHaveBeenCalled();
  });
});
