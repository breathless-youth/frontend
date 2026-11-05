import { getLocales } from "expo-localization";
import * as SecureStore from "expo-secure-store";

import type {
  AuthRefreshResponse,
  SocialLoginFailureCode,
  SocialLoginProvider,
  ToWebMessage,
  UserRegisterRequest,
  UserRegisterResponse,
} from "@focusmakers/types";
import { readUserIdFromAccessToken } from "./jwt";

import { apiFetch, parseErrorMessage } from "./api";
import { apiBaseUrl } from "./apiBaseUrl";
import { getOrCreateDeviceId } from "./deviceId";
import { logMetaRegistration } from "./metaAds";

/**
 * 토큰의 유일한 소유자
 *
 * SecureStore 키 하나에 JSON으로 묶어 저장한다
 * — 로테이션 도중 앱이 죽어도 access·refresh 쌍이 어긋나지 않는다.
 * - refresh 토큰은 이 모듈 밖으로 나가되 웹뷰에는 절대 전달하지 않는다(`authTokenMessage`가 거른다).
 */
export type AuthState = {
  userId: number;
  /** 등록·갱신 응답의 access 토큰. 지연 이관된 설치는 첫 갱신 전까지 null이고, 웹은 null이면 헤더 없이 보낸다. */
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
 * 가입 요청 본문
 *
 * 서버가 기본 닉네임 목록을 고르려면 앱 화면 언어가 아니라 휴대폰 언어 태그 원문이 필요하다.
 * 앱 화면 언어는 간체·홍콩을 구분하지 못하지만 닉네임 목록은 따로 있기 때문이다.
 * 언어를 읽지 못하면 필드를 빼서 서버가 기본 목록을 쓰게 한다.
 */
function registerRequest(deviceId: string): UserRegisterRequest {
  const language = getLocales()[0]?.languageTag;
  return language ? { deviceId, language } : { deviceId };
}

/**
 * 등록 API 원본 호출. `Authorization`을 붙이지 않는다.
 *
 * 응답의 `isNew`는 Meta 가입 완료 이벤트(`logMetaRegistration`)만 소비한다 — 광고로 설치한 사용자가 실제
 * 신규인지 세는 용도다.
 */
export async function registerUser(deviceId: string): Promise<UserRegisterResponse> {
  const res = await apiFetch(`${apiBaseUrl()}/api/users`, {
    endpoint: "register",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(registerRequest(deviceId)),
  });
  if (!res.ok) {
    throw await parseErrorMessage(res, "유저 등록 실패");
  }
  return (await res.json()) as UserRegisterResponse;
}

let ongoingAuth: Promise<AuthState | null> | null = null;

let newUserThisLaunch = false;

/**
 * 이번 실행에서 서버에 계정이 새로 생겼는지
 *
 * 웹이 온보딩을 보여 줄 계정을 서버 조회 없이 알도록 웹뷰 주소의 `newUser=1`로 넘긴다(`remoteQueryParams.ts`).
 * iOS는 앱을 지워도 키체인 토큰이 남아 다시 설치해도 같은 계정이고, Android 재설치는 새 계정이다.
 */
export function isNewUserThisLaunch(): boolean {
  return newUserThisLaunch;
}

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
    // 재등록으로 받는다. 부팅 때 왕복 하나를 아끼기 위해서다.
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
    const { isNew, accessToken, refreshToken } = await registerUser(deviceId);
    if (isNew) {
      newUserThisLaunch = true;
      // 등록 응답 직후에 찍는다 — 광고 전환이 재는 것은 서버에 유저가 생겼는가이지 이 기기의 저장
      // 성공이 아니다. 아래 신원 파싱이나 저장이 실패해도 서버 유저는 남아, 다음 실행의 재등록은
      // isNew=false다 — 여기서 놓치면 이 사용자의 가입 완료는 두 번 다시 찍을 기회가 없다.
      logMetaRegistration();
    }
    // 등록 응답에 userId가 없다 — 신원은 access 토큰의 `sub`뿐이다(BY-723).
    // 못 읽으면 저장을 만들지 않는다. 신원 없는 저장은 웹을 조용히 브라우저 단독 모드로 떨어뜨린다.
    const userId = readUserIdFromAccessToken(accessToken);
    if (userId === null) {
      throw new Error("등록 응답의 access 토큰에서 신원(sub)을 읽지 못했다");
    }
    return await writeAuth({ userId, accessToken, refreshToken });
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
  if (ongoingLink !== null) {
    // link가 성공하면 지금 저장된 refresh는 서버에서 무효가 된다.
    // 그 refresh로 갱신하면 401을 받아 저장을 비우고 새 비회원으로 가입하므로 link가 끝난 뒤의 저장으로 갱신한다.
    // link가 가입을 기다리는 중에도 가입 결과는 link 전 토큰이라 가입 검사보다 먼저 본다.
    return ongoingLink.then(() => refreshAuth());
  }
  if (ongoingAuth !== null) {
    // 등록이 곧 새 쌍이다 — 갱신을 겹쳐 회전을 낭비하지 않는다.
    return ongoingAuth;
  }
  return startRefresh();
}

