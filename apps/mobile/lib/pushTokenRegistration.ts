import { Platform } from "react-native";

import type { PushTokenRegisterRequest } from "@focusmakers/types";

import { apiFetch } from "./api";
import { apiBaseUrl } from "./apiBaseUrl";
import { ensureAuth, refreshAuth, subscribeAuth } from "./auth";
import { getPushPermissionStatus, getPushToken } from "./pushMessaging";

/** 이 프로세스에서 마지막으로 등록에 성공한 사용자·토큰·권한. 같으면 다시 보내지 않는다. */
let lastRegistered: string | null = null;
let lastRegisteredUserId: number | null = null;
/**
 * 등록은 한 줄로 세운다. 첫 실행에서 권한 창이 닫히면 "권한 요청 뒤"와 "포그라운드 복귀"가 거의 동시에 부르는데, 둘 다
 * 성공 기록 전이라 같은 요청이 두 번 나간다. 진행 중 요청을 공유하지 않는 이유는 그사이 바뀐 토큰을 놓치지 않기 위해서다.
 */
let queue: Promise<void> = Promise.resolve();

/**
 * 기기 FCM 토큰을 서버에 등록한다 (`PUT /api/push-tokens`). 서버가 사용자별 알림을 보낼 때 이 토큰으로 기기를 찾는다.
 *
 * 알림 권한을 거부한 기기도 등록한다 — 서버는 권한이 꺼진 기기에도 보내므로 설정에서 다시 켜면 바로 받는다.
 * 실패해도 던지지 않는다. 기록을 남기지 않으므로 다음 시점(실행·복귀·토큰 갱신)에 다시 보낸다.
 * 토큰 값은 로그에 남기지 않는다.
 */
export function registerPushToken(): Promise<void> {
  queue = queue.then(registerOnce).catch((error: unknown) => {
    console.warn("[push] 토큰 등록 실패", error);
  });
  return queue;
}

async function registerOnce(): Promise<void> {
  const auth = await ensureAuth();
  const accessToken = auth?.accessToken ?? null;
  const token = await getPushToken();
  if (auth === null || accessToken === null || token === null) return;
  const body: PushTokenRegisterRequest = {
    token,
    platform: Platform.OS === "ios" ? "IOS" : "ANDROID",
    notificationsEnabled: (await getPushPermissionStatus()) === "granted",
  };
  const key = `${auth.userId}|${token}|${body.notificationsEnabled}`;
  if (key === lastRegistered) return;
  let res = await requestRegister(accessToken, body);
  if (res.status === 401) {
    // 웹뷰의 갱신이 이미 토큰을 바꿔 뒀으면 회전을 낭비하지 않고 그 토큰으로 다시 보낸다(`launchGoal.ts`와 같다).
    const current = (await ensureAuth())?.accessToken ?? null;
    const next = current !== accessToken ? current : ((await refreshAuth())?.accessToken ?? null);
    if (next === null || next === accessToken) return;
    res = await requestRegister(next, body);
  }
  if (!res.ok) {
    console.warn(`[push] 토큰 등록 실패 (HTTP ${res.status})`);
    return;
  }
  lastRegistered = key;
  lastRegisteredUserId = auth.userId;
}

/**
 * 사용자 ID가 바뀌면(재등록으로 다른 계정이 된 경우) 그 사용자로 토큰을 다시 등록한다. 해제 함수를 돌려준다.
 *
 * 토큰 회전마다 오는 알림이라 사용자 ID가 같으면 아무것도 하지 않는다. 첫 등록 전 알림도 넘긴다 — 첫 등록은 앱 실행 때
 * 권한 요청 뒤에 한다.
 */
export function watchAuthForPushToken(): () => void {
  return subscribeAuth((state) => {
    if (lastRegisteredUserId !== null && state.userId !== lastRegisteredUserId) {
      void registerPushToken();
    }
  });
}

function requestRegister(accessToken: string, body: PushTokenRegisterRequest): Promise<Response> {
  return apiFetch(`${apiBaseUrl()}/api/push-tokens`, {
    endpoint: "pushTokens",
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** 테스트 전용: 모듈 상태를 비운다. */
export function resetPushTokenRegistration(): void {
  lastRegistered = null;
  lastRegisteredUserId = null;
  queue = Promise.resolve();
}
