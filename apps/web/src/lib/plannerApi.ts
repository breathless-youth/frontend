import type {
  PlannerDayResponse,
  PlannerDaySummary,
  PlannerSubjectOrderRequest,
  PlannerTask,
  PlannerTaskCreateRequest,
  PlannerTaskMoveRequest,
  PlannerTaskScope,
  PlannerTaskUpdateRequest,
  PlannerRepeatRequest,
  PlannerTaskRepeatResponse,
  PlannerGoalRequest,
  PlannerGoalResponse,
  PlannerDefaultGoalResponse,
  PlannerCarryRequest,
  PlannerRecordBatchRequest,
  PlannerRecordBatchResponse,
} from "@focusmakers/types";

import { API_BASE_URL, apiFetch, parseApiError } from "./api";
import type { DateRange } from "./statsApi";

export interface PlannerRequestOptions {
  timeZone: string;
  signal?: AbortSignal;
}

async function send<T>(
  path: string,
  options: PlannerRequestOptions,
  init: RequestInit = {},
  params: Record<string, string> = {},
  includeTimeZone = true,
): Promise<T> {
  const query = new URLSearchParams({
    ...params,
    ...(includeTimeZone ? { timeZone: options.timeZone } : {}),
  });
  const suffix = query.size ? `?${query}` : "";
  const response = await apiFetch(`${API_BASE_URL}/api/planner${path}${suffix}`, {
    method: "GET",
    ...init,
    endpoint: "planner",
    signal: options.signal,
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
  });
  if (!response.ok) throw await parseApiError(response, "planner request failed");
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export function getPlannerDay(
  date: string,
  options: PlannerRequestOptions,
): Promise<PlannerDayResponse> {
  return send(`/days/${date}`, options);
}

export function listPlannerDays(
  range: DateRange,
  options: PlannerRequestOptions,
): Promise<PlannerDayResponse[]> {
  return send("", options, {}, { from: range.from, to: range.to });
}

export function getPlannerSummary(
  range: DateRange,
  options: PlannerRequestOptions,
): Promise<PlannerDaySummary[]> {
  return send("/summary", options, {}, { from: range.from, to: range.to });
}

export function createPlannerTask(
  body: PlannerTaskCreateRequest,
  options: PlannerRequestOptions,
): Promise<PlannerTask> {
  return send("/tasks", options, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function selectPlannerSubject(
  date: string,
  subjectId: number,
  options: PlannerRequestOptions,
): Promise<void> {
  return send(`/days/${date}/subjects/${subjectId}`, options, { method: "PUT" });
}

export function removePlannerSubject(
  date: string,
  subjectId: number,
  options: PlannerRequestOptions,
): Promise<void> {
  return send(`/days/${date}/subjects/${subjectId}`, options, { method: "DELETE" });
}

export function reorderPlannerSubjects(
  date: string,
  body: PlannerSubjectOrderRequest,
  options: PlannerRequestOptions,
): Promise<void> {
  return send(`/days/${date}/subjects/order`, options, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function updatePlannerTask(
  key: string,
  body: PlannerTaskUpdateRequest,
  options: PlannerRequestOptions,
): Promise<PlannerTask> {
  return send(`/tasks/${encodeURIComponent(key)}`, options, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function movePlannerTask(
  key: string,
  body: PlannerTaskMoveRequest,
  options: PlannerRequestOptions,
): Promise<PlannerTask> {
  return send(`/tasks/${encodeURIComponent(key)}/date`, options, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deletePlannerTask(
  key: string,
  scope: PlannerTaskScope,
  options: PlannerRequestOptions,
): Promise<void> {
  return send(`/tasks/${encodeURIComponent(key)}`, options, { method: "DELETE" }, { scope });
}

export function getPlannerTaskRepeat(
  key: string,
  options: PlannerRequestOptions,
): Promise<PlannerTaskRepeatResponse> {
  return send(`/tasks/${encodeURIComponent(key)}/repeat`, options);
}

export function setPlannerTaskRepeat(
  key: string,
  body: PlannerRepeatRequest,
  options: PlannerRequestOptions,
): Promise<PlannerTask> {
  return send(`/tasks/${encodeURIComponent(key)}/repeat`, options, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function setPlannerGoal(
  date: string,
  body: PlannerGoalRequest,
  options: PlannerRequestOptions,
): Promise<PlannerGoalResponse> {
  return send(`/goals/${date}`, options, { method: "PUT", body: JSON.stringify(body) });
}
export function setPlannerDefaultGoal(
  body: PlannerGoalRequest,
  options: PlannerRequestOptions,
): Promise<PlannerDefaultGoalResponse> {
  return send("/goals/default", options, { method: "PUT", body: JSON.stringify(body) });
}
export function getPlannerCarryover(options: PlannerRequestOptions): Promise<PlannerTask[]> {
  return send("/carryover", options);
}
export function carryPlannerTasks(
  body: PlannerCarryRequest,
  options: PlannerRequestOptions,
): Promise<PlannerTask[]> {
  return send("/carryover", options, { method: "POST", body: JSON.stringify(body) });
}
export function materializePlannerTask(
  key: string,
  options: PlannerRequestOptions,
): Promise<PlannerTask> {
  return send(
    `/tasks/${encodeURIComponent(key)}/materialize`,
    options,
    { method: "POST" },
    {},
    false,
  );
}
export function batchPlannerRecords(
  body: PlannerRecordBatchRequest,
  options: PlannerRequestOptions,
): Promise<PlannerRecordBatchResponse> {
  return send("/records/batch", options, { method: "POST", body: JSON.stringify(body) }, {}, false);
}
