import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { nativeSocialLoginProviders } from "@/lib/nativeSocialLogin";
import type * as NativeSocialLogin from "@/lib/nativeSocialLogin";
import { getProfile } from "@/lib/profileApi";
import { useIdentityPending, useUserId } from "@/lib/userId";
import type * as UserId from "@/lib/userId";

import { useGroupAccess } from "../useGroupAccess";

vi.mock("@/lib/nativeSocialLogin", async (importOriginal) => ({
  ...(await importOriginal<typeof NativeSocialLogin>()),
  nativeSocialLoginProviders: vi.fn(() => []),
}));

vi.mock("@/lib/profileApi");
vi.mock("@/lib/userId", async (importOriginal) => ({
  ...(await importOriginal<typeof UserId>()),
  useUserId: vi.fn(() => 1),
  useIdentityPending: vi.fn(() => false),
}));

afterEach(() => {
  vi.mocked(nativeSocialLoginProviders).mockReset().mockReturnValue([]);
  vi.mocked(useIdentityPending).mockReset().mockReturnValue(false);
  vi.mocked(useUserId).mockReset().mockReturnValue(1);
  vi.mocked(getProfile).mockReset();
});

const PROFILE = {
  nickname: "열공곰",
  goal: null,
  category: null,
  initial: "열",
  colorIndex: 0,
  profileImageUrl: null,
};

/** 앱이 로그인 공급자를 알린 웹뷰 */
function gated() {
  vi.mocked(nativeSocialLoginProviders).mockReturnValue(["GOOGLE", "KAKAO", "APPLE"]);
}

function Wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("useGroupAccess", () => {
  it("앱이 로그인 공급자를 알리지 않으면 막지 않는다", () => {
    const { result } = renderHook(() => useGroupAccess(), { wrapper: Wrapper });
    expect(result.current).toBe("ungated");
  });

  it("앱의 첫 신원을 기다리는 동안은 정하지 않는다", () => {
    gated();
    vi.mocked(useIdentityPending).mockReturnValue(true);
    vi.mocked(useUserId).mockReturnValue(null);
    const { result } = renderHook(() => useGroupAccess(), { wrapper: Wrapper });
    expect(result.current).toBe("pending");
    expect(getProfile).not.toHaveBeenCalled();
  });

  it("앱이 신원을 끝내 주지 않으면 막지 않는다", () => {
    gated();
    vi.mocked(useUserId).mockReturnValue(null);
    const { result } = renderHook(() => useGroupAccess(), { wrapper: Wrapper });
    expect(result.current).toBe("ungated");
    expect(getProfile).not.toHaveBeenCalled();
  });

  it("프로필을 받는 동안은 정하지 않는다", () => {
    gated();
    vi.mocked(getProfile).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useGroupAccess(), { wrapper: Wrapper });
    expect(result.current).toBe("pending");
  });

  it("로그인한 공급자가 있으면 회원이다", async () => {
    gated();
    vi.mocked(getProfile).mockResolvedValue({ ...PROFILE, loginProvider: "KAKAO" } as never);
    const { result } = renderHook(() => useGroupAccess(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current).toBe("member"));
  });

  it("로그인한 공급자가 null이면 비회원이다", async () => {
    gated();
    vi.mocked(getProfile).mockResolvedValue({ ...PROFILE, loginProvider: null } as never);
    const { result } = renderHook(() => useGroupAccess(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current).toBe("guest"));
  });

  it("로그인으로 기록이 합쳐져 신원이 바뀌면 새 신원의 프로필로 다시 판정한다", async () => {
    gated();
    vi.mocked(getProfile).mockResolvedValueOnce({ ...PROFILE, loginProvider: null } as never);
    const { result, rerender } = renderHook(() => useGroupAccess(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current).toBe("guest"));

    vi.mocked(getProfile).mockResolvedValueOnce({ ...PROFILE, loginProvider: "GOOGLE" } as never);
    vi.mocked(useUserId).mockReturnValue(2);
    rerender();

    await waitFor(() => expect(result.current).toBe("member"));
    expect(getProfile).toHaveBeenCalledTimes(2);
  });

  it("로그인 필드가 없는 서버의 응답이면 막지 않는다", async () => {
    gated();
    vi.mocked(getProfile).mockResolvedValue(PROFILE);
    const { result } = renderHook(() => useGroupAccess(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current).toBe("member"));
  });

  it("프로필을 받지 못하면 막지 않는다", async () => {
    gated();
    vi.mocked(getProfile).mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useGroupAccess(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current).toBe("member"));
  });
});
