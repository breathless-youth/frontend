import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

import type { UserRegisterResponse } from "@focuson/types";

import { clearDeviceId, getOrCreateDeviceId } from "./deviceId";

const USER_ID_KEY = "focuson.userId";

type EnsureUserRegisteredOptions = {
  /** 개발 중 매 앱 실행을 신규 익명 사용자로 시작한다. */
  resetIdentity?: boolean;
};

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
    const message = await res
      .json()
      .then((body: { message?: string }) => body.message)
      .catch(() => undefined);
    throw new Error(message ?? `유저 등록 실패 (HTTP ${res.status})`);
  }
  return (await res.json()) as UserRegisterResponse;
}

/**
 * 익명 기기 유저 등록을 보장한다. 이미 등록돼 있으면 저장된 userId를 반환하고,
 * 아니면 기기 UUID로 등록 후 저장한다. 실패해도 throw 하지 않고 null을
 * 반환한다 — 다음 앱 실행 때 재시도 (등록 API는 멱등이라 안전, 스펙 참고).
 */
export async function ensureUserRegistered({
  resetIdentity = false,
}: EnsureUserRegisteredOptions = {}): Promise<number | null> {
  try {
    if (resetIdentity) {
      await SecureStore.deleteItemAsync(USER_ID_KEY);
      await clearDeviceId();
    }

    const stored = await SecureStore.getItemAsync(USER_ID_KEY);
    if (stored) {
      console.log("[user] 저장된 userId 재사용:", stored);
      return Number(stored);
    }
    const deviceId = await getOrCreateDeviceId();
    const { userId, isNew } = await registerUser(deviceId);
    await SecureStore.setItemAsync(USER_ID_KEY, String(userId));
    console.log("[user] 익명 유저 등록 완료 — userId:", userId, "isNew:", isNew);
    return userId;
  } catch (error) {
    console.warn("[user] 익명 유저 등록 실패 — 다음 실행에서 재시도", error);
    return null;
  }
}
