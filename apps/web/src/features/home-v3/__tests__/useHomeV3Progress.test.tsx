import type { HomeMissionResponse } from "@focusmakers/types";
import { plannerDay } from "@/test/plannerFixtures";
import { homeMission } from "@/test/homeMissionFixtures";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";

import type { HomeV3Gateway } from "../HomeV3Gateway";
import { homeV3Keys, useHomeV3Progress } from "../useHomeV3Progress";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";

function setup(overrides: Partial<HomeV3Gateway> = {}) {
  const gateway: HomeV3Gateway = {
    readMission: vi.fn().mockResolvedValue(homeMission(0, 300)),
    acknowledgeMission: vi.fn().mockResolvedValue(homeMission(1, 300)),
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
});
