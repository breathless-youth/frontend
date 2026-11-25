import type {
  HomeMissionRewardClaimResponse,
  HomeMissionResponse,
  HomeMissionStep,
} from "@focusmakers/types";

import { API_BASE_URL, apiFetch, parseApiError } from "./api";
import { isPointsEnabled } from "./pointsCapability";

const MISSION_URL = `${API_BASE_URL}/api/home/mission`;

function missionUrl(path = "") {
  return `${MISSION_URL}${path}${isPointsEnabled() ? "?includeAccessory=true" : ""}`;
}

export async function getHomeMission(signal?: AbortSignal): Promise<HomeMissionResponse> {
  const response = await apiFetch(missionUrl(), { endpoint: "homeMission", method: "GET", signal });
  if (!response.ok) throw await parseApiError(response, "home mission fetch failed");
  return (await response.json()) as HomeMissionResponse;
}

export async function completeHomeMissionStep(step: HomeMissionStep): Promise<HomeMissionResponse> {
  const response = await apiFetch(missionUrl(`/steps/${step}/complete`), {
    endpoint: "homeMission",
    method: "POST",
  });
  if (!response.ok) throw await parseApiError(response, "home mission completion failed");
  return (await response.json()) as HomeMissionResponse;
}

/** 완료한 단계 가운데 아직 안 받은 미션 포인트를 한 번에 받는다. 비회원도 받는다. */
export async function claimHomeMissionRewards(): Promise<HomeMissionRewardClaimResponse> {
  const response = await apiFetch(missionUrl("/rewards/claim"), {
    endpoint: "homeMission",
    method: "POST",
  });
  if (!response.ok) throw await parseApiError(response, "home mission reward claim failed");
  return (await response.json()) as HomeMissionRewardClaimResponse;
}
