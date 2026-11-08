import type {
  PersonalRecordListResponse,
  StudyPeriodStatsResponse,
  StudyRhythmResponse,
} from "@focusmakers/types";

import { API_BASE_URL, apiFetch, parseApiError } from "./api";
import type { PlannerRequestOptions } from "./plannerApi";
import type { DateRange } from "./statsApi";

async function read<T>(
  suffix: string,
  params: Record<string, string>,
  { timeZone, signal }: PlannerRequestOptions,
): Promise<T> {
  const query = new URLSearchParams({ ...params, timeZone });
  const response = await apiFetch(`${API_BASE_URL}/api/planner/records/stats${suffix}?${query}`, {
    endpoint: "planner",
    method: "GET",
    signal,
  });
  if (!response.ok) throw await parseApiError(response, "personal records fetch failed");
  return (await response.json()) as T;
}

export function getPersonalRecordStats(date: string, options: PlannerRequestOptions) {
  return read<PersonalRecordListResponse>("", { date }, options);
}

export function getPersonalRecordPeriod(
  range: DateRange,
  compareRange: DateRange | undefined,
  options: PlannerRequestOptions,
) {
  return read<StudyPeriodStatsResponse>(
    "/period",
    {
      ...range,
      ...(compareRange ? { compareFrom: compareRange.from, compareTo: compareRange.to } : {}),
    },
    options,
  );
}

export function getPersonalRecordRhythm(options: PlannerRequestOptions) {
  return read<StudyRhythmResponse>("/rhythm", {}, options);
}
