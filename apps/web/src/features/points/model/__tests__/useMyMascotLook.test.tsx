import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useMyMascotLook } from "../useMyMascotLook";

const getMyLook = vi.fn();
const pointsEnabled = vi.fn();

vi.mock("@/lib/pointsCapability", () => ({ isPointsEnabled: () => pointsEnabled() }));
vi.mock("../../gateway/appPointsGateway", () => ({ appPointsGateway: () => ({ getMyLook }) }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useMyMascotLook", () => {
  beforeEach(() => {
    getMyLook.mockReset();
    pointsEnabled.mockReset();
  });

  it("포인트 기능이 꺼져 있으면 요청하지 않고 null이다", () => {
    pointsEnabled.mockReturnValue(false);

    const { result } = renderHook(() => useMyMascotLook(7), { wrapper });

    expect(result.current).toBeNull();
    expect(getMyLook).not.toHaveBeenCalled();
  });

  it("사용자가 없으면 요청하지 않고 null이다", () => {
    pointsEnabled.mockReturnValue(true);

    const { result } = renderHook(() => useMyMascotLook(null), { wrapper });

    expect(result.current).toBeNull();
    expect(getMyLook).not.toHaveBeenCalled();
  });

  it("꾸미기 조회가 돌려준 모습을 그대로 준다", async () => {
    pointsEnabled.mockReturnValue(true);
    const look = { id: "lamp", accessories: [{ slot: "face", imageUrl: "/glasses.png" }] };
    getMyLook.mockResolvedValue(look);

    const { result } = renderHook(() => useMyMascotLook(7), { wrapper });

    await waitFor(() => expect(result.current).toEqual(look));
  });

  it("고른 마스코트가 없으면 null이다", async () => {
    pointsEnabled.mockReturnValue(true);
    getMyLook.mockResolvedValue(null);

    const { result } = renderHook(() => useMyMascotLook(7), { wrapper });

    await waitFor(() => expect(getMyLook).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("꾸미기를 받지 못하면 null이다", async () => {
    pointsEnabled.mockReturnValue(true);
    getMyLook.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useMyMascotLook(7), { wrapper });

    await waitFor(() => expect(getMyLook).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
