import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EndedSession } from "../useStudyRoomSession";
import { useStudyRoomSession } from "../useStudyRoomSession";

/**
 * 타임랩스는 세션이 끝난 순간의 기기 집계로 사진을 남길지 정한다.
 * 제출 재시도가 있어도 세션당 한 번만 알려야 같은 타임랩스를 두 번 정리하지 않는다.
 */
describe("useStudyRoomSession 종료 알림", () => {
  it("끝난 순간 한 번만 시작·종료 시각과 기기 집계를 알린다", async () => {
    const onEnded = vi.fn<(ended: EndedSession) => void>();
    const hook = renderHook(() => useStudyRoomSession(null, { onEnded }));

    await act(async () => {
      await hook.result.current.endAndSubmit();
    });
    await act(async () => {
      await hook.result.current.endAndSubmit();
    });

    expect(onEnded).toHaveBeenCalledTimes(1);
    const ended = onEnded.mock.calls[0]?.[0];
    expect(ended?.startedAtMs).toBe(hook.result.current.startedAtMs);
    expect(ended?.endedAtMs).toBeGreaterThanOrEqual(hook.result.current.startedAtMs);
    expect(ended).toMatchObject({
      studySec: hook.result.current.studySec,
      focusSec: hook.result.current.focusSec,
    });
    expect(Array.isArray(ended?.events)).toBe(true);
  });

  it("이어받은 세션은 서버가 준 시작 시각을 그대로 돌려준다", () => {
    const startedAtMs = Date.UTC(2026, 9, 6, 1, 0, 0);
    const hook = renderHook(() =>
      useStudyRoomSession(null, {
        restored: {
          startedAtMs,
          reportedAtMs: startedAtMs + 60_000,
          baseStudySec: 60,
          baseFocusSec: 60,
          events: [],
          subjectSegments: [],
        },
      }),
    );

    expect(hook.result.current.startedAtMs).toBe(startedAtMs);
  });
});
