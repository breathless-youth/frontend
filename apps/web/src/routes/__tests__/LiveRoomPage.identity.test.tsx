import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as tokenSourceModule from "@/lib/auth/tokenSource";
import type { AuthSnapshot, TokenSource } from "@/lib/auth/tokenSource";

import { LiveRoomPage } from "../LiveRoomPage";

const mocks = vi.hoisted(() => ({ source: null as TokenSource | null }));
vi.mock("@/lib/auth/tokenSource", async (importOriginal) => ({
  ...(await importOriginal<typeof tokenSourceModule>()),
  getTokenSource: () => mocks.source,
}));

/** 아직 `auth-token`이 오지 않은 출처 — `arrive`로 도착을 흉내낸다. */
function pendingSource(): { source: TokenSource; arrive: (userId: number) => void } {
  let snapshot: AuthSnapshot | null = null;
  const listeners = new Set<(snapshot: AuthSnapshot) => void>();
  return {
    source: {
      getAccessToken: vi.fn(),
      getCurrentToken: vi.fn(),
      refresh: vi.fn(),
      getUserId: () => snapshot?.userId ?? null,
      hasSettled: () => snapshot !== null,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    arrive: (userId) => {
      snapshot = { userId, accessToken: "t" };
      for (const listener of listeners) listener(snapshot);
    },
  };
}

function renderRoom() {
  return render(
    <MemoryRouter initialEntries={["/social/room/12?code=5436"]}>
      <Routes>
        <Route path="/social" element={<div>소셜 홈</div>} />
        <Route path="/social/room/:roomId" element={<LiveRoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  mocks.source = null;
});

describe("LiveRoomPage — 신원 대기", () => {
  /**
   * 회귀 가드 — BY-528이 웹뷰 URL에서 userId를 빼면서 첫 렌더의 `userId`가 항상 null이 됐다.
   * 그걸 "못 들어감"으로 읽으면, `/social`을 거치지 않고 방 URL을 직접 여는 렌더러 사망
   * 복구(BY-436)가 복구하려던 그 방에서 쫓겨난다.
   */
  it("신원이 도착하기 전에는 소셜 홈으로 내보내지 않는다", () => {
    const { source } = pendingSource();
    mocks.source = source;

    renderRoom();

    expect(screen.queryByText("소셜 홈")).not.toBeInTheDocument();
  });

  it("출처가 없으면(브라우저 단독) 기다리지 않고 지금처럼 내보낸다", () => {
    renderRoom();

    expect(screen.getByText("소셜 홈")).toBeInTheDocument();
  });
});
