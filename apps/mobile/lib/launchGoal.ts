import * as SecureStore from "expo-secure-store";

import type { ProfileResponse } from "@focusmakers/types";

import { apiFetch } from "./api";
import { apiBaseUrl } from "./apiBaseUrl";
import { ensureAuth, refreshAuth } from "./auth";
import { withTimeout } from "./withTimeout";

/**
 * 실행 직후 오버레이에 보여 줄 목표 문구
 *
 * 스플래시가 걷히는 순간 서버 응답을 기다릴 수 없어서 지난번에 받은 값을 기기에 두고 쓴다.
 * 비밀은 아니지만 앱에 이미 있는 저장소가 SecureStore뿐이라 여기에 둔다.
 */
export type LaunchGoal = { goal: string; nickname: string | null };

const LAUNCH_GOAL_KEY = "focuson.launchGoal";
// 스플래시가 이 읽기를 기다리므로 키체인이 답하지 않아도 앱이 스플래시에 멈추지 않게 상한을 둔다.
const READ_TIMEOUT_MS = 1_000;

/**
 * 저장된 목표 문구 읽기
 *
 * 없거나 깨졌거나 읽기가 실패하거나 상한 안에 끝나지 않으면 오버레이를 건너뛰도록 null을 돌려준다.
 */
export async function readLaunchGoal(): Promise<LaunchGoal | null> {
  try {
    const raw = await withTimeout(SecureStore.getItemAsync(LAUNCH_GOAL_KEY), READ_TIMEOUT_MS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LaunchGoal> | null;
    if (typeof parsed?.goal !== "string" || parsed.goal === "") return null;
    return {
      goal: parsed.goal,
      nickname: typeof parsed.nickname === "string" ? parsed.nickname : null,
    };
  } catch {
    return null;
  }
}

type LaunchGoalProfile = { goal: string | null; nickname: string | null };

// 웹의 저장 알림이 올 때마다 올린다.
// 진행 중인 조회는 시작 때 값과 다르면 자기 응답이 더 옛 값이라 보고 저장하지 않는다.
let savedFromWebGeneration = 0;

/**
 * 웹의 프로필 저장 알림으로 받은 목표 문구 저장
 *
 * 이 값이 가장 새 값이라 진행 중인 조회의 응답이 덮지 않도록 세대를 올린다.
 * 실패해도 throw 하지 않고 지난 값을 둔다.
 */
export function saveLaunchGoal(profile: LaunchGoalProfile): Promise<void> {
  savedFromWebGeneration += 1;
  return writeLaunchGoal(profile);
}

/** 목표 문구가 비었으면 오버레이를 띄우지 않도록 저장값을 지운다. */
async function writeLaunchGoal(profile: LaunchGoalProfile): Promise<void> {
  try {
    if (!profile.goal) {
      await SecureStore.deleteItemAsync(LAUNCH_GOAL_KEY);
      return;
    }
    const value: LaunchGoal = { goal: profile.goal, nickname: profile.nickname };
    await SecureStore.setItemAsync(LAUNCH_GOAL_KEY, JSON.stringify(value));
  } catch (error) {
    // 목표와 닉네임은 사용자가 쓴 글이라 값은 남기지 않고 오류만 남긴다.
    console.warn("[launchGoal] 저장 실패, 지난 값 유지", error);
  }
}

function requestProfile(accessToken: string): Promise<Response> {
  return apiFetch(`${apiBaseUrl()}/api/users/me/profile`, {
    endpoint: "profile",
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

let ongoing: Promise<void> | null = null;

/**
 * 프로필을 받아 다음 실행에 쓸 목표 문구를 저장한다
 *
 * 콜드 스타트와 백그라운드 전환이 겹칠 수 있어 진행 중인 요청을 함께 쓴다.
 * 실패해도 throw 하지 않는다.
 */
export function refreshLaunchGoal(): Promise<void> {
  ongoing ??= refreshOnce().finally(() => {
    ongoing = null;
  });
  return ongoing;
}

async function refreshOnce(): Promise<void> {
  try {
    const generation = savedFromWebGeneration;
    const sent = (await ensureAuth())?.accessToken ?? null;
    if (sent === null) return;
    let res = await requestProfile(sent);
    if (res.status === 401) {
      // 웹뷰의 갱신이 이미 토큰을 바꿔 뒀으면 회전을 낭비하지 않고 그 토큰으로 다시 보낸다.
      // 같은 토큰을 다시 보내도 같은 401이라 재시도는 새 토큰이 있을 때 한 번만 한다.
      const current = (await ensureAuth())?.accessToken ?? null;
      const next = current !== sent ? current : ((await refreshAuth())?.accessToken ?? null);
      if (next === null || next === sent) return;
      res = await requestProfile(next);
    }
    if (!res.ok) return;
    const profile = (await res.json()) as ProfileResponse;
    if (generation !== savedFromWebGeneration) return;
    await writeLaunchGoal(profile);
  } catch (error) {
    // 지난 값을 그대로 두고 다음 실행이나 백그라운드 전환에서 다시 받는다.
    console.warn("[launchGoal] 프로필 조회 실패, 저장값 유지", error);
  }
}
