import { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetAppPointsGatewayForTests } from "@/features/points/gateway/appPointsGateway";
import { getDecorations } from "@/lib/pointsApi";
import { __resetPointsForTests } from "@/lib/pointsCapability";
import { pointsKeys } from "@/lib/pointsQueries";
import { getProfile } from "@/lib/profileApi";

import { __resetMascotLookImagesForTests } from "../mascotLookImages";
import { useMascotLookPrefetch } from "../prefetchMyMascotLook";

vi.mock("@/lib/whenIdle", () => ({ whenIdle: (task: () => void) => task() }));
vi.mock("@/lib/pointsApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDecorations: vi.fn(),
}));
vi.mock("@/lib/profileApi", () => ({ getProfile: vi.fn() }));

const BERET = "https://web.focusmakers.app/avatars/shop/pencil/head/beret.png";
const PENCIL_WITH_BERET = {
  selectedMascotCode: "PENCIL",
  accessories: [
    { mascotCode: "PENCIL", slot: "HEAD", item: { itemId: 31, code: "BERET", imageUrl: BERET } },
  ],
  timerBackground: null,
};

const images = { decoded: [] as string[], warmed: [] as string[] };

beforeEach(() => {
  window.history.replaceState(null, "", "/?points=1");
  __resetPointsForTests();
  __resetAppPointsGatewayForTests();
  __resetMascotLookImagesForTests();
  localStorage.clear();
  images.decoded = [];
  images.warmed = [];
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value(this: HTMLImageElement) {
      images.decoded.push(this.src);
      return Promise.resolve();
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      images.warmed.push(input);
      return { arrayBuffer: async () => new ArrayBuffer(0) };
    }),
  );
  vi.mocked(getProfile).mockResolvedValue({
    nickname: "몽당이주인",
    goal: null,
    category: null,
    initial: "몽",
    colorIndex: 0,
    loginProvider: "KAKAO",
  });
  vi.mocked(getDecorations).mockResolvedValue(PENCIL_WITH_BERET);
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
  __resetPointsForTests();
  __resetAppPointsGatewayForTests();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
});

function renderPrefetch() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useMascotLookPrefetch(client, 7));
  return { client, prefetchOnExit: result.current };
}

describe("useMascotLookPrefetch", () => {
  it("세션 화면이 열리면 모습을 받고 그림은 디코드 없이 HTTP 캐시만 데운다", async () => {
    const { client } = renderPrefetch();

    await waitFor(() => expect(images.warmed).toContain(BERET));
    await act(async () => {});

    expect(client.getQueryData(pointsKeys.look(7))).toMatchObject({ id: "pencil" });
    expect(images.decoded).toEqual([]);
  });

  it("종료 버튼을 누르면 그림을 디코드한다", async () => {
    const { prefetchOnExit } = renderPrefetch();
    await waitFor(() => expect(images.warmed).toContain(BERET));

    await act(async () => prefetchOnExit());

    await waitFor(() => expect(images.decoded).toContain(BERET));
  });

  it("종료 버튼에서는 서버 답을 기다리지 않고 이미 아는 모습의 그림부터 디코드한다", async () => {
    const { prefetchOnExit, client } = renderPrefetch();
    await waitFor(() => expect(images.warmed).toContain(BERET));
    // 모습이 오래돼 다시 받게 하고, 그 답은 오지 않는다.
    await act(async () => client.invalidateQueries({ queryKey: pointsKeys.look(7) }));
    vi.mocked(getDecorations).mockReturnValue(new Promise(() => undefined));

    await act(async () => prefetchOnExit());

    await waitFor(() => expect(images.decoded).toContain(BERET));
  });

  it("회원으로 확인되지 않으면 모습도 그림도 받지 않는다", async () => {
    vi.mocked(getProfile).mockResolvedValue({
      nickname: "손님",
      goal: null,
      category: null,
      initial: "손",
      colorIndex: 0,
    });
    const { prefetchOnExit } = renderPrefetch();
    await waitFor(() => expect(getProfile).toHaveBeenCalled());

    await act(async () => prefetchOnExit());

    expect(getDecorations).not.toHaveBeenCalled();
    expect(images.warmed).toEqual([]);
    expect(images.decoded).toEqual([]);
  });
});