function startRefresh(): Promise<AuthState | null> {
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
      endpoint: "refresh",
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

export type LinkSocialResult =
  { status: "success"; isNewUser: boolean } | { status: "failed"; code: SocialLoginFailureCode };

/** `POST /api/auth/link` 응답. 백엔드 Swagger가 dev에 들어오면 `packages/types`로 올린다. */
type AuthLinkResponse = { accessToken: string; refreshToken: string; isNewUser: boolean };

// `API_ENDPOINTS`에 link가 없어 `apiFetch` 대신 버전 헤더를 직접 붙인다.
// 백엔드 Swagger가 dev에 들어와 `packages/types`에 link를 넣으면 `apiFetch`로 바꾼다.
async function postLink(state: AuthState, body: string): Promise<Response> {
  return fetch(`${apiBaseUrl()}/api/auth/link`, {
    method: "POST",
    headers: {
      "API-Version": "1",
      Authorization: `Bearer ${state.accessToken}`,
      "Content-Type": "application/json",
    },
    body,
  });
}

/**
 * 실패 응답의 코드
 *
 * 404·409·503은 게이트웨이가 본문 없이 줄 수도 있어 상태 코드로 가른다.
 * 400은 ID 토큰 거부만 웹에 알리고 나머지는 앱 버그라 UNKNOWN이다.
 */
async function linkFailureCode(res: Response): Promise<SocialLoginFailureCode> {
  switch (res.status) {
    case 404:
      return "USER_NOT_FOUND";
    case 409:
      return "ALREADY_LINKED";
    case 503:
      return "SOCIAL_PROVIDER_UNAVAILABLE";
    case 400: {
      const body = (await res.json().catch(() => null)) as { code?: unknown } | null;
      return body?.code === "INVALID_SOCIAL_TOKEN" ? "INVALID_SOCIAL_TOKEN" : "UNKNOWN";
    }
    default:
      return "UNKNOWN";
  }
}

let ongoingLink: Promise<LinkSocialResult> | null = null;

/**
 * `POST /api/auth/link`
 * 소셜 ID 토큰으로 지금 비회원 계정을 연결
 *
 * 성공하면 응답 토큰으로 저장을 바꾸고 구독자(웹뷰·애널리틱스·푸시 등록)에 알린다.
 * 기존 계정에 합쳐지면 userId가 바뀌므로 저장된 userId를 쓰지 않고 새 access 토큰의 `sub`를 다시 읽는다.
 * 401: 갱신
 * 404: 저장을 비우고 다시 가입한 뒤 같은 ID 토큰으로 한 번만 다시 보낸다.
 * 400·409·503: 서버가 토큰을 소비하지 않아 저장을 그대로 두고 코드만 돌려준다.
 * 진행 중인 link는 `refreshAuth`가 기다리고, link는 시작할 때 진행 중인 갱신을 기다린다.
 * 실패해도 throw하지 않는다.
 */
export function linkSocial(
  provider: SocialLoginProvider,
  idToken: string,
  nonce: string,
): Promise<LinkSocialResult> {
  ongoingLink = linkOnce(provider, idToken, nonce).finally(() => {
    ongoingLink = null;
  });
  return ongoingLink;
}

async function linkOnce(
  provider: SocialLoginProvider,
  idToken: string,
  nonce: string,
): Promise<LinkSocialResult> {
  const body = JSON.stringify({ provider, idToken, nonce });
  try {
    let state = await awaitAuth();
    if (state === null) {
      return { status: "failed", code: "UNKNOWN" };
    }
    let res = await postLink(state, body);
    if (res.status === 401 || res.status === 404) {
      if (res.status === 404) {
        await SecureStore.deleteItemAsync(AUTH_KEY, STORE_OPTIONS);
      }
      // link 안의 갱신은 `refreshAuth`를 거치지 않는다. 그 함수는 진행 중인 link, 곧 자기 자신을 기다린다.
      state = res.status === 401 ? await startRefresh() : await ensureAuth();
      if (state === null) {
        return { status: "failed", code: "UNKNOWN" };
      }
      res = await postLink(state, body);
    }
    if (!res.ok) {
      return { status: "failed", code: await linkFailureCode(res) };
    }
    const { accessToken, refreshToken, isNewUser } = (await res.json()) as AuthLinkResponse;
    const userId = readUserIdFromAccessToken(accessToken);
    if (userId === null) {
      return { status: "failed", code: "UNKNOWN" };
    }
    await writeAuth({ userId, accessToken, refreshToken });
    return { status: "success", isNewUser };
  } catch (error) {
    console.warn("[auth] 소셜 계정 연결 실패", error);
    return { status: "failed", code: "UNKNOWN" };
  }
}
