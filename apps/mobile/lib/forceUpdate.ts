import * as Application from "expo-application";

import { FORCE_UPDATE_COPY_DEFAULTS } from "./forceUpdateCopy";
import { trackNativeEvent } from "./nativeAnalytics";
import { RECOMMENDED_UPDATE_COPY_DEFAULTS } from "./recommendedUpdateCopy";
import {
  activateRemoteConfig,
  fetchRemoteConfig,
  getRemoteConfigString,
  setRemoteConfigDefaults,
} from "./remoteConfig";
import { withTimeout } from "./withTimeout";

/**
 * 네이티브 업데이트 판정 (BY-586) — 강제(min) + 권장(latest).
 *
 * 원천은 Firebase Remote Config(prod 프로젝트)의 두 키다. `min_supported_version`보다 앱 버전이 낮으면
 * `app/_layout.tsx`가 웹뷰 대신 빈 배경을 그리고 OS 알림창(`lib/forceUpdateAlert.ts`)으로 막는다.
 * 막히지 않았고 `latest_version`보다 낮으면 닫을 수 있는 권장 알림창(`lib/recommendedUpdateAlert.ts`)을
 * 띄운다. 두 값은 한 번의 activate로 함께 읽는다.
 *
 * 콘솔에서 "앱 버전 < x" 같은 조건으로 값을 갈라 줄 수도 있다 — 앱 쪽 비교와 겹쳐도 무해하다.
 *
 * 콘솔에서 게시한 값은 다음 접속에 걸린다.
 * 접속은 앱을 새로 켤 때와 30분 이상 백그라운드에 있다가 돌아올 때다(`lib/updateOnConnect.ts`).
 * 앱을 켤 때는 서버 값을 짧게 기다리고, 늦으면 지난 값으로 먼저 판정해 스플래시를 걷는다(`resolveForceUpdateOnLaunch`).
 * 접속 때는 최소 fetch 간격을 무시하고 서버 값을 새로 받는다(`refreshForceUpdate`).
 * 어느 단계든 값을 못 받으면 지난 값으로 판정하고, 지난 값도 못 읽으면 통과시킨다.
 *
 * 웹 `apps/web/src/features/force-update/`의 게이트는 이 티켓 이전 바이너리 전용으로 남고, 새 바이너리는
 * `remoteQueryParams.ts`의 `nativeUpdateGate=1` 표시로 웹 게이트를 건너뛴다. 비교 규칙은 웹
 * `compareVersions`와 같게 두되 코드는 각자 둔다(공유 패키지 없음).
 */
export const MIN_SUPPORTED_VERSION_KEY = "min_supported_version";
/** 서버 값이 없을 때의 기본값 — 어떤 출시 버전도 막지 않는 값이어야 한다. */
export const DEFAULT_MIN_SUPPORTED_VERSION = "1.0.0";
export const LATEST_VERSION_KEY = "latest_version";
/** 서버 값이 없을 때의 기본값 — 어떤 버전에도 권장을 띄우지 않는 값이어야 한다. */
export const DEFAULT_LATEST_VERSION = "0.0.0";
/** RNFB `setDefaults`는 기본값 맵을 통째로 바꾸므로 Remote Config 기본값은 전부 여기서 한 번에 등록한다. */
export const UPDATE_CONFIG_DEFAULTS = {
  [MIN_SUPPORTED_VERSION_KEY]: DEFAULT_MIN_SUPPORTED_VERSION,
  [LATEST_VERSION_KEY]: DEFAULT_LATEST_VERSION,
  ...FORCE_UPDATE_COPY_DEFAULTS,
  ...RECOMMENDED_UPDATE_COPY_DEFAULTS,
};
const ACTIVATE_TIMEOUT_MS = 1_000;
const FRESH_WAIT_MS = 1_500;

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

/** 권장도 같은 규칙이다: 값이 없거나 형식이 이상하면 띄우지 않는다. */
export function shouldRecommendUpdate(
  appVersion: string | null | undefined,
  latestVersion: string | null | undefined,
): boolean {
  return shouldForceUpdate(appVersion, latestVersion);
}

export type ForceUpdateDecision = {
  forced: boolean;
  /** 막히지 않았고 최신 버전이 앱 버전보다 높다. forced면 항상 false. */
  recommended: boolean;
  appVersion: string | null;
  /** 판정에 쓴 최소 버전. 못 읽었으면 null. */
  minVersion: string | null;
  /** 판정에 쓴 최신 버전. 못 읽었으면 null. */
  latestVersion: string | null;
};

/**
 * 지난 값으로 하는 판정
 *
 * 기본값을 등록하고 지난 실행에서 받아 둔 값을 적용해 판정한다.
 * 적용이 제한 시간 안에 안 끝나면 통과시킨다.
 * 어떤 경우에도 throw하지 않는다.
 */
