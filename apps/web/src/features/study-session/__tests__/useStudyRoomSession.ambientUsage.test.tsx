import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";

import { useStudyRoomSession } from "../useStudyRoomSession";

/**
 * 배경음 사용 시간은 계측 전용 옵션이다 — 종료 시점에 한 번 읽어 `study_session_ended`에 싣는다.
 * 이벤트 속성 모양은 `lib/__tests__/amplitude.test.ts`가 고정하고, 여기서는 읽는 시점만 본다.
 */
const mocks = vi.hoisted(() => ({ ended: vi.fn() }));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackStudySessionEnded: mocks.ended,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useStudyRoomSession — 배경음 사용 시간 계측", () => {
  it("종료 시점에 최신 ambientUsage 를 읽어 싣는다 — 렌더마다 바뀌어도 마지막 값을 쓴다", async () => {
    const first = () => ({ used: false, sec: 0 });
    const last = () => ({ used: true, sec: 37 });
    const hook = renderHook(
      ({ ambientUsage }: { ambientUsage: () => { used: boolean; sec: number } }) =>
        useStudyRoomSession(null, { ambientUsage }),
      { initialProps: { ambientUsage: first } },
    );
    hook.rerender({ ambientUsage: last });

    await act(async () => {
      await hook.result.current.endAndSubmit();
    });

    expect(mocks.ended).toHaveBeenCalledTimes(1);
    expect(mocks.ended.mock.calls[0]?.[0]).toMatchObject({
      ambientSoundUsed: true,
      ambientSoundSec: 37,
    });
  });

  it("옵션이 없으면 배경음 필드를 싣지 않는다 — 소셜룸은 배경음이 없다", async () => {
    const hook = renderHook(() => useStudyRoomSession(null, { roomType: "social" }));

    await act(async () => {
      await hook.result.current.endAndSubmit();
    });

    const input = mocks.ended.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input.ambientSoundUsed).toBeUndefined();
    expect(input.ambientSoundSec).toBeUndefined();
  });
});
