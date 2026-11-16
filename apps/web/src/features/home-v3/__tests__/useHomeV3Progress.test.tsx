import type { HomeMissionResponse } from "@focusmakers/types";
import { plannerDay, plannerSubject, plannerTask } from "@/test/plannerFixtures";
import { homeMission } from "@/test/homeMissionFixtures";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HomeV3Gateway } from "../HomeV3Gateway";
import { homeV3Keys, useHomeV3Progress } from "../useHomeV3Progress";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { ApiError } from "@/lib/api";
import type * as Amplitude from "@/lib/amplitude";
import { trackHomeGoalSaved, trackHomeMissionStepCompleted } from "@/lib/amplitude";

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackHomeMissionStepCompleted: vi.fn(),
  trackHomeGoalSaved: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(trackHomeMissionStepCompleted).mockReset();
  vi.mocked(trackHomeGoalSaved).mockReset();
});

function setup(overrides: Partial<HomeV3Gateway> = {}) {
  const gateway: HomeV3Gateway = {
    readMission: vi.fn().mockResolvedValue(homeMission(0, 300)),
    acknowledgeMission: vi.fn().mockResolvedValue(homeMission(1, 300)),
    claimMissionReward: vi.fn(),
    readPlannerDay: vi.fn().mockResolvedValue(
      plannerDay({
        date: "2026-11-07",
        goal: { goalSec: 28800, individualGoalSec: 28800, defaultGoalSec: 28800 },
      }),
    ),
    saveDateGoal: vi.fn().mockImplementation(async (_day, seconds: number) => ({
      goalSec: seconds,
      individualGoalSec: seconds,
      defaultGoalSec: 28800,
    })),
    saveDefaultGoal: vi.fn().mockResolvedValue(undefined),
    startStudy: vi.fn(),
    ...overrides,
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { gateway, client, wrapper };
}
const day = { dateKey: "2026-11-07", timeZone: "Asia/Seoul" };
const stats = {
  status: "success" as const,
  value: { studySeconds: 15512, focusSeconds: 13337, focusRate: 86 },
};

describe("home v3 server progress", () => {
  /**
   * Value: protects=a new mission version can restart completed steps;
   * fails_when=monotonic mission merging ignores the version boundary;
   * why_new=existing stale-response fixtures all use the same version;
   * seam=none;
   * no_claim=backend rollout acceptance, mocked gateway.
   */
  it("accepts lower completion when the server starts a new mission version", async () => {
    const nextMission = { ...homeMission(0, 0, false), version: "home-v4" };
    const { gateway, client, wrapper } = setup({
      readMission: vi.fn().mockResolvedValueOnce(homeMission(2)).mockResolvedValue(nextMission),
    });
    const { result } = renderHook(() => useHomeV3Progress(gateway, 7, day, stats), { wrapper });
    await waitFor(() => expect(result.current.band).toMatchObject({ value: { kind: "goal" } }));

    await act(async () => {
      await client.invalidateQueries({ queryKey: homeV3Keys.mission(7) });
    });

    expect(client.getQueryData(homeV3Keys.mission(7))).toEqual(nextMission);
    await waitFor(() =>
      expect(result.current.band).toMatchObject({
        value: { kind: "mission", step: 1, ready: false, progress: 0 },
      }),
    );
  });

  /**
   * Value: protects=an ineligible acknowledgement refreshes authoritative readiness;
   * fails_when=HTTP 400 no longer refetches mission eligibility;
   * why_new=the existing acknowledgement failure test only rejects a generic error;
   * seam=none;
   * no_claim=live server validation, mocked gateway.
   */
  it("refetches authoritative mission readiness after an HTTP 400 acknowledgement", async () => {
    const authoritativeMission = homeMission(0, 0, false);
    const { gateway, client, wrapper } = setup({
      readMission: vi
        .fn()
        .mockResolvedValueOnce(homeMission(0, 300, true))
        .mockResolvedValue(authoritativeMission),
      acknowledgeMission: vi
        .fn()
        .mockRejectedValue(new ApiError("not eligible", 400, "BAD_REQUEST")),
    });
    const { result } = renderHook(() => useHomeV3Progress(gateway, 7, day, stats), { wrapper });
    await waitFor(() =>
      expect(result.current.band).toMatchObject({ value: { step: 1, ready: true } }),
    );

    act(() => result.current.completeMission(1));

    await waitFor(() =>
      expect(result.current.band).toMatchObject({ value: { step: 1, ready: false } }),
    );
    expect(gateway.acknowledgeMission).toHaveBeenCalledExactlyOnceWith(1);
    expect(gateway.readMission).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(homeV3Keys.mission(7))).toEqual(authoritativeMission);
    expect(result.current.missionError).toBe(true);
    expect(trackHomeMissionStepCompleted).not.toHaveBeenCalled();
  });

  it("records the mission step once after the server saves it", async () => {
    const { gateway, wrapper } = setup({
      readMission: vi.fn().mockResolvedValue(homeMission(0, 300, true)),
    });
    const { result } = renderHook(() => useHomeV3Progress(gateway, 7, day, stats), { wrapper });
    await waitFor(() =>
      expect(result.current.band).toMatchObject({ value: { step: 1, ready: true } }),
    );

    act(() => result.current.completeMission(1));

    await waitFor(() => expect(trackHomeMissionStepCompleted).toHaveBeenCalledExactlyOnceWith(1));
  });

  /**
   * Value: protects=the Home planner count includes only remaining visible tasks;
   * fails_when=deleted subjects or done or dismissed tasks are counted;
   * why_new=existing planner-day cache fixtures do not assert task filtering;
   * seam=none;
   * no_claim=server filtering policy, planner response fixtures.
   */
  it("counts remaining tasks across live subjects without deleted, done or dismissed tasks", async () => {
    const { gateway, wrapper } = setup({
      readPlannerDay: vi.fn().mockResolvedValue(
        plannerDay({
          subjects: [
            plannerSubject({
              tasks: [
                plannerTask({ key: "t:1", taskId: 1 }),
                plannerTask({ key: "t:2", taskId: 2, done: true }),
                plannerTask({ key: "t:3", taskId: 3, dismissed: true }),
                plannerTask({ key: "t:4", taskId: 4, done: true, dismissed: true }),
              ],
            }),
            plannerSubject({
              id: 4,
              deleted: true,
              tasks: [plannerTask({ key: "t:5", taskId: 5, subjectId: 4 })],
            }),
            plannerSubject({
              id: 5,
              tasks: [plannerTask({ key: "t:6", taskId: 6, subjectId: 5 })],
            }),
          ],
        }),
      ),
    });
    const { result } = renderHook(() => useHomeV3Progress(gateway, 7, day, stats), { wrapper });

    await waitFor(() => expect(result.current.goal?.remainingTasks).toBe(2));
  });

  it("reads the canonical planner day cache and reacts to planner changes without another home cache", async () => {
    const { gateway, client, wrapper } = setup({
      readMission: vi.fn().mockResolvedValue(homeMission(2)),
    });
    const { result } = renderHook(() => useHomeV3Progress(gateway, 7, day, stats), { wrapper });
    await waitFor(() =>
      expect(result.current.band).toMatchObject({ value: { kind: "goal", percent: 46 } }),
    );
    act(() => {
      client.setQueryData(
        ["planner", 7, "day", day.dateKey, day.timeZone],
        plannerDay({ goal: { goalSec: 14400, individualGoalSec: 14400, defaultGoalSec: 28800 } }),
      );
    });
    await waitFor(() =>
      expect(result.current.band).toMatchObject({ value: { kind: "goal", percent: 93 } }),
    );
    expect(client.getQueryData(["home-v3", 7, "goal", day.dateKey, day.timeZone])).toBeUndefined();
  });
  it("preserves acknowledgement when a later refetch and acknowledgement resolve together", async () => {
    let finishAck!: (mission: HomeMissionResponse) => void;
    let finishRead!: (mission: HomeMissionResponse) => void;
    const { gateway, client, wrapper } = setup({
      acknowledgeMission: vi.fn().mockReturnValue(
        new Promise((resolve) => {
          finishAck = resolve;
        }),
      ),
    });
    const { result } = renderHook(() => useHomeV3Progress(gateway, 7, day, stats), { wrapper });
    await waitFor(() =>
      expect(result.current.band).toMatchObject({ value: { step: 1, ready: true } }),
    );
    act(() => result.current.completeMission(1));
    await waitFor(() => expect(gateway.acknowledgeMission).toHaveBeenCalledOnce());
    vi.mocked(gateway.readMission).mockReturnValueOnce(
      new Promise((resolve) => {
        finishRead = resolve;
      }),
    );
    let read!: Promise<void>;
    act(() => {
      read = client.invalidateQueries({ queryKey: homeV3Keys.mission(7) });
    });
    await waitFor(() => expect(gateway.readMission).toHaveBeenCalledTimes(2));
    await act(async () => {
      finishAck(homeMission(1, 300));
      finishRead(homeMission(0, 300));
      await read;
    });
    await waitFor(() => expect(result.current.completingMission).toBe(false));
    expect(client.getQueryData(homeV3Keys.mission(7))).toMatchObject({ completedSteps: 1 });
  });
  it("does not let an older read undo a successful acknowledgement", async () => {
    let finish!: (mission: HomeMissionResponse) => void;
    const { gateway, client, wrapper } = setup();
    const { result } = renderHook(() => useHomeV3Progress(gateway, 7, day, stats), { wrapper });
    await waitFor(() =>
      expect(result.current.band).toMatchObject({ value: { step: 1, ready: true } }),
    );
    vi.mocked(gateway.readMission).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    let oldRead: Promise<void>;
    act(() => {
      oldRead = client.invalidateQueries({ queryKey: homeV3Keys.mission(7) });
    });
    await waitFor(() => expect(gateway.readMission).toHaveBeenCalledTimes(2));
    act(() => result.current.completeMission(1));
    await waitFor(() => expect(result.current.band).toMatchObject({ value: { step: 2 } }));
    await act(async () => {
      finish(homeMission(0, 300));
      await oldRead;
    });
    await waitFor(() =>
      expect(client.getQueryState(homeV3Keys.mission(7))?.fetchStatus).toBe("idle"),
    );
    expect(client.getQueryData(homeV3Keys.mission(7))).toMatchObject({ completedSteps: 1 });
    expect(result.current.band).toMatchObject({ value: { step: 2 } });
  });
  it("refreshes server mission progress after native session submission finishes", async () => {
    const { gateway, wrapper } = setup({
      readMission: vi
        .fn()
        .mockResolvedValueOnce(homeMission(1, 100))
        .mockResolvedValue(homeMission(1, 300)),
    });
    const { result } = renderHook(() => useHomeV3Progress(gateway, 7, day, stats), { wrapper });
    await waitFor(() =>
      expect(result.current.band).toMatchObject({ value: { step: 2, ready: false } }),
    );
    act(() => {
      const receiver = Reflect.get(globalThis, NATIVE_MESSAGE_ENTRY) as
        ((raw: string) => void) | undefined;
      receiver?.(JSON.stringify({ type: "session-closed", atMs: Date.now() }));
    });
    await waitFor(() =>
      expect(result.current.band).toMatchObject({ value: { step: 2, ready: true } }),
    );
  });
  it("does not advance optimistically and ignores duplicate acknowledgements", async () => {
    let finish!: (value: { completedSteps: 1; measuredFocusSec: number }) => void;
    const { gateway, wrapper } = setup({
      acknowledgeMission: vi.fn().mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      ),
    });
    const { result } = renderHook(() => useHomeV3Progress(gateway, 7, day, stats), { wrapper });
    await waitFor(() => expect(result.current.band.status).toBe("success"));
    act(() => {
      result.current.completeMission(1);
      result.current.completeMission(1);
    });
    await waitFor(() => expect(gateway.acknowledgeMission).toHaveBeenCalledOnce());
    expect(result.current.band).toMatchObject({ value: { step: 1 } });
    await act(async () => {
      finish(homeMission(1, 300));
    });
    await waitFor(() =>
      expect(result.current.band).toMatchObject({ value: { step: 2, ready: true } }),
    );
  });

  it("keeps a failed acknowledgement on the same step", async () => {
    const { gateway, wrapper } = setup({
      acknowledgeMission: vi.fn().mockRejectedValue(new Error("offline")),
    });
    const { result } = renderHook(() => useHomeV3Progress(gateway, 7, day, stats), { wrapper });
    await waitFor(() => expect(result.current.band.status).toBe("success"));
    act(() => result.current.completeMission(1));
    await waitFor(() => expect(result.current.missionError).toBe(true));
    expect(result.current.band).toMatchObject({ value: { step: 1, ready: true } });
  });

  it("shows a prefetched goal immediately after the last acknowledgement", async () => {
    const { gateway, wrapper } = setup({
      readMission: vi.fn().mockResolvedValue(homeMission(1, 300)),
      acknowledgeMission: vi.fn().mockResolvedValue(homeMission(2, 300)),
    });
    const { result } = renderHook(() => useHomeV3Progress(gateway, 7, day, stats), { wrapper });
    await waitFor(() => expect(result.current.goal).toBeDefined());
    act(() => result.current.completeMission(2));
    await waitFor(() =>
      expect(result.current.band).toMatchObject({
        value: { kind: "goal", percent: 46, remainingSeconds: 15463 },
      }),
    );
  });

  it("keeps the date goal after default save fails and retries only default", async () => {
    const { gateway, client, wrapper } = setup({
      saveDefaultGoal: vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce(undefined),
    });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useHomeV3Progress(gateway, 7, day, stats), { wrapper });
    let saved: unknown;
    await act(async () => {
      saved = await result.current.saveGoal(day, {
        seconds: 0,
        asDefault: true,
        defaultOnly: false,
      });
    });
    expect(saved).toEqual({ defaultSaved: false });
    expect(gateway.saveDateGoal).toHaveBeenCalledWith(day, 0);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["planner", 7] });
    await act(async () => {
      saved = await result.current.saveGoal(day, {
        seconds: 0,
        asDefault: true,
        defaultOnly: true,
      });
    });
    expect(saved).toEqual({ defaultSaved: true });
    expect(gateway.saveDateGoal).toHaveBeenCalledOnce();
    expect(trackHomeGoalSaved).toHaveBeenCalledExactlyOnceWith({ seconds: 0, asDefault: false });
  });

  it("records the saved goal with whether it also became the default", async () => {
    const { gateway, wrapper } = setup();
    const { result } = renderHook(() => useHomeV3Progress(gateway, 7, day, stats), { wrapper });

    await act(async () => {
      await result.current.saveGoal(day, { seconds: 5400, asDefault: true, defaultOnly: false });
    });
    await act(async () => {
      await result.current.saveGoal(day, { seconds: 3600, asDefault: false, defaultOnly: false });
    });

    expect(vi.mocked(trackHomeGoalSaved).mock.calls).toEqual([
      [{ seconds: 5400, asDefault: true }],
      [{ seconds: 3600, asDefault: false }],
    ]);
    expect(gateway.saveDefaultGoal).toHaveBeenCalledOnce();
  });

  it("does not record a goal when the date goal fails to save", async () => {
    const { gateway, wrapper } = setup({
      saveDateGoal: vi.fn().mockRejectedValue(new Error("offline")),
    });
    const { result } = renderHook(() => useHomeV3Progress(gateway, 7, day, stats), { wrapper });

    await act(async () => {
      await result.current
        .saveGoal(day, { seconds: 5400, asDefault: true, defaultOnly: false })
        .catch(() => undefined);
    });

    expect(trackHomeGoalSaved).not.toHaveBeenCalled();
  });

  it("separates accounts and local calendar dates", async () => {
    const { gateway, client, wrapper } = setup();
    const { rerender } = renderHook(
      ({ user, date }) => useHomeV3Progress(gateway, user, { ...day, dateKey: date }, stats),
      { initialProps: { user: 7, date: day.dateKey }, wrapper },
    );
    await waitFor(() => expect(client.getQueryData(homeV3Keys.goal(7, day))).toBeDefined());
    rerender({ user: 8, date: "2026-11-08" });
    await waitFor(() =>
      expect(
        client.getQueryData(homeV3Keys.goal(8, { ...day, dateKey: "2026-11-08" })),
      ).toBeDefined(),
    );
    expect(client.getQueryData(homeV3Keys.goal(8, day))).toBeUndefined();
  });

  describe("미션 포인트", () => {
    it("포인트를 쓰는 사용자가 미션을 끝냈는데 안 받은 포인트가 있으면 받기 띠를 보인다", async () => {
      const { gateway, wrapper } = setup({
        readMission: vi.fn().mockResolvedValue({ ...homeMission(2, 300), claimablePoints: 150 }),
      });
      const { result } = renderHook(() => useHomeV3Progress(gateway, 1, day, stats, true), {
        wrapper,
      });
      await waitFor(() =>
        expect(result.current.band).toEqual({
          status: "success",
          value: { kind: "mission-reward", points: 150 },
        }),
      );
    });

    it("포인트를 쓰지 않는 사용자에게는 받기 띠를 보이지 않는다", async () => {
      const { gateway, wrapper } = setup({
        readMission: vi.fn().mockResolvedValue({ ...homeMission(2, 300), claimablePoints: 150 }),
      });
      const { result } = renderHook(() => useHomeV3Progress(gateway, 1, day, stats), { wrapper });
      await waitFor(() => expect(result.current.band.status).toBe("success"));
      expect(result.current.band).toMatchObject({ value: { kind: "goal" } });
    });

    it("받으면 잔액을 서버 값으로 덮고 목표 띠로 넘어간다", async () => {
      const { gateway, client, wrapper } = setup({
        readMission: vi.fn().mockResolvedValue({ ...homeMission(2, 300), claimablePoints: 150 }),
        claimMissionReward: vi.fn().mockResolvedValue({ granted: true, points: 150, balance: 450 }),
      });
      const { result } = renderHook(() => useHomeV3Progress(gateway, 1, day, stats, true), {
        wrapper,
      });
      await waitFor(() =>
        expect(result.current.band).toMatchObject({ value: { kind: "mission-reward" } }),
      );

      act(() => result.current.claimMissionReward());

      await waitFor(() => expect(result.current.band).toMatchObject({ value: { kind: "goal" } }));
      expect(client.getQueryData(["points", 1, "balance"])).toBe(450);
    });

    it("서버가 받기를 회원 전용이라고 거절하면 실패 문구 대신 로그인 화면을 열게 한다", async () => {
      const { gateway, wrapper } = setup({
        readMission: vi.fn().mockResolvedValue({ ...homeMission(2, 300), claimablePoints: 150 }),
        claimMissionReward: vi
          .fn()
          .mockRejectedValue(new ApiError("member only", 403, "MEMBER_ONLY")),
      });
      const { result } = renderHook(() => useHomeV3Progress(gateway, 1, day, stats, true), {
        wrapper,
      });
      await waitFor(() =>
        expect(result.current.band).toMatchObject({ value: { kind: "mission-reward" } }),
      );
      const onMemberOnly = vi.fn();

      act(() => result.current.claimMissionReward(onMemberOnly));

      await waitFor(() => expect(onMemberOnly).toHaveBeenCalledOnce());
      expect(result.current.rewardError).toBe(false);
    });

    it("단계를 끝내며 포인트를 받으면 잔액을 다시 읽게 한다", async () => {
      const { gateway, client, wrapper } = setup({
        acknowledgeMission: vi
          .fn()
          .mockResolvedValue({ ...homeMission(1, 300), rewardedPoints: 50 }),
      });
      client.setQueryData(["points", 1, "balance"], 300);
      const { result } = renderHook(() => useHomeV3Progress(gateway, 1, day, stats, true), {
        wrapper,
      });
      await waitFor(() => expect(result.current.band.status).toBe("success"));

      act(() => result.current.completeMission(1));

      await waitFor(() =>
        expect(client.getQueryState(["points", 1, "balance"])?.isInvalidated).toBe(true),
      );
    });

    it("보상을 받으면 실제로 받은 금액을 잔액 연출로 넘긴다", async () => {
      const { gateway, wrapper } = setup({
        readMission: vi.fn().mockResolvedValue({ ...homeMission(2, 300), claimablePoints: 150 }),
        claimMissionReward: vi.fn().mockResolvedValue({ granted: true, points: 120, balance: 420 }),
      });
      const { result } = renderHook(() => useHomeV3Progress(gateway, 1, day, stats, true), {
        wrapper,
      });
      await waitFor(() =>
        expect(result.current.band).toMatchObject({ value: { kind: "mission-reward" } }),
      );
      expect(result.current.gain).toBeNull();

      act(() => result.current.claimMissionReward());

      await waitFor(() => expect(result.current.gain).toMatchObject({ points: 120 }));
    });

    it("다른 기기에서 이미 받은 보상이면 잔액 연출을 띄우지 않는다", async () => {
      const { gateway, client, wrapper } = setup({
        readMission: vi.fn().mockResolvedValue({ ...homeMission(2, 300), claimablePoints: 150 }),
        claimMissionReward: vi
          .fn()
          .mockResolvedValue({ granted: false, points: 150, balance: 450 }),
      });
      const { result } = renderHook(() => useHomeV3Progress(gateway, 1, day, stats, true), {
        wrapper,
      });
      await waitFor(() =>
        expect(result.current.band).toMatchObject({ value: { kind: "mission-reward" } }),
      );

      act(() => result.current.claimMissionReward());

      await waitFor(() => expect(client.getQueryData(["points", 1, "balance"])).toBe(450));
      expect(result.current.gain).toBeNull();
    });

    it("단계를 끝내며 받은 포인트도 같은 잔액 연출로 넘기고 받을 때마다 새로 띄운다", async () => {
      const { gateway, wrapper } = setup({
        readMission: vi.fn().mockResolvedValue(homeMission(0, 0)),
        acknowledgeMission: vi
          .fn()
          .mockResolvedValueOnce({ ...homeMission(1, 300), rewardedPoints: 50 })
          .mockResolvedValueOnce({ ...homeMission(2, 300), rewardedPoints: 100 }),
      });
      const { result } = renderHook(() => useHomeV3Progress(gateway, 1, day, stats, true), {
        wrapper,
      });
      await waitFor(() => expect(result.current.band.status).toBe("success"));

      act(() => result.current.completeMission(1));
      await waitFor(() => expect(result.current.gain).toMatchObject({ points: 50 }));
      const first = result.current.gain;

      await waitFor(() =>
        expect(result.current.band).toMatchObject({ value: { kind: "mission", step: 2 } }),
      );
      act(() => result.current.completeMission(2));
      await waitFor(() => expect(result.current.gain).toMatchObject({ points: 100 }));
      expect(result.current.gain?.id).not.toBe(first?.id);
    });

    it("포인트 없이 단계를 끝내면 잔액 연출을 띄우지 않는다", async () => {
      const { gateway, wrapper } = setup({
        acknowledgeMission: vi
          .fn()
          .mockResolvedValue({ ...homeMission(1, 300), rewardedPoints: 0 }),
      });
      const { result } = renderHook(() => useHomeV3Progress(gateway, 1, day, stats, true), {
        wrapper,
      });
      await waitFor(() => expect(result.current.band.status).toBe("success"));

      act(() => result.current.completeMission(1));

      await waitFor(() => expect(gateway.acknowledgeMission).toHaveBeenCalledOnce());
      await waitFor(() => expect(result.current.completingMission).toBe(false));
      expect(result.current.gain).toBeNull();
    });
  });
});
