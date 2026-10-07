import "fake-indexeddb/auto";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecentTimelapses } from "../RecentTimelapses";
import { recentDayLabel } from "../recentDayLabel";
import { DEFAULT_TIMELAPSE_SETTINGS } from "../timelapseSettings";
import type { TimelapseStore } from "../timelapseStore";
import { createIndexedDbTimelapseStore } from "../timelapseStore";

/**
 * fake-indexeddb 위의 실제 저장소로 홈 목록을 그린다.
 * 테스트마다 새 IDBFactory를 깔아 앞 테스트의 DB가 남지 않게 한다.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let store: TimelapseStore;

beforeEach(() => {
  // 자정 직후에 돌면 한 시간 전이 어제가 되므로 시계를 정오에 고정한다. 타이머는 실제로 둔다.
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

function Where() {
  const location = useLocation();
  return <p>{`이동: ${location.pathname}${location.search}`}</p>;
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/home?userId=7"]}>
        <Routes>
          <Route path="/home" element={<RecentTimelapses store={store} />} />
          <Route path="/timelapses" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("recentDayLabel", () => {
  const now = new Date(2026, 9, 7, 9, 0).getTime();

  it("오늘·어제·그 밖의 날짜를 나눈다", () => {
    expect(recentDayLabel(new Date(2026, 9, 7, 0, 10).getTime(), now)).toBe("오늘");
    expect(recentDayLabel(new Date(2026, 9, 6, 23, 50).getTime(), now)).toBe("어제");
    expect(recentDayLabel(new Date(2026, 9, 3, 12, 0).getTime(), now)).toBe("10월 3일");
  });
});

describe("RecentTimelapses", () => {
  it("보관 중인 타임랩스를 최신부터 날짜와 순공으로 보여준다", async () => {
    await seed(Date.now() - 3 * DAY, "9:16", 6_480);
    await seed(Date.now() - HOUR, "9:16", 8_040);
    renderSection();

    const items = await screen.findAllByRole("listitem");

    expect(items.map((item) => item.textContent)).toEqual([
      "오늘순공 2시간 14분",
      expect.stringMatching(/^\d+월 \d+일순공 1시간 48분$/),
    ]);
    expect(screen.getByRole("heading", { name: "최근 타임랩스" })).toBeInTheDocument();
  });

  it("썸네일은 가운데 사진이고, 16:9는 흐린 배경 사진을 하나 더 깐다", async () => {
    await seed(Date.now() - HOUR, "16:9");
    renderSection();

    const item = await screen.findByRole("listitem");
    await waitFor(() => expect(item.querySelectorAll("img")).toHaveLength(2));

    // 가운데 사진(바이트 1)의 data URL
    const sources = [...item.querySelectorAll("img")].map((image) => image.getAttribute("src"));
    expect(sources).toEqual(["data:image/jpeg;base64,AQ==", "data:image/jpeg;base64,AQ=="]);
  });

  it.each([
    ["16:9", 2],
    ["9:16", 1],
  ] as const)("%s 사진은 세션 리플레이에서 가린다", async (aspect, count) => {
    // 타임랩스 사진은 분석 도구로 보내지 않는다(ADR 0013). 카메라 화면과 같은 차단 표식이다.
    await seed(Date.now() - HOUR, aspect);
    renderSection();

    const item = await screen.findByRole("listitem");
    await waitFor(() => expect(item.querySelectorAll("img")).toHaveLength(count));

    for (const image of item.querySelectorAll("img")) {
      expect(image).toHaveClass("amp-block", "sentry-block");
    }
  });

  it("목록을 읽지 못하면 섹션을 그리지 않는다", async () => {
    const failing: TimelapseStore = {
      ...store,
      listReady: () => Promise.reject(new Error("IndexedDB 열기 실패")),
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <RecentTimelapses store={failing} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(client.getQueryState(["timelapse", "recent"])?.status).toBe("error"),
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("9:16은 사진을 한 장만 깐다", async () => {
    await seed(Date.now() - HOUR, "9:16");
    renderSection();

    const item = await screen.findByRole("listitem");
    await waitFor(() => expect(item.querySelectorAll("img")).toHaveLength(1));
  });

  it("보관 중인 타임랩스가 없으면 안내를 보여주고 더보기를 숨긴다", async () => {
    renderSection();

    expect(
      await screen.findByText("공부를 완료하고 공부한 모습을 공유해보세요"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "더보기" })).not.toBeInTheDocument();
  });

  it("7일이 지난 타임랩스는 지우고 보여주지 않는다", async () => {
    await seed(Date.now() - 8 * DAY);
    renderSection();

    expect(
      await screen.findByText("공부를 완료하고 공부한 모습을 공유해보세요"),
    ).toBeInTheDocument();
    await expect(store.listReady()).resolves.toEqual([]);
  });

  it("더보기를 누르면 쿼리를 들고 전체 목록으로 간다", async () => {
    await seed(Date.now() - HOUR);
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "더보기" }));

    expect(await screen.findByText("이동: /timelapses?userId=7")).toBeInTheDocument();
  });
});
