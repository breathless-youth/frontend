import {
  activate,
  fetchConfig,
  getRemoteConfig,
  getString,
} from "@react-native-firebase/remote-config";

/**
 * Firebase Remote Config 어댑터 (BY-585).
 *
 * 화면·컴포넌트가 `@react-native-firebase/remote-config`를 직접 import하지 않게 격리하는
 * 계층이다(`apps/mobile/CLAUDE.md` 경계 규칙, `cameraPermission.ts`와 같은 꼴). 값의 소비자
 * (BY-586 최소 지원 버전 게이트)는 아래 공개 함수만 본다.
 *
 * 부팅 전략(BY-586): 지난 실행에서 fetch해 둔 값을 `activate`로 즉시 적용해 판정하고, `fetch`는
 * 백그라운드로 돌려 다음 실행에 반영한다 — 스플래시를 네트워크에 묶지 않는다.
 */

export type RemoteConfigDefaults = Record<string, string | number | boolean>;

export type RemoteConfigAdapter = {
  /** 앱 기본값과 fetch 설정을 등록한다. 첫 실행·오프라인처럼 서버 값이 없을 때 이 값이 읽힌다. */
  setDefaults(defaults: RemoteConfigDefaults): Promise<void>;
  /** 마지막으로 fetch해 둔 값을 활성화한다. 새 값이 적용됐으면 true. */
  activate(): Promise<boolean>;
  /** 서버에서 값을 받아 둔다(활성화는 하지 않는다). 최소 fetch 간격 안이면 캐시로 끝난다. */
  fetch(): Promise<void>;
  getString(key: string): string;
};

// 운영은 1시간 — Firebase 무료 한도(시간당 fetch 수 제한)를 지키면서 강제 업데이트 반영이
// 하루 안에 끝나는 간격. 개발은 0으로 두어 콘솔에서 바꾼 값을 재실행마다 바로 본다.
const PROD_MIN_FETCH_INTERVAL_MS = 3_600_000;
const FETCH_TIMEOUT_MS = 60_000;

export const rnfbRemoteConfigAdapter: RemoteConfigAdapter = {
  setDefaults(defaults) {
    const remoteConfig = getRemoteConfig();
    // RNFB 26의 공개 타입은 web v9 호환 setter만 노출한다 — setter는 네이티브 호출을 기다리지
    // 않지만 같은 모듈의 이후 호출(activate 등)보다 먼저 큐에 들어간다.
    remoteConfig.settings = {
      minimumFetchIntervalMillis: __DEV__ ? 0 : PROD_MIN_FETCH_INTERVAL_MS,
      fetchTimeoutMillis: FETCH_TIMEOUT_MS,
    };
    remoteConfig.defaultConfig = defaults;
    return Promise.resolve();
  },
  activate() {
    return activate(getRemoteConfig());
  },
  fetch() {
    return fetchConfig(getRemoteConfig());
  },
  getString(key) {
    return getString(getRemoteConfig(), key);
  },
};

let adapter: RemoteConfigAdapter = rnfbRemoteConfigAdapter;

/** 테스트에서 어댑터를 교체한다. */
export function setRemoteConfigAdapter(next: RemoteConfigAdapter): void {
  adapter = next;
}

export function setRemoteConfigDefaults(defaults: RemoteConfigDefaults): Promise<void> {
  return adapter.setDefaults(defaults);
}

export function activateRemoteConfig(): Promise<boolean> {
  return adapter.activate();
}

export function fetchRemoteConfig(): Promise<void> {
  return adapter.fetch();
}

/**
 * 다음 실행에 반영할 값을 받아 둔다. 실패는 로그로만 남긴다 — 값을 못 받으면 마지막 값(또는
 * 기본값)으로 동작하는 것이 이 계층의 계약이다(fail-open).
 */
export function fetchRemoteConfigInBackground(): void {
  void adapter.fetch().catch((error: unknown) => {
    console.warn("[remote-config] 백그라운드 fetch 실패", error);
  });
}

export function getRemoteConfigString(key: string): string {
  return adapter.getString(key);
}
