import type { PlannerTask, PlannerCarryRequest } from "@focusmakers/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { postToNative } from "@/lib/bridge";
import { ApiError } from "@/lib/api";
import { useScreenVisible } from "@/lib/nativeTabFocus";
import { carryPlannerTasks, getPlannerCarryover } from "@/lib/plannerApi";
import { plannerKeys } from "@/lib/plannerQueries";
import { listSubjects } from "@/lib/subjectApi";
import { hasTokenSource } from "@/lib/userId";

import { carryoverCandidates, carryoverRequest } from "./plannerCarryover";
import { usePlannerClock } from "./usePlannerClock";

interface Arrival {
  id: number;
  scope: string;
  visible: boolean;
  deferred: boolean;
  decided: boolean;
  tasks: PlannerTask[] | null;
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
const documentVisible = () => document.visibilityState === "visible";

/** 다른 안내는 잠시 기다린다. 이번 접속 보류는 defer, 영구 무시는 명시적인 POST만 담당한다. */
export function usePlannerCarryover(
  userId: number | null,
  { ready, blocked }: { ready: boolean; blocked: boolean },
) {
  const queryClient = useQueryClient();
  const { todayKey, timeZone } = usePlannerClock();
  const screenVisible = useScreenVisible();
  const pageVisible = useSyncExternalStore(subscribeVisibility, documentVisible);
  const visible = screenVisible && pageVisible;
  const scope = `${userId}:${todayKey}:${timeZone}`;
  const [arrival, setArrival] = useState<Arrival>(() => ({
    id: 0,
    scope,
    visible,
    deferred: false,
    decided: false,
    tasks: null,
  }));
  // 홈 WebView는 탭 이동 뒤에도 살아 있다. 다시 보이는 순간만 새 접속으로 센다.
  if (arrival.visible !== visible) {
    setArrival(
      visible
        ? { id: arrival.id + 1, scope, visible, deferred: false, decided: false, tasks: null }
        : { ...arrival, visible, tasks: null },
    );
  }
  // 첫 토큰의 도착은 홈 진입의 일부다. 확정 뒤 사용자·날짜·시간대 변경은 다음 접속까지 기다린다.
  else if (arrival.scope.startsWith("null:") && userId !== null) {
    setArrival({
      id: arrival.id + 1,
      scope,
      visible,
      deferred: false,
      decided: false,
      tasks: null,
    });
  }
  const current =
    arrival.scope === scope && arrival.visible && visible && hasTokenSource() && userId !== null;
  const offered = current && !arrival.deferred && arrival.tasks !== null;
  const subjectQuery = useQuery({
    queryKey: ["subjects", userId],
    queryFn: listSubjects,
    enabled: offered,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const available = offered && !subjectQuery.isPending;
  const open = available && !blocked;
  const activeRef = useRef({ scope, arrivalId: arrival.id, current, blocked });
  useEffect(() => {
    activeRef.current = { scope, arrivalId: arrival.id, current, blocked };
  });
  const defer = useCallback(() => {
    setArrival((previous) => ({ ...previous, deferred: true, tasks: null }));
  }, []);
  const pendingRequests = useRef(new Map<string, Promise<void>>());
  const uncertainRequests = useRef(
    new Map<string, { arrivalId: number; body: PlannerCarryRequest }>(),
  );
  const [pendingVersion, setPendingVersion] = useState(0);
  const [uncertainScope, setUncertainScope] = useState<string | null>(null);

  useEffect(() => {
    if (blocked) {
      return;
    }
    if (
      !current ||
      !ready ||
      arrival.deferred ||
      arrival.decided ||
      userId === null ||
      pendingRequests.current.has(scope)
    )
      return;
    let cancelled = false;
    const id = arrival.id;
    const queryKey = [...plannerKeys.user(userId), "carryover", todayKey, timeZone] as const;
    void queryClient
      .fetchQuery({
        queryKey,
        queryFn: async ({ signal }) =>
          carryoverCandidates(await getPlannerCarryover({ timeZone, signal }), todayKey),
        staleTime: 0,
        retry: false,
      })
      .then(
        (tasks) => {
          if (cancelled) return;
          setArrival((previous) =>
            previous.id !== id || previous.scope !== scope || previous.deferred
              ? previous
              : { ...previous, decided: true, tasks: tasks.length ? tasks : null },
          );
        },
        () => {
          if (!cancelled)
            setArrival((previous) =>
              previous.id !== id ? previous : { ...previous, decided: true },
            );
        },
      );
    return () => {
      cancelled = true;
      void queryClient.cancelQueries({ queryKey, exact: true });
    };
  }, [
    queryClient,
    userId,
    todayKey,
    timeZone,
    scope,
    current,
    ready,
    blocked,
    arrival.id,
    arrival.deferred,
    arrival.decided,
    pendingVersion,
  ]);

  // state 갱신 전에 들어오는 연속 탭도 같은 POST를 공유한다.
  const submit = (selected: string[]): Promise<void> => {
    const pending = pendingRequests.current.get(scope);
    if (pending) return pending;
    const active = activeRef.current;
    if (
      !open ||
      !arrival.tasks ||
      userId === null ||
      !active.current ||
      active.blocked ||
      active.scope !== scope
    ) {
      return Promise.reject(new Error("planner carryover arrival changed"));
    }
    const owner = userId;
    const id = arrival.id;
    const previous = uncertainRequests.current.get(scope);
    const body =
      previous?.arrivalId === id ? previous.body : carryoverRequest(arrival.tasks, selected);
    const promise = carryPlannerTasks(body, { timeZone })
      .then(async (saved) => {
        carryoverCandidates(saved, todayKey);
        setArrival((previous) =>
          previous.id !== id || previous.scope !== scope
            ? previous
            : { ...previous, tasks: null, decided: true },
        );
        await queryClient.invalidateQueries({ queryKey: plannerKeys.user(owner) });
        postToNative({ type: "records-changed", atMs: Date.now() });
        uncertainRequests.current.delete(scope);
        setUncertainScope((previousScope) =>
          previousScope === `${scope}:${id}` ? null : previousScope,
        );
      })
      .catch((error: unknown) => {
        // 후보가 바뀌었으면 같은 본문으로는 다시 성공하지 않으므로 후보를 새로 받는다.
        if (
          error instanceof ApiError &&
          (error.code === "PLANNER_CARRYOVER_CHANGED" || error.status === 404)
        ) {
          setArrival((previous) =>
            previous.id !== id || previous.scope !== scope
              ? previous
              : { ...previous, decided: false },
          );
          void queryClient.invalidateQueries({ queryKey: plannerKeys.user(owner) });
          // 결과를 모르던 이전 본문은 사라진 후보를 담고 있어 다시 보내지 않는다.
          uncertainRequests.current.delete(scope);
          setUncertainScope((previousScope) =>
            previousScope === `${scope}:${id}` ? null : previousScope,
          );
        }
        if (!(error instanceof ApiError && error.status >= 400 && error.status < 500)) {
          uncertainRequests.current.set(scope, { arrivalId: id, body });
          setUncertainScope(`${scope}:${id}`);
        }
        throw error;
      })
      .finally(() => {
        pendingRequests.current.delete(scope);
        setPendingVersion((previous) => previous + 1);
      });
    pendingRequests.current.set(scope, promise);
    return promise;
  };
  return {
    tasks: available ? arrival.tasks : null,
    subjects: current ? (subjectQuery.data ?? []) : [],
    open,
    defer,
    submit,
    uncertain: open && uncertainScope === `${scope}:${arrival.id}`,
  };
}
