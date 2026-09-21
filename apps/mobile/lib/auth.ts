import * as SecureStore from "expo-secure-store";

import type { AuthRefreshResponse, ToWebMessage, UserRegisterResponse } from "@focusmakers/types";

import { apiFetch, parseErrorMessage } from "./api";
import { apiBaseUrl } from "./apiBaseUrl";
import { getOrCreateDeviceId } from "./deviceId";

/**
 * 토큰의 유일한 소유자. SecureStore 키 하나에 JSON으로 묶어 저장한다 — 회전 도중 앱이 죽어도
 * access·refresh 쌍이 어긋나지 않는다. refresh 토큰은 이 모듈 밖으로 나가되 웹뷰에는 절대
 * 전달하지 않는다(`authTokenMessage`가 거른다).
 */
export type AuthState = {
  userId: number;
  /** 서버가 아직 토큰을 주지 않으면(BY-526 전) null. 웹은 null이면 헤더 없이 보낸다. */
  accessToken: string | null;
  refreshToken: string | null;
};

const AUTH_KEY = "focuson.auth";
/** 토큰 도입 전 설치가 남긴 키. 첫 실행에 값을 새 키로 옮기고 지운다(지연 이관). */
const LEGACY_USER_ID_KEY = "focuson.userId";
/**
 * `THIS_DEVICE_ONLY`가 없으면 iCloud 키체인 동기화로 1회용 refresh가 다른 기기에 복사되고, 두 기기가
 * 같은 토큰을 써 서버가 탈취로 보고 전량 폐기한다. 읽기·삭제에도 같은 옵션을 넘겨 iOS 키체인 조회
 * 조건을 맞춘다. Android에서는 무시된다.
 */
const STORE_OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

type AuthListener = (state: AuthState) => void;
const listeners = new Set<AuthListener>();

/**
 * 토큰이 바뀔 때(발급·갱신·재등록·이관) 알린다. 마운트된 모든 `RemoteWebViewHost`가 구독해 자기
 * 문서에 `auth-token`을 주입한다 — `sessionClosed`와 같은 전원 전파다(분석 이벤트의 단일 sink와 반대).
 */
export function subscribeAuth(listener: AuthListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 웹에 보낼 `auth-token`. refresh 토큰은 싣지 않는다. `null`이면 둘 다 null로 보내 웹이 헤더 없이 보내게 한다. */
export function authTokenMessage(state: AuthState | null): ToWebMessage {
  return {
    type: "auth-token",
    userId: state?.userId ?? null,
    accessToken: state?.accessToken ?? null,
    atMs: Date.now(),
  };
}

/**
 * 키체인이 잠겨 있는 등 읽기 실패는 "없음"으로 본다 — 재등록(멱등)이 같은 userId로 복구한다.
 * 옛 키 조회도 같은 규칙을 따라야 한다: 여기서 던지면 등록까지 못 가고 부팅이 토큰 없이 지나간다.
 */
async function readItem(key: string, options?: typeof STORE_OPTIONS): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key, options);
  } catch (error) {
    console.warn("[auth] 저장 읽기 실패, 없는 것으로 본다", error);
    return null;
  }
}

async function readAuth(): Promise<AuthState | null> {
  const raw = await readItem(AUTH_KEY, STORE_OPTIONS);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AuthState> | null;
    if (typeof parsed?.userId !== "number") {
      return null;
    }
    return {
      userId: parsed.userId,
      accessToken: typeof parsed.accessToken === "string" ? parsed.accessToken : null,
      refreshToken: typeof parsed.refreshToken === "string" ? parsed.refreshToken : null,
    };
  } catch {
    return null;
  }
}

async function writeAuth(state: AuthState): Promise<AuthState> {
  await SecureStore.setItemAsync(AUTH_KEY, JSON.stringify(state), STORE_OPTIONS);
  // 순회 중 구독 해제가 일어나도 안전하게 복사본을 돈다.
  for (const listener of [...listeners]) {
    listener(state);
  }
  return state;
}

/**
 * 등록 API 원본 호출. `Authorization`을 붙이지 않는다.
 *
 * 응답의 `isNew`는 서버 계약이라 타입에 있을 뿐, 분기에 쓰는 소비자가 없다(2026-07-31 검토).
 * 온보딩 가이드 노출 판단은 완료 플래그(`onboardingGuideStore`)가 소유한다.
 */
