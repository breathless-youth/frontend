import type { PlannerDayResponse } from "@focusmakers/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { postToNative, subscribeToNativeMessages } from "@/lib/bridge";
import { plannerKeys } from "@/lib/plannerQueries";
import { ApiError } from "@/lib/api";
import type { HomeDay, HomeGoal, HomeV3Gateway } from "./HomeV3Gateway";
import type { HomeGoalSaveInput, HomeGoalSaveResult } from "./HomeGoalSheet";
import type { HomeLoadState, HomeTodayStats } from "./HomeV3Content";
import { selectHomeBand, type HomeBand, type HomeMission } from "./homeV3Model";

export const homeV3Keys = {
  account: (userId: number) => ["home-v3", userId] as const,
  mission: (userId: number) => ["home-v3", userId, "mission"] as const,
  goals: plannerKeys.user,
  goal: (userId: number, day: HomeDay) => plannerKeys.day(userId, day.dateKey, day.timeZone),
};

function isHomeMission(value: unknown): value is HomeMission {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    typeof value.version === "string" &&
    "completedSteps" in value &&
    (value.completedSteps === 0 || value.completedSteps === 1 || value.completedSteps === 2)
  );
}
function preserveMissionProgress(current: unknown, incoming: unknown): unknown {
  // 캐시 확정 시 비교해야 동시 조회가 완료 확인을 되돌리지 않는다. 서버의 충족 여부와 측정값은 보정하지 않는다.
  if (
    isHomeMission(current) &&
    isHomeMission(incoming) &&
    current.version === incoming.version &&
    current.completedSteps > incoming.completedSteps
  )
    return current;
  return incoming;
}
export function projectHomeGoal(data: PlannerDayResponse): HomeGoal {
  return {
    seconds: data.goal.goalSec,
    defaultSeconds: data.goal.defaultGoalSec,
    remainingTasks: data.subjects
      .filter((subject) => !subject.deleted)
      .flatMap((subject) => subject.tasks)
      .filter((task) => !task.done && !task.dismissed).length,
  };
}

export function useHomeV3Progress(
  gateway: HomeV3Gateway,
  userId: number,
  day: HomeDay,
  stats: HomeLoadState<HomeTodayStats>,
) {
  const client = useQueryClient();
  const completingRef = useRef(false);
  const mission = useQuery({
    queryKey: homeV3Keys.mission(userId),
    queryFn: ({ signal }) => gateway.readMission(signal),
    structuralSharing: preserveMissionProgress,
    staleTime: 0,
  });
  // 플래너와 같은 원본 캐시를 읽되 화면에는 목표만 투영한다. 마지막 미션 중에도 목표를 미리 읽는다.
  const goal = useQuery({
    queryKey: homeV3Keys.goal(userId, day),
    queryFn: ({ signal }) => gateway.readPlannerDay(day, signal),
    select: projectHomeGoal,
    staleTime: 0,
  });
  useEffect(
    () =>
      subscribeToNativeMessages((message) => {
        if (message.type === "session-closed") {
          void client.invalidateQueries({ queryKey: homeV3Keys.mission(userId) });
          void client.invalidateQueries({ queryKey: homeV3Keys.goals(userId) });
          void client.invalidateQueries({ queryKey: ["subjects"] });
        }
      }),
    [client, userId],
  );
  const acknowledgement = useMutation({
    mutationFn: ({ adapter, step }: { adapter: HomeV3Gateway; owner: number; step: 1 | 2 }) =>
      adapter.acknowledgeMission(step),
    networkMode: "always",
    retry: false,
    onMutate: ({ owner }) => client.cancelQueries({ queryKey: homeV3Keys.mission(owner) }),
    onSuccess: (result, { owner }) => client.setQueryData(homeV3Keys.mission(owner), result),
    onError: (error, { owner }) => {
      if (error instanceof ApiError && error.status === 400)
        void client.invalidateQueries({ queryKey: homeV3Keys.mission(owner) });
    },
  });
  const goalSave = useMutation({
    networkMode: "always",
    retry: false,
    mutationFn: async ({
      adapter,
      owner,
      day: editedDay,
      input,
    }: {
      adapter: HomeV3Gateway;
      owner: number;
      day: HomeDay;
      input: HomeGoalSaveInput;
    }): Promise<HomeGoalSaveResult> => {
      if (!input.defaultOnly) {
        const saved = await adapter.saveDateGoal(editedDay, input.seconds);
        client.setQueryData<PlannerDayResponse>(homeV3Keys.goal(owner, editedDay), (previous) =>
          previous ? { ...previous, goal: saved } : undefined,
        );
      }
      let defaultSaved = true;
      if (input.asDefault) {
        try {
          await adapter.saveDefaultGoal(editedDay, input.seconds);
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") throw error;
          defaultSaved = false;
        }
      }
      await client.invalidateQueries({ queryKey: homeV3Keys.goals(owner) });
      postToNative({ type: "records-changed", atMs: Date.now() });
      return { defaultSaved };
    },
  });
  let band: HomeLoadState<HomeBand>;
  if (mission.data === undefined)
    band = mission.isError
      ? {
          status: "error",
          retry: () => {
            void mission.refetch();
          },
        }
      : { status: "pending" };
  else if (mission.data.currentStep !== null)
    band = { status: "success", value: selectHomeBand(mission.data, 0, null) };
  else if (goal.data === undefined)
    band = goal.isError
      ? {
          status: "error",
          retry: () => {
            void goal.refetch();
          },
        }
      : { status: "pending" };
  else if ((goal.data.seconds ?? 0) > 0 && stats.status !== "success") band = stats;
  else
    band = {
      status: "success",
      value: selectHomeBand(
        mission.data,
        stats.status === "success" ? stats.value.focusSeconds : 0,
        goal.data.seconds,
      ),
    };

  function completeMission(step: 1 | 2) {
    if (
      completingRef.current ||
      band.status !== "success" ||
      band.value.kind !== "mission" ||
      !band.value.ready ||
      band.value.step !== step
    )
      return;
    completingRef.current = true;
    void acknowledgement
      .mutateAsync({ adapter: gateway, owner: userId, step })
      .catch(() => undefined)
      .finally(() => {
        completingRef.current = false;
      });
  }
  return {
    band,
    goal: goal.data,
    completingMission: acknowledgement.isPending,
    missionError: acknowledgement.isError,
    completeMission,
    saveGoal: (editedDay: HomeDay, input: HomeGoalSaveInput) =>
      goalSave.mutateAsync({ adapter: gateway, owner: userId, day: editedDay, input }),
  };
}
