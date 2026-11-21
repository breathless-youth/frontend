import type { ProfileResponse } from "@focusmakers/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDecorations, putTimerBackground } from "@/lib/pointsApi";
import { profileKeys } from "@/lib/profileQueries";
import { queryClient } from "@/lib/queryClient";
import { PROCTOR_SPACE, RAIN_SPACE } from "@/test/spaceFixtures";

import {
  readTimerBackground,
  type TimerBackgroundSelection,
  writeTimerBackground,
} from "../timerBackground";
import { commitTimerBackground, useSpaceApply } from "../useSpaceApply";
import { clearWatcherAssets, saveWatcherAssets } from "../watcher/watcherAssets";

vi.mock("@/lib/pointsApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDecorations: vi.fn(),
  putTimerBackground: vi.fn(),
}));

vi.mock("../watcher/watcherAssets", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  saveWatcherAssets: vi.fn(),
  clearWatcherAssets: vi.fn(),
}));

const DECORATIONS = { selectedMascotCode: "BOOK", accessories: [], timerBackground: null };

function signIn() {
  queryClient.setQueryData(profileKeys.detail(1), { loginProvider: "KAKAO" } as ProfileResponse);
}

/** 기기 값을 원본으로 읽는 호출부. PC 홈처럼 기기 저장값만 본다. */
function renderApply(userId: number | null = 1) {
  const commit = vi.fn(commitTimerBackground);
  const view = renderHook(() => useSpaceApply(userId, readTimerBackground(), commit));
  return { ...view, commit };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  queryClient.clear();
  vi.mocked(getDecorations).mockResolvedValue(DECORATIONS);
  vi.mocked(putTimerBackground).mockResolvedValue(DECORATIONS);
});

afterEach(() => {
  queryClient.clear();
});

describe("useSpaceApply", () => {
  it("비회원은 기기에만 저장하고 서버에 보내지 않는다", async () => {
    const { result } = renderApply(null);

    await act(async () => expect(await result.current(PROCTOR_SPACE)).toBe(true));

    expect(readTimerBackground()).toEqual(PROCTOR_SPACE);
    expect(putTimerBackground).not.toHaveBeenCalled();
  });

  it("회원은 서버 공간은 상품 id로, 사진은 기본 배경으로 저장한다", async () => {
    signIn();
    const { result } = renderApply();

    await act(async () => expect(await result.current(PROCTOR_SPACE)).toBe(true));
    await act(async () => {
      await result.current({ kind: "photo", photoId: "p1" });
    });

    expect(vi.mocked(putTimerBackground).mock.calls).toEqual([[41], [null]]);
  });

  it("localOnly면 회원이어도 서버에 보내지 않는다", async () => {
    signIn();
    const { result } = renderApply();

    await act(async () => {
      await result.current({ kind: "simple" }, { localOnly: true });
    });

    expect(putTimerBackground).not.toHaveBeenCalled();
  });

  it("저장이 실패하고 화면이 아직 그 공간이면 이전 공간으로 되돌린다", async () => {
    signIn();
    writeTimerBackground(RAIN_SPACE);
    vi.mocked(putTimerBackground).mockRejectedValueOnce(new Error("offline"));
    const { result } = renderApply();

    await act(async () => expect(await result.current(PROCTOR_SPACE)).toBe(false));

    expect(readTimerBackground()).toEqual(RAIN_SPACE);
  });

  it("앞 저장이 끝나기 전에 다시 고르면 고른 차례대로 보내고 앞 실패로 되돌리지 않는다", async () => {
    signIn();
    let failFirst!: (error: Error) => void;
    vi.mocked(putTimerBackground).mockImplementationOnce(
      () => new Promise((_, reject) => (failFirst = reject)),
    );
    const { result } = renderApply();

    let first!: Promise<boolean>;
    act(() => {
      first = result.current(PROCTOR_SPACE);
    });
    await waitFor(() => expect(putTimerBackground).toHaveBeenCalledTimes(1));
    let second!: Promise<boolean>;
    act(() => {
      second = result.current(RAIN_SPACE);
    });
    await act(async () => failFirst(new Error("offline")));

    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(vi.mocked(putTimerBackground).mock.calls).toEqual([[41], [42]]);
    expect(readTimerBackground()).toEqual(RAIN_SPACE);
  });

  it("회원이면 서버에 적용해 둔 공간으로 한 번 맞춘다", async () => {
    signIn();
    vi.mocked(getDecorations).mockResolvedValue({
      ...DECORATIONS,
      timerBackground: { ...PROCTOR_SPACE, imageUrl: null },
    });
    const { commit } = renderApply();

    await waitFor(() => expect(commit).toHaveBeenCalledWith(PROCTOR_SPACE));
    expect(readTimerBackground()).toEqual(PROCTOR_SPACE);
  });

  it("사용자가 먼저 고르면 늦게 온 서버 값으로 덮지 않는다", async () => {
    signIn();
    let answer!: (value: typeof DECORATIONS) => void;
    vi.mocked(getDecorations).mockImplementation(
      () => new Promise((resolve) => (answer = resolve)),
    );
    const { result } = renderApply();

    await act(async () => {
      await result.current(RAIN_SPACE);
    });
    await act(async () =>
      answer({
        ...DECORATIONS,
        timerBackground: { ...PROCTOR_SPACE, imageUrl: null } as never,
      }),
    );

    expect(readTimerBackground()).toEqual(RAIN_SPACE);
  });
});

describe("commitTimerBackground", () => {
  it("감시 공간이면 감시 파일을 받아 두고, 다른 공간이면 삭제한다", () => {
    expect(commitTimerBackground(PROCTOR_SPACE)).toBe(true);
    expect(saveWatcherAssets).toHaveBeenCalledWith(PROCTOR_SPACE.assetKey, expect.any(Array));

    const simple: TimerBackgroundSelection = { kind: "simple" };
    expect(commitTimerBackground(simple)).toBe(true);
    expect(clearWatcherAssets).toHaveBeenCalledOnce();
  });

  it("저장소가 막히면 false이고 감시 파일을 건드리지 않는다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("blocked");
    });

    expect(commitTimerBackground(PROCTOR_SPACE)).toBe(false);
    expect(saveWatcherAssets).not.toHaveBeenCalled();
  });
});
