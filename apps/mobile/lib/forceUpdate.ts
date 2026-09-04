import * as Application from "expo-application";

import { FORCE_UPDATE_COPY_DEFAULTS } from "./forceUpdateCopy";
import {
  activateRemoteConfig,
  fetchRemoteConfigInBackground,
  getRemoteConfigString,
  setRemoteConfigDefaults,
} from "./remoteConfig";

/**
 * 네이티브 강제 업데이트 판정 (BY-586).
 *
 * 최소 지원 버전의 원천은 Firebase Remote Config `min_supported_version`(prod 프로젝트)이다. 앱 버전이
 * 그보다 낮으면 `app/_layout.tsx`가 웹뷰 대신 빈 배경을 그리고 OS 알림창(`lib/forceUpdateAlert.ts`)으로 막는다.
 *
 * 부팅 전략: 지난 실행에서 fetch해 둔 값을 `activate`로 즉시 적용해 판정하고, `fetch`는 백그라운드로
 * 돌려 **다음 실행**에 반영한다 — 스플래시를 네트워크에 묶지 않는다. `activate`가 제한 시간 안에
 * 안 끝나거나 값을 못 읽으면 통과시킨다(fail-open). 콘솔에서 값을 올린 뒤 한 번 더 실행해야 걸리는
 * 것이 의도된 동작이다.
 *
 * 웹 `apps/web/src/features/force-update/`의 게이트는 이 티켓 이전 바이너리 전용으로 남고, 새 바이너리는
 * `remoteQueryParams.ts`의 `nativeUpdateGate=1` 표시로 웹 게이트를 건너뛴다. 비교 규칙은 웹
 * `compareVersions`와 같게 두되 코드는 각자 둔다(공유 패키지 없음).
 */
export const MIN_SUPPORTED_VERSION_KEY = "min_supported_version";
/** 서버 값이 없을 때의 기본값 — 어떤 출시 버전도 막지 않는 값이어야 한다. */
export const DEFAULT_MIN_SUPPORTED_VERSION = "1.0.0";
/** RNFB `setDefaults`는 기본값 맵을 통째로 바꾸므로 Remote Config 기본값은 전부 여기서 한 번에 등록한다. */
export const UPDATE_CONFIG_DEFAULTS = {
  [MIN_SUPPORTED_VERSION_KEY]: DEFAULT_MIN_SUPPORTED_VERSION,
  ...FORCE_UPDATE_COPY_DEFAULTS,
};
const ACTIVATE_TIMEOUT_MS = 1_000;

// 앱 버전은 항상 x.y.z 3자리다(`app.json`의 `expo.version`).
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** "1.0.10" 같은 두 자릿수 세그먼트까지 숫자로 비교한다(문자열 비교였다면 "1.0.10" < "1.0.9"). */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const as = a.split(".").map(Number);
  const bs = b.split(".").map(Number);
  const length = Math.max(as.length, bs.length);
  for (let i = 0; i < length; i++) {
    const av = as[i] ?? 0;
    const bv = bs[i] ?? 0;
    if (Number.isNaN(av) || Number.isNaN(bv)) return 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

/** 값이 없거나 형식이 이상하면 절대 막지 않는다(fail-open). */
export function shouldForceUpdate(
  appVersion: string | null | undefined,
  minVersion: string | null | undefined,
): boolean {
  if (!appVersion || !minVersion) return false;
  if (!VERSION_PATTERN.test(appVersion) || !VERSION_PATTERN.test(minVersion)) return false;
  return compareVersions(appVersion, minVersion) < 0;
}

export type ForceUpdateDecision = {
  forced: boolean;
  appVersion: string | null;
  /** 판정에 쓴 최소 버전. 못 읽었으면 null. */
  minVersion: string | null;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * 부팅 시 한 번 호출한다. 어떤 경우에도 throw하지 않는다.
 */
export async function resolveForceUpdate(
  options: { activateTimeoutMs?: number } = {},
): Promise<ForceUpdateDecision> {
  const appVersion = Application.nativeApplicationVersion ?? null;
  let minVersion: string | null = null;
  try {
    await setRemoteConfigDefaults(UPDATE_CONFIG_DEFAULTS);
    await withTimeout(activateRemoteConfig(), options.activateTimeoutMs ?? ACTIVATE_TIMEOUT_MS);
    const value = getRemoteConfigString(MIN_SUPPORTED_VERSION_KEY);
    minVersion = value === "" ? null : value;
  } catch (error) {
    console.warn("[force-update] Remote Config 활성화 실패 — 통과시킨다(fail-open)", error);
  } finally {
    // 다음 실행에 반영할 값을 받아 둔다. 판정 자체는 이미 끝났으므로 결과를 기다리지 않는다.
    fetchRemoteConfigInBackground();
  }
  const decision = { forced: shouldForceUpdate(appVersion, minVersion), appVersion, minVersion };
  if (__DEV__) {
    // eslint-disable-next-line no-console -- 개발 빌드에서 판정 근거를 확인하기 위한 로그
    console.log(
      `[force-update] forced=${String(decision.forced)} appVersion=${appVersion ?? "?"} minVersion=${minVersion ?? "(없음)"}`,
    );
  }
  return decision;
}
