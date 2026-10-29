import "fake-indexeddb/auto";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setHasTimelapseUserProperty } from "@/lib/amplitude";

import { DEFAULT_TIMELAPSE_SETTINGS } from "../timelapseSettings";
import type { TimelapseStore } from "../timelapseStore";
import { createIndexedDbTimelapseStore } from "../timelapseStore";
import { useTimelapseUserProperty } from "../useTimelapseUserProperty";

/**
 * fake-indexeddb 위의 실제 저장소로 홈이 읽는 최근 목록을 본다.
 * 테스트마다 새 IDBFactory를 깔아 앞 테스트의 DB가 남지 않게 한다.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

vi.mock("@/lib/amplitude", () => ({ setHasTimelapseUserProperty: vi.fn() }));

let store: TimelapseStore;

beforeEach(() => {
  // 자정 직후에 돌면 한 시간 전이 어제가 되므로 시계를 정오에 고정한다.
  // 타이머는 실제로 둔다.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 7, 12, 0));
  globalThis.indexedDB = new IDBFactory();
  store = createIndexedDbTimelapseStore();
});

afterEach(() => {
  vi.useRealTimers();
});

/** 바이트 값이 0, 1, 2인 사진 세 장으로 타임랩스 하나를 목록에 올린다. */
async function seed(startedAtMs: number, aspect: "9:16" | "16:9" = "9:16", focusSec = 8_040) {
  await store.begin(startedAtMs, { ...DEFAULT_TIMELAPSE_SETTINGS, aspect });
  for (let index = 0; index < 3; index += 1) {
    await store.addPhoto(startedAtMs, new Uint8Array([index]).buffer, startedAtMs + index * 10_000);
  }
  await store.finalize(startedAtMs, { endedAtMs: startedAtMs + HOUR, studySec: 9_000, focusSec });
}

function renderProperty(target: TimelapseStore = store) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  renderHook(() => useTimelapseUserProperty(target), { wrapper });
  return client;
}

describe("useTimelapseUserProperty 푸시 타겟용 user property", () => {
  beforeEach(() => {
    vi.mocked(setHasTimelapseUserProperty).mockReset();
  });

  it("목록을 읽으면 타임랩스 유무를 보낸다", async () => {
    await seed(new Date(2026, 9, 7, 9, 0).getTime());

    renderProperty();

    await waitFor(() => expect(setHasTimelapseUserProperty).toHaveBeenCalledWith(true));
    expect(setHasTimelapseUserProperty).toHaveBeenCalledTimes(1);
  });

  it("저장된 타임랩스가 없으면 false로 보낸다", async () => {
    renderProperty();

    await waitFor(() => expect(setHasTimelapseUserProperty).toHaveBeenCalledWith(false));
  });

  it("목록을 읽지 못하면 보내지 않는다", async () => {
    const broken: TimelapseStore = {
      ...store,
      listReady: () => Promise.reject(new Error("IndexedDB 열기 실패")),
    };
    const client = renderProperty(broken);

    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(setHasTimelapseUserProperty).not.toHaveBeenCalled();
  });

  it("7일이 지난 타임랩스는 지우고 없는 것으로 보낸다", async () => {
    await seed(Date.now() - 8 * DAY);

    renderProperty();

    await waitFor(() => expect(setHasTimelapseUserProperty).toHaveBeenCalledWith(false));
    await expect(store.listReady()).resolves.toEqual([]);
  });
});
