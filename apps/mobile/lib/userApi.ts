import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

import type { UserRegisterResponse } from "@focusmakers/types";

import { parseErrorMessage } from "./api";
import { getOrCreateDeviceId } from "./deviceId";

const USER_ID_KEY = "focuson.userId";

function apiBaseUrl(): string {
  const url = Constants.expoConfig?.extra?.apiBaseUrl as string | undefined;
  if (!url) {
    throw new Error("app.json extra.apiBaseUrl이 설정되지 않았습니다");
  }
  return url;
}

/** 등록 API 원본 호출. 응답의 `isNew`가 필요한 소비자(온보딩 분기 등)는 이걸 쓴다. */
export async function registerUser(deviceId: string): Promise<UserRegisterResponse> {
  const res = await fetch(`${apiBaseUrl()}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId }),
  });
  if (!res.ok) {
    throw await parseErrorMessage(res, "유저 등록 실패");
  }
  return (await res.json()) as UserRegisterResponse;
}

/**
 * 익명 기기 유저 등록을 보장한다. 이미 등록돼 있으면 저장된 userId를 반환하고,
 * 아니면 기기 UUID로 등록 후 저장한다. 실패해도 throw 하지 않고 null을
 * 반환한다 — 다음 앱 실행 때 재시도 (등록 API는 멱등이라 안전, 스펙 참고).
 */
export async function ensureUserRegistered(): Promise<number | null> {
  try {
    const stored = await SecureStore.getItemAsync(USER_ID_KEY);
    if (stored) {
      return Number(stored);
    }
    const deviceId = await getOrCreateDeviceId();
    const { userId } = await registerUser(deviceId);
    await SecureStore.setItemAsync(USER_ID_KEY, String(userId));
    return userId;
  } catch (error) {
    console.warn("[user] 익명 유저 등록 실패 — 다음 실행에서 재시도", error);
    return null;
  }
}

/**
 * `ensureUserRegistered`가 이미 저장해 둔 userId를 읽기만 한다 — 새 네트워크 호출을
 * 만들지 않는다(세션 시작 경로에 API 의존을 추가하지 않는다, 설계 §1). 앱 부팅 시
 * `RootLayout`이 `ensureUserRegistered()`를 호출해 두므로, 세션 시작 시점에는 이미
 * 저장돼 있거나(정상 경로) 등록이 실패해 비어 있을 수 있다(그 경우 `null`).
 */
export async function getRegisteredUserId(): Promise<number | null> {
  const stored = await SecureStore.getItemAsync(USER_ID_KEY);
  return stored ? Number(stored) : null;
}
