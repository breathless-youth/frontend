import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";

import {
  createMockSystemPauseSource,
  createSystemPauseSource,
} from "../adapters/systemPauseSource";
import type { RestoredSession } from "../restoreActiveSession";
import { wasPausedAtReport } from "../sessionResume";
import { AWAY_LIMIT_MS } from "../sessionTuning";
import type { StudyRoomSessionOptions } from "../useStudyRoomSession";
import { useStudyRoomSession } from "../useStudyRoomSession";

const mocks = vi.hoisted(() => ({ ended: vi.fn() }));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackStudySessionEnded: mocks.ended,
}));

const NOW = Date.UTC(2026, 10, 20, 1, 0, 0);

/** 로그인한 자율 모드 세션이라 진행 보고와 제출이 나간다. */
function setup(options: StudyRoomSessionOptions = {}) {
  const systemPause = createMockSystemPauseSource();
  const hook = renderHook(() =>
    useStudyRoomSession(1, { systemPause, source: "TIMER", ...options }),
  );
  return { ...hook, systemPause };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function requests(method: "PUT" | "POST") {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => (init as RequestInit).method === method)
    .map(([, init]) => ({
      init: init as RequestInit,
      body: JSON.parse((init as RequestInit).body as string) as Record<string, unknown>,
    }));
}

/** 첫 진행 보고를 붙잡아 두고 끝내는 함수를 돌려준다. */
function holdFirstPut() {
  let finish: () => void = () => {};
  const ok = { ok: true, status: 200, json: () => Promise.resolve([]) };
  let held = false;
  vi.mocked(fetch).mockImplementation((_url, init) => {
    if (held || init?.method !== "PUT") {
      return Promise.resolve(ok as Response);
    }
    held = true;
    return new Promise<Response>((resolve) => {
      finish = () => resolve(ok as Response);
    });
  });
  return () => finish();
}

