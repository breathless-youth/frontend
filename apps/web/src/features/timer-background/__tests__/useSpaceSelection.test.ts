import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { putTimerBackground } from "@/lib/pointsApi";
import { RAIN_SPACE } from "@/test/spaceFixtures";

import { isMemberUser } from "../spaceCatalogQuery";
import { readTimerBackground, SIMPLE_BACKGROUND } from "../timerBackground";
import { useSpaceSelection } from "../useSpaceSelection";

vi.mock("@/lib/pointsApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  putTimerBackground: vi.fn(),
}));
vi.mock("../spaceCatalogQuery", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isMemberUser: vi.fn(),
  // 서버 값 맞추기는 세션 화면 테스트가 본다. 여기서는 비회원처럼 맞추지 않는다.
  fetchAppliedSpace: vi.fn(async () => undefined),
}));

describe("useSpaceSelection", () => {
  beforeEach(() => {
    vi.mocked(isMemberUser).mockResolvedValue(true);
    vi.mocked(putTimerBackground).mockResolvedValue({
      selectedMascotCode: "BOOK",
      accessories: [],
      timerBackground: null,
    });
  });
  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("회원이 고르면 기기 값을 바꾸고 서버에도 저장한다", async () => {
    const { result } = renderHook(() => useSpaceSelection(1));

    await act(async () => {
      await result.current.applySpace(RAIN_SPACE);
    });

    expect(result.current.space).toEqual(RAIN_SPACE);
    expect(readTimerBackground()).toEqual(RAIN_SPACE);
    expect(putTimerBackground).toHaveBeenCalledExactlyOnceWith(RAIN_SPACE.itemId);
  });

  it("서버 저장이 실패하면 앞 공간으로 되돌린다", async () => {
    vi.mocked(putTimerBackground).mockRejectedValueOnce(new Error("down"));
    const { result } = renderHook(() => useSpaceSelection(1));

    let saved = true;
    await act(async () => {
      saved = await result.current.applySpace(RAIN_SPACE);
    });

    expect(saved).toBe(false);
    expect(result.current.space).toEqual(SIMPLE_BACKGROUND);
  });
});