export async function resolveForceUpdate(
  options: { activateTimeoutMs?: number } = {},
): Promise<ForceUpdateDecision> {
  let activated = false;
  try {
    await setRemoteConfigDefaults(UPDATE_CONFIG_DEFAULTS);
    await withTimeout(activateRemoteConfig(), options.activateTimeoutMs ?? ACTIVATE_TIMEOUT_MS);
    activated = true;
  } catch (error) {
    console.warn("[force-update] Remote Config 활성화 실패 — 통과시킨다(fail-open)", error);
  }
  return decide(activated);
}

/** 접속 종류: 앱을 새로 켰는지, 긴 백그라운드에서 돌아왔는지 */
export type ConnectTrigger = "cold_start" | "resume";

/**
 * 서버 값을 새로 받아 하는 판정
 *
 * 최소 fetch 간격을 무시하고 받아 적용한 뒤 판정한다.
 * 받기에 실패하면 지난 값으로 판정한다.
 * 성공·실패를 `update_config_refreshed`로 남겨 운영 실패율을 보고 재시도가 필요한지 판단한다.
 * 어떤 경우에도 throw하지 않는다.
 */
export async function refreshForceUpdate(trigger: ConnectTrigger): Promise<ForceUpdateDecision> {
  let result: "ok" | "failed" = "ok";
  try {
    await fetchRemoteConfig(0);
    await activateRemoteConfig();
  } catch (error) {
    result = "failed";
    console.warn("[force-update] 새 값 받기 실패 — 지난 값으로 판정한다(fail-open)", error);
  }
  trackNativeEvent("update_config_refreshed", { trigger, result });
  return decide(true);
}

export type LaunchDecision = {
  /** 스플래시를 걷기 전에 쓰는 첫 판정 */
  decision: ForceUpdateDecision;
  /**
   * 늦게 온 새 값의 판정
   *
   * 새 값이 상한 안에 안 와서 지난 값으로 판정했을 때만 있다.
   */
  late: Promise<ForceUpdateDecision> | null;
};

/**
 * 앱을 켤 때의 판정
 *
 * 지난 값을 적용해 둔 뒤 서버 값을 새로 받아, 시작부터 `freshWaitMs`가 지날 때까지 기다린다.
 * 그 안에 오면 새 값으로 첫 판정을 해서, 강제 대상이면 홈을 그리기 전에 막는다.
 * 넘기면 지난 값으로 판정해 스플래시를 걷고 늦게 온 새 값의 판정은 `late`로 넘긴다.
 * 오프라인 사용자의 스플래시가 Firebase 받기 제한 시간만큼 멈추지 않게 상한을 둔다.
 */
export async function resolveForceUpdateOnLaunch(
  options: { freshWaitMs?: number; activateTimeoutMs?: number } = {},
): Promise<LaunchDecision> {
  const deadline = Date.now() + (options.freshWaitMs ?? FRESH_WAIT_MS);
  const cached = await resolveForceUpdate(options);
  const fresh = refreshForceUpdate("cold_start");
  try {
    return { decision: await withTimeout(fresh, Math.max(0, deadline - Date.now())), late: null };
  } catch {
    return { decision: cached, late: fresh };
  }
}

/**
 * 활성화된 값으로 하는 판정
 *
 * `readable`이 false면 값을 못 읽은 것으로 보고 통과시킨다.
 */
function decide(readable: boolean): ForceUpdateDecision {
  const appVersion = Application.nativeApplicationVersion ?? null;
  const minVersion = readable ? readVersion(MIN_SUPPORTED_VERSION_KEY) : null;
  const latestVersion = readable ? readVersion(LATEST_VERSION_KEY) : null;
  const forced = shouldForceUpdate(appVersion, minVersion);
  const decision: ForceUpdateDecision = {
    forced,
    recommended: !forced && shouldRecommendUpdate(appVersion, latestVersion),
    appVersion,
    minVersion,
    latestVersion,
  };
  if (__DEV__) {
    // eslint-disable-next-line no-console -- 개발 빌드에서 판정 근거를 확인하기 위한 로그
    console.log(
      `[force-update] forced=${String(decision.forced)} recommended=${String(decision.recommended)} appVersion=${appVersion ?? "?"} minVersion=${minVersion ?? "(없음)"} latestVersion=${latestVersion ?? "(없음)"}`,
    );
  }
  return decision;
}

/** 읽기 예외는 값이 없는 것으로 보고 통과시킨다. */
function readVersion(key: string): string | null {
  let value: string;
  try {
    value = getRemoteConfigString(key);
  } catch (error) {
    console.warn("[force-update] Remote Config 값 읽기 실패, 통과시킨다", error);
    return null;
  }
  return value === "" ? null : value;
}
