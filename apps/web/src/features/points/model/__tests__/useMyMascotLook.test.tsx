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
    // 받은 모습을 기기에 남기므로 앞 테스트가 남긴 값이 다음 테스트의 처음 값이 되지 않게 지운다.
    localStorage.clear();
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

  it("받은 모습을 기기에 남기고, 새 캐시는 서버 답을 기다리지 않고 그 모습으로 시작한다", async () => {
    pointsEnabled.mockReturnValue(true);
    const look = { id: "lamp", accessories: [] };
    getMyLook.mockResolvedValue(look);
    const first = renderHook(() => useMyMascotLook(7), { wrapper });
    await waitFor(() => expect(first.result.current).toEqual(look));

    getMyLook.mockReturnValue(new Promise(() => undefined));
    const next = renderHook(() => useMyMascotLook(7), { wrapper });

    expect(next.result.current).toEqual(look);
  });

  it("다른 사용자가 남긴 모습으로는 시작하지 않는다", async () => {
    pointsEnabled.mockReturnValue(true);
    getMyLook.mockResolvedValue({ id: "lamp", accessories: [] });
    const other = renderHook(() => useMyMascotLook(8), { wrapper });
    await waitFor(() => expect(other.result.current).not.toBeNull());

    getMyLook.mockReturnValue(new Promise(() => undefined));
    const mine = renderHook(() => useMyMascotLook(7), { wrapper });

    expect(mine.result.current).toBeNull();
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
