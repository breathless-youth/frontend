import type { HomeMissionResponse } from "@focusmakers/types";

import { API_BASE_URL, apiFetch, parseApiError } from "./api";

const MISSION_URL = `${API_BASE_URL}/api/home/mission`;

export async function getHomeMission(signal?: AbortSignal): Promise<HomeMissionResponse> {
  const response = await apiFetch(MISSION_URL, { endpoint: "homeMission", method: "GET", signal });
  if (!response.ok) throw await parseApiError(response, "home mission fetch failed");
  return (await response.json()) as HomeMissionResponse;
}

export async function completeHomeMissionStep(step: 1 | 2): Promise<HomeMissionResponse> {
  const response = await apiFetch(`${MISSION_URL}/steps/${step}/complete`, {
    endpoint: "homeMission",
    method: "POST",
  });
  if (!response.ok) throw await parseApiError(response, "home mission completion failed");
  return (await response.json()) as HomeMissionResponse;
}
