import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMemoryNoticeDismissStore,
  fetchActiveNotices,
  localStorageNoticeDismissStore,
  markNoticeDismissed,
  resetNoticeDismissStore,
  selectNoticeToShow,
  setNoticeDismissStore,
  type NoticeDismissStore,
  type NoticeResponse,
} from "../notice";

/**
 * U1 공지 팝업의 **노출 게이트** (스펙 2026-08-15-u2-notice-popup-design.md §4.2).
 *
 * 무게중심은 "언제 뜨는가"보다 **"언제 뜨지 않는가"**다.
 * 조회 실패·저장소 실패는 전부 fail-closed(안 띄움)로 떨어져야 한다.
 */

const mockedFetch = vi.fn();
globalThis.fetch = mockedFetch as unknown as typeof fetch;

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function notice(id: number, overrides: Partial<NoticeResponse> = {}): NoticeResponse {
  return { id, title: `공지 ${id}`, content: "본문", imageUrl: null, ...overrides };
}

afterEach(() => {
  resetNoticeDismissStore();
  localStorage.clear();
});

describe("fetchActiveNotices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/notices/active로 활성 공지 목록을 조회한다", async () => {
    const body = [notice(2, { imageUrl: "https://cdn.example.com/banner.png" }), notice(1)];
    mockedFetch.mockResolvedValueOnce(jsonResponse(200, body));

    await expect(fetchActiveNotices()).resolves.toEqual(body);
    expect(mockedFetch).toHaveBeenCalledWith("/api/notices/active", { method: "GET" });
  });

  it("실패 응답이면 서버 메시지로 reject한다 — statsApi와 같은 계약", async () => {
    mockedFetch.mockResolvedValueOnce(jsonResponse(500, { message: "서버 오류" }));

    await expect(fetchActiveNotices()).rejects.toThrow("서버 오류");
  });
});

describe("localStorageNoticeDismissStore — 공지 ID별 영구 dismiss", () => {
  it("기록이 없으면 dismiss 아님", async () => {
    await expect(localStorageNoticeDismissStore.isDismissed(3)).resolves.toBe(false);
  });

  it("markDismissed하면 해당 ID만 dismiss로 기록된다 (키: focuson.noticeDismissed.{id})", async () => {
    await localStorageNoticeDismissStore.markDismissed(3);

    expect(localStorage.getItem("focuson.noticeDismissed.3")).toBe("1");
    await expect(localStorageNoticeDismissStore.isDismissed(3)).resolves.toBe(true);
    await expect(localStorageNoticeDismissStore.isDismissed(4)).resolves.toBe(false);
  });
});

describe("selectNoticeToShow — 활성 공지 중 dismiss 안 된 최신 1개", () => {
  it("빈 목록이면 null", async () => {
    await expect(selectNoticeToShow([])).resolves.toBeNull();
  });

  it("dismiss된 공지가 없으면 첫 번째(서버 최신순 정렬)를 고른다", async () => {
    const latest = notice(5);

    await expect(selectNoticeToShow([latest, notice(4), notice(3)])).resolves.toEqual(latest);
  });

  it("최신 공지가 dismiss됐으면 그다음 공지를 고른다 — dismiss 필터", async () => {
    setNoticeDismissStore(createMemoryNoticeDismissStore([5]));
    const next = notice(4);

    await expect(selectNoticeToShow([notice(5), next])).resolves.toEqual(next);
  });

  it("전부 dismiss됐으면 null", async () => {
    setNoticeDismissStore(createMemoryNoticeDismissStore([5, 4]));

    await expect(selectNoticeToShow([notice(5), notice(4)])).resolves.toBeNull();
  });

  it("dismiss 조회가 실패하면 null — fail-closed (영구 dismiss를 어길 수 있으면 안 띄운다)", async () => {
    const broken: NoticeDismissStore = {
      isDismissed: () => Promise.reject(new Error("storage broken")),
      markDismissed: () => Promise.resolve(),
    };
    setNoticeDismissStore(broken);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(selectNoticeToShow([notice(5)])).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("markNoticeDismissed — 저장 실패는 무시한다", () => {
  it("저장 성공 시 store에 기록된다", async () => {
    const store = createMemoryNoticeDismissStore();
    setNoticeDismissStore(store);

    await markNoticeDismissed(7);

    await expect(store.isDismissed(7)).resolves.toBe(true);
  });

  it("저장이 실패해도 reject하지 않는다 — 최악이 다음 방문에 한 번 더 뜨는 것", async () => {
    const broken: NoticeDismissStore = {
      isDismissed: () => Promise.resolve(false),
      markDismissed: () => Promise.reject(new Error("storage broken")),
    };
    setNoticeDismissStore(broken);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(markNoticeDismissed(7)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