export async function registerUser(deviceId: string): Promise<UserRegisterResponse> {
  const res = await apiFetch(`${apiBaseUrl()}/api/users`, {
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
 * access 토큰(JWT)의 `sub` 클레임이 userId다. 토큰 계약(API-Version 2)의 등록 응답은 userId를 싣지
 * 않는다(ADR-0020 표 0행) — 구 계약(1) 응답만 `userId`를 준다. 서명은 검증하지 않는다: 이 값은
 * 서버가 준 토큰을 그대로 되돌려 보내는 용도라 위조해도 얻는 것이 없다.
 */
function userIdFromToken(token: string | undefined): number | null {
  const payload = token?.split(".")[1];
  if (payload === undefined) {
    return null;
  }
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(
      atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")),
    ) as {
      sub?: unknown;
    };
    const userId = Number(claims.sub);
    return typeof claims.sub === "string" && Number.isSafeInteger(userId) && userId > 0
      ? userId
      : null;
  } catch {
    return null;
  }
}

let ongoingAuth: Promise<AuthState | null> | null = null;

/**
 * 저장된 상태가 있으면 반환, 없으면 옛 키를 옮기거나 기기 UUID로 등록해 저장 후 반환. 실패해도
 * throw 하지 않고 null — 다음 실행에서 재시도한다(등록 API는 멱등). 진행 중인 프라미스를 공유한다:
 * `RootLayout`과 `useRemoteQueryParams`가 겹치는 첫 실행에서 UUID 두 개가 각각 등록되던 레이스가
 * 있었다(옛 `ensureUserRegistered` 주석).
 */
export function ensureAuth(): Promise<AuthState | null> {
  ongoingAuth ??= loadOrRegister().finally(() => {
    ongoingAuth = null;
  });
  return ongoingAuth;
}

async function loadOrRegister(): Promise<AuthState | null> {
  try {
    const stored = await readAuth();
    if (stored !== null) {
      return stored;
    }
    // 지연 이관: 옛 설치는 userId만 옮기고 네트워크를 타지 않는다. 토큰은 첫 401의 갱신 경로에서
    // 재등록으로 받는다 — 지금 서버는 어차피 토큰을 주지 않고, 부팅 시 왕복 하나가 준다.
    const legacy = await readItem(LEGACY_USER_ID_KEY);
    if (legacy) {
      const state = await writeAuth({
        userId: Number(legacy),
        accessToken: null,
        refreshToken: null,
      });
      await SecureStore.deleteItemAsync(LEGACY_USER_ID_KEY);
      return state;
    }
    const deviceId = await getOrCreateDeviceId();
    const { userId: bodyUserId, accessToken, refreshToken } = await registerUser(deviceId);
    const userId = bodyUserId ?? userIdFromToken(accessToken);
    if (userId === null) {
      // 저장하면 userId 없는 상태가 굳어 웹에 `auth-token null`만 반복해 내려간다.
      throw new Error("등록 응답에 userId도 access 토큰 sub도 없다");
    }
    return await writeAuth({
      userId,
      accessToken: accessToken ?? null,
      refreshToken: refreshToken ?? null,
    });
  } catch (error) {
    console.warn("[auth] 토큰 발급 실패 — 다음 실행에서 재시도", error);
    return null;
  }
}

let ongoingRefresh: Promise<AuthState | null> | null = null;

/**
 * `POST /api/auth/refresh`. 앱 전체에서 진행 중인 갱신은 하나뿐이다 — refresh는 1회용 회전이라 둘이
 * 나가면 서버가 재사용으로 보고 전량 폐기한다. 200이면 두 토큰을 교체 저장, 401과 400이면 저장을
 * 지우고 재등록, 네트워크 오류·5xx면 저장을 유지하고 null. 400은 저장된 값이 서버 검증을 통과하지
 * 못한다는 뜻이라 같은 값으로 다시 보내도 결과가 같다. refresh 토큰이 없으면 갱신할 것이 없으므로
 * 저장을 지우고 재등록한다 — 지연 이관된 설치가 토큰을 얻는 유일한 경로다.
 */
export function refreshAuth(): Promise<AuthState | null> {
  if (ongoingAuth !== null) {
    // 등록이 곧 새 쌍이다 — 갱신을 겹쳐 회전을 낭비하지 않는다.
    return ongoingAuth;
  }
  ongoingRefresh ??= refreshOnce().finally(() => {
    ongoingRefresh = null;
  });
  return ongoingRefresh;
}

async function refreshOnce(): Promise<AuthState | null> {
  try {
    const current = await readAuth();
    if (current === null || current.refreshToken === null) {
      await SecureStore.deleteItemAsync(AUTH_KEY, STORE_OPTIONS);
      return await ensureAuth();
    }
    const res = await apiFetch(`${apiBaseUrl()}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });
    if (res.status === 401 || res.status === 400) {
      await SecureStore.deleteItemAsync(AUTH_KEY, STORE_OPTIONS);
      return await ensureAuth();
    }
    if (!res.ok) {
      throw await parseErrorMessage(res, "토큰 갱신 실패");
    }
    const { accessToken, refreshToken } = (await res.json()) as AuthRefreshResponse;
    return await writeAuth({ userId: current.userId, accessToken, refreshToken });
  } catch (error) {
    console.warn("[auth] 토큰 갱신 실패 — 저장된 토큰을 유지한다", error);
    return null;
  }
}

/** `auth-ready` 응답용: 갱신이 진행 중이면 그 결과를, 아니면 저장 상태를 돌려준다. */
export function awaitAuth(): Promise<AuthState | null> {
  return ongoingRefresh ?? ensureAuth();
}