describe("useStudyRoomSession 자율 모드 앱 밖", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve([]) }),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("화면이 숨어도 일시정지하지 않고 돌아오면 앱 밖 시간이 공부 시간에 들어간다", async () => {
    const { result, systemPause } = setup();
    await advance(5 * 60_000);

    act(() => systemPause.leave());
    expect(result.current.sessionState).toEqual({ kind: "FOCUS" });
    vi.setSystemTime(Date.now() + 10 * 60_000);
    act(() => systemPause.return());
    await advance(200);

    expect(result.current.studySec).toBe(15 * 60);
    expect(result.current.focusSec).toBe(15 * 60);
  });

  it("관리 모드는 화면이 숨으면 지금처럼 BACKGROUND로 일시정지한다", () => {
    const { result, systemPause } = setup({ source: "MEASURED" });

    act(() => systemPause.leave());

    expect(result.current.sessionState).toEqual({ kind: "PAUSE", trigger: "BACKGROUND" });
  });

  it("직접 일시정지한 채 나가면 일시정지가 그대로이고 돌아와도 이어지지 않는다", () => {
    const { result, systemPause } = setup();

    act(() => result.current.pause());
    act(() => systemPause.leave());
    act(() => systemPause.return());

    expect(result.current.sessionState).toEqual({ kind: "PAUSE", trigger: "MANUAL" });
  });

  it("휴식 중에 나가면 지금처럼 일시정지로 끊는다", () => {
    const { result, systemPause } = setup();

    act(() => result.current.startBreak());
    act(() => systemPause.leave());

    expect(result.current.sessionState).toEqual({ kind: "PAUSE", trigger: "BACKGROUND" });
  });

  it("나갈 때 keepalive로 한 번 보고하고 앱 밖에 있는 동안은 30초 보고를 보내지 않는다", async () => {
    const { systemPause } = setup();
    await advance(10_000);

    act(() => systemPause.leave());
    await advance(1);
    // 첫 보고는 공부를 시작하자마자 나간다.
    expect(requests("PUT")).toHaveLength(2);
    expect(requests("PUT")[1]!.init.keepalive).toBe(true);

    await advance(90_000);
    expect(requests("PUT")).toHaveLength(2);
  });

  it("30초 보고가 끝나지 않았어도 나가는 보고를 keepalive로 바로 보낸다", async () => {
    const { systemPause } = setup();
    // 공부를 시작하자마자 나가는 첫 보고가 끝난 뒤부터 붙잡아야 30초 보고가 매달린다.
    await advance(1);
    expect(requests("PUT")).toHaveLength(1);
    const finishFirst = holdFirstPut();
    await advance(30_000);
    expect(requests("PUT")).toHaveLength(2);

    act(() => systemPause.leave());
    await advance(1);
    const puts = requests("PUT");
    expect(puts).toHaveLength(3);
    expect(puts[2]!.init.keepalive).toBe(true);

    finishFirst();
    await advance(90_000);
    expect(requests("PUT")).toHaveLength(3);

    act(() => systemPause.return());
    await advance(1);
    expect(requests("PUT")).toHaveLength(4);
    await advance(30_000);
    expect(requests("PUT")).toHaveLength(5);
  });

  it("숨김과 pagehide가 잇달아 와도 나가는 보고는 한 번이다", async () => {
    const finishFirst = holdFirstPut();
    const { unmount } = setup({ systemPause: createSystemPauseSource(document) });
    await advance(30_000);
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    try {
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("pagehide"));
      });
      await advance(1);
      expect(requests("PUT").filter(({ init }) => init.keepalive === true)).toHaveLength(1);

      finishFirst();
      await advance(1);
      expect(requests("PUT")).toHaveLength(2);
    } finally {
      unmount();
      visibility.mockRestore();
    }
  });

  it.each([
    ["직접 일시정지한 채", "pause"],
    ["휴식 중에", "startBreak"],
  ] as const)(
    "%s 나가면 일시정지로 끝나는 보고를 keepalive로 한 번 보내고 앱 밖에서는 30초 보고를 멈춘다",
    async (_label, action) => {
      const { result, systemPause } = setup();
      await advance(10_000);
      act(() => result.current[action]());
      await advance(5_000);

      act(() => systemPause.leave());
      await advance(1);
      // 첫 보고는 공부를 시작하자마자 나간다.
      const puts = requests("PUT");
      expect(puts).toHaveLength(2);
      expect(puts[1]!.init.keepalive).toBe(true);
      const body = puts[1]!.body as {
        startedAt: string;
        reportedAt: string;
        events: RestoredSession["events"];
      };
      expect(body.events.at(-1)).toMatchObject({ status: "PAUSE", endedAt: body.reportedAt });
      // 이 보고만 남고 앱이 죽어도 다시 열 때 일시정지 중이던 기록으로 읽힌다.
      const restored: RestoredSession = {
        startedAtMs: Date.parse(body.startedAt),
        reportedAtMs: Date.parse(body.reportedAt),
        baseStudySec: 0,
        baseFocusSec: 0,
        events: body.events,
        source: "TIMER",
      };
      expect(wasPausedAtReport(restored)).toBe(true);

      await advance(90_000);
      expect(requests("PUT")).toHaveLength(2);

      act(() => systemPause.return());
      await advance(1);
      expect(requests("PUT")).toHaveLength(3);
      expect(requests("PUT")[2]!.init.keepalive).toBe(false);
      await advance(30_000);
      expect(requests("PUT")).toHaveLength(4);
    },
  );

  it("일시정지한 채 2시간 넘게 나가 있으면 AWAY_LIMIT이 아니라 일시정지 자동 종료로 끝난다", async () => {
    const { result, systemPause } = setup();
    await advance(60_000);
    act(() => result.current.pause());
    act(() => systemPause.leave());

    await advance(AWAY_LIMIT_MS + 30 * 60_000);
    act(() => systemPause.return());
    await advance(0);

    expect(requests("POST")).toHaveLength(1);
    expect(result.current.endReason).toEqual({ kind: "AUTO", trigger: "MANUAL" });
  });

  it("2시간 안에 돌아오면 바로 보고하고 30초 보고를 다시 시작한다", async () => {
    const { systemPause } = setup();
    await advance(10_000);
    act(() => systemPause.leave());
    await advance(1);

    vi.setSystemTime(Date.now() + 30 * 60_000);
    act(() => systemPause.return());
    await advance(1);
    // 첫 보고는 공부를 시작하자마자 나간다.
    const puts = requests("PUT");
    expect(puts).toHaveLength(3);
    expect(puts[2]!.init.keepalive).toBe(false);

    await advance(30_000);
    expect(requests("PUT")).toHaveLength(4);
  });

  it("나가는 보고가 끝나지 않았어도 돌아온 보고를 keepalive 없이 바로 보낸다", async () => {
    const { systemPause } = setup();
    // 공부를 시작하자마자 나가는 첫 보고가 끝난 뒤부터 붙잡아야 나가는 보고가 매달린다.
    await advance(1);
    expect(requests("PUT")).toHaveLength(1);
    const finishLeave = holdFirstPut();
    await advance(10_000);
    act(() => systemPause.leave());
    await advance(1);
    expect(requests("PUT")).toHaveLength(2);

    vi.setSystemTime(Date.now() + 30 * 60_000);
    act(() => systemPause.return());
    await advance(1);
    const puts = requests("PUT");
    expect(puts).toHaveLength(3);
    expect(puts[2]!.init.keepalive).toBe(false);

    finishLeave();
    await advance(30_000);
    expect(requests("PUT")).toHaveLength(4);
  });

  it("2시간이 넘어 돌아오면 나간 시각에서 2시간까지만 기록하고 AWAY_LIMIT으로 끝낸다", async () => {
    const { result, systemPause } = setup();
    await advance(60_000);
    const leftAtMs = Date.now();
    act(() => systemPause.leave());
    await advance(1);

    vi.setSystemTime(leftAtMs + AWAY_LIMIT_MS + 30 * 60_000);
    act(() => systemPause.return());
    await advance(0);

    const [submitted] = requests("POST");
    expect(submitted!.body).toMatchObject({
      endedAt: new Date(leftAtMs + AWAY_LIMIT_MS).toISOString(),
      studySec: 60 + 7200,
    });
    expect(result.current.endReason).toEqual({ kind: "AUTO", trigger: "AWAY_LIMIT" });
    expect(mocks.ended).toHaveBeenCalledWith(
      expect.objectContaining({ endReason: "AWAY_LIMIT", pauseTrigger: null }),
    );
  });

  it("앱 밖에서 2시간이 되는 순간에도 같은 시각으로 끝낸다", async () => {
    const { systemPause } = setup({ tickMs: 60_000 });
    await advance(60_000);
    const leftAtMs = Date.now();
    act(() => systemPause.leave());

    await advance(AWAY_LIMIT_MS + 1);

    const [submitted] = requests("POST");
    expect(submitted!.body).toMatchObject({
      endedAt: new Date(leftAtMs + AWAY_LIMIT_MS).toISOString(),
    });
  });

  it("종료 시각 뒤에 시작한 휴식은 제출에서 빠진다", async () => {
    const { result, systemPause } = setup();
    await advance(60_000);
    const leftAtMs = Date.now();
    act(() => systemPause.leave());
    await advance(1);

    vi.setSystemTime(leftAtMs + AWAY_LIMIT_MS + 5 * 60_000);
    act(() => result.current.startBreak());
    act(() => systemPause.return());
    await advance(0);

    const [submitted] = requests("POST");
    expect(submitted!.body).toMatchObject({ events: [], studySec: 60 + 7200 });
  });
});
