import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";

import { useStudyRoomSession } from "../useStudyRoomSession";

/**
 * 배경음 사용 시간은 계측 전용 옵션이다 — 종료 시점에 한 번 읽어 `study_session_ended`에 싣는다.
 * 이벤트 속성 모양은 `lib/__tests__/amplitude.test.ts`가 고정하고, 여기서는 읽는 시점만 본다.
 */
const mocks = vi.hoisted(() => ({ ended: vi.fn(), played: vi.fn() }));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackStudySessionEnded: mocks.ended,
  trackAmbientSoundPlayed: mocks.played,
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

  it("옵션이 없으면 배경음 필드를 싣지 않는다", async () => {
    const hook = renderHook(() => useStudyRoomSession(null, { roomType: "social" }));

    await act(async () => {
      await hook.result.current.endAndSubmit();
    });

    const input = mocks.ended.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input.ambientSoundUsed).toBeUndefined();
    expect(input.ambientSoundSec).toBeUndefined();
  });

  it("종료 시점에 멀티 타이머 사용 기록을 읽어 싣고, 옵션이 없으면 none 을 싣는다", async () => {
    const used = renderHook(() => useStudyRoomSession(null, { multiTimerUsage: () => "pomodoro" }));
    await act(async () => {
      await used.result.current.endAndSubmit();
    });
    const social = renderHook(() => useStudyRoomSession(null, { roomType: "social" }));
    await act(async () => {
      await social.result.current.endAndSubmit();
    });

    expect(mocks.ended.mock.calls[0]?.[0]).toMatchObject({ multiTimer: "pomodoro" });
    expect(mocks.ended.mock.calls[1]?.[0]).toMatchObject({ multiTimer: "none" });
  });

  it("종료 시점에 마스코트 켜짐을 읽어 싣고, 옵션이 없는 소셜룸은 false 를 싣는다", async () => {
    const single = renderHook(() => useStudyRoomSession(null, { mascotOn: () => true }));
    await act(async () => {
      await single.result.current.endAndSubmit();
    });
    const social = renderHook(() => useStudyRoomSession(null, { roomType: "social" }));
    await act(async () => {
      await social.result.current.endAndSubmit();
    });

    expect(mocks.ended.mock.calls[0]?.[0]).toMatchObject({ mascotOn: true });
    expect(mocks.ended.mock.calls[1]?.[0]).toMatchObject({ mascotOn: false });
  });

  describe("소리별 재생 시간", () => {
    it("세션이 끝나면 재생 시간이 있는 소리마다 ambient_sound_played 를 한 번씩 보낸다", async () => {
      const ambientSoundPlays = () => [
        { id: "white", group: "noise" as const, sec: 120 },
        { id: "lofi-breeze", group: "music" as const, sec: 45 },
      ];
      const hook = renderHook(() => useStudyRoomSession(null, { ambientSoundPlays }));

      await act(async () => {
        await hook.result.current.endAndSubmit();
      });

      expect(mocks.played.mock.calls).toEqual([
        [{ soundId: "white", group: "noise", playSec: 120, roomType: "single" }],
        [{ soundId: "lofi-breeze", group: "music", playSec: 45, roomType: "single" }],
      ]);
    });

    it("제출을 다시 시도해도 다시 보내지 않는다", async () => {
      const ambientSoundPlays = () => [{ id: "white", group: "noise" as const, sec: 120 }];
      const hook = renderHook(() => useStudyRoomSession(null, { ambientSoundPlays }));

      await act(async () => {
        await hook.result.current.endAndSubmit();
      });
      await act(async () => {
        await hook.result.current.endAndSubmit();
      });

      expect(mocks.played).toHaveBeenCalledTimes(1);
    });

    it("재생 시간이 없는 소리는 보내지 않는다", async () => {
      const ambientSoundPlays = () => [{ id: "white", group: "noise" as const, sec: 0 }];
      const hook = renderHook(() => useStudyRoomSession(null, { ambientSoundPlays }));

      await act(async () => {
        await hook.result.current.endAndSubmit();
      });

      expect(mocks.played).not.toHaveBeenCalled();
    });
  });
});
