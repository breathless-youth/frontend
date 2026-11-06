import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  PlannerSubjectOrderRequest,
  PlannerTaskCreateRequest,
  PlannerTaskMoveRequest,
  PlannerTaskScope,
  PlannerTaskUpdateRequest,
  PlannerRepeatRequest,
  PlannerGoalRequest,
} from "@focusmakers/types";

import { ApiError } from "@/lib/api";
import { getTokenSource } from "@/lib/auth/tokenSource";
import { postToNative } from "@/lib/bridge";
import {
  createPlannerTask,
  deletePlannerTask,
  movePlannerTask,
  removePlannerSubject,
  reorderPlannerSubjects,
  selectPlannerSubject,
  updatePlannerTask,
  setPlannerTaskRepeat,
  setPlannerGoal,
  setPlannerDefaultGoal,
} from "@/lib/plannerApi";
import { plannerKeys } from "@/lib/plannerQueries";

import { usePlannerClock } from "./usePlannerClock";

export type PlannerPlanAction = (
  | { kind: "setGoal"; date: string; body: PlannerGoalRequest }
  | { kind: "setDefaultGoal"; body: PlannerGoalRequest }
  | { kind: "repeatTask"; key: string; body: PlannerRepeatRequest }
  | { kind: "createTask"; body: PlannerTaskCreateRequest }
  | { kind: "updateTask"; key: string; body: PlannerTaskUpdateRequest }
  | { kind: "moveTask"; key: string; body: PlannerTaskMoveRequest }
  | { kind: "deleteTask"; key: string; scope: PlannerTaskScope }
  | { kind: "selectSubject"; date: string; subjectId: number }
  | { kind: "removeSubject"; date: string; subjectId: number }
  | { kind: "reorderSubjects"; date: string; body: PlannerSubjectOrderRequest }
) & { ownerId?: number | null };

export function usePlannerPlanMutation(userId: number | null) {
  const queryClient = useQueryClient();
  const { timeZone } = usePlannerClock();
  return useMutation({
    mutationKey: userId === null ? plannerKeys.all : plannerKeys.user(userId),
    networkMode: "always",
    retry: false,
    onMutate: (action) => ({ userId: action.ownerId ?? userId }),
    mutationFn: async (action: PlannerPlanAction): Promise<unknown> => {
      const owner = action.ownerId ?? userId;
      const source = getTokenSource();
      if (owner === null || owner !== userId || (source !== null && source.getUserId() !== owner))
        throw new ApiError("planner identity unavailable", 401, "UNAUTHORIZED");
      switch (action.kind) {
        case "setGoal":
          return setPlannerGoal(action.date, action.body, { timeZone });
        case "setDefaultGoal":
          return setPlannerDefaultGoal(action.body, { timeZone });
        case "repeatTask":
          return setPlannerTaskRepeat(action.key, action.body, { timeZone });
        case "createTask":
          return createPlannerTask(action.body, { timeZone });
        case "updateTask":
          return updatePlannerTask(action.key, action.body, { timeZone });
        case "moveTask":
          return movePlannerTask(action.key, action.body, { timeZone });
        case "deleteTask":
          return deletePlannerTask(action.key, action.scope, { timeZone });
        case "selectSubject":
          return selectPlannerSubject(action.date, action.subjectId, { timeZone });
        case "removeSubject":
          return removePlannerSubject(action.date, action.subjectId, { timeZone });
        case "reorderSubjects":
          return reorderPlannerSubjects(action.date, action.body, { timeZone });
      }
    },
    onSuccess: async (_saved, _action, context) => {
      const owner = context?.userId;
      if (owner == null) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: plannerKeys.user(owner) }),
        queryClient.invalidateQueries({ queryKey: ["subjects"] }),
      ]);
      postToNative({ type: "records-changed", atMs: Date.now() });
    },
    onError: (error, _action, context) => {
      if (error instanceof ApiError && error.status === 409 && context?.userId != null) {
        void queryClient.invalidateQueries({ queryKey: plannerKeys.user(context.userId) });
      }
    },
  });
}
