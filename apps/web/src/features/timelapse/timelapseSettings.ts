/**
 * 타임랩스 설정 모델과 영속 저장
 *
 * 설정 화면은 탭 웹뷰, 촬영은 세션 웹뷰라 서로 다른 document다.
 * 같은 주소끼리 공유되는 localStorage에 두어야 양쪽이 같은 값을 읽는다.
 * 세션은 시작할 때 한 번 읽어 그 타임랩스에 스냅샷으로 남긴다.
 */

const KEY = "focuson.timelapse.v1";

export type TimelapseAspect = "9:16" | "16:9";

/**
 * 영상에 넣을 정보
 *
 * 설정 화면의 스위치 순서이고 얼굴 가림이 개인정보 항목이라 맨 위다.
 */
export const TIMELAPSE_INFO_KEYS = [
  "faceMask",
  "flowBar",
  "date",
  "focusTime",
  "focusRate",
  "dday",
  "streak",
] as const;

export type TimelapseInfoKey = (typeof TIMELAPSE_INFO_KEYS)[number];

export interface TimelapseSettings {
  readonly enabled: boolean;
  readonly aspect: TimelapseAspect;
  readonly info: Readonly<Record<TimelapseInfoKey, boolean>>;
}

export const DEFAULT_TIMELAPSE_SETTINGS: TimelapseSettings = {
  enabled: true,
  aspect: "9:16",
  info: {
    faceMask: false,
    flowBar: false,
    date: false,
    focusTime: false,
    focusRate: false,
    dday: false,
    streak: false,
  },
};

export interface TimelapseSettingsStore {
  load(): Promise<TimelapseSettings>;
  save(settings: TimelapseSettings): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 저장된 값의 설정 변환
 *
 * 어떤 모양이 와도 던지지 않고 잘못된 항목만 기본값으로 돌린다.
 */
export function parseTimelapseSettings(raw: unknown): TimelapseSettings {
  if (!isRecord(raw)) return DEFAULT_TIMELAPSE_SETTINGS;
  const rawInfo = isRecord(raw.info) ? raw.info : {};
  const info = { ...DEFAULT_TIMELAPSE_SETTINGS.info };
  for (const key of TIMELAPSE_INFO_KEYS) {
    const value = rawInfo[key];
    if (typeof value === "boolean") info[key] = value;
  }
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_TIMELAPSE_SETTINGS.enabled,
    aspect:
      raw.aspect === "9:16" || raw.aspect === "16:9"
        ? raw.aspect
        : DEFAULT_TIMELAPSE_SETTINGS.aspect,
    info,
  };
}

export const localStorageTimelapseSettingsStore: TimelapseSettingsStore = {
  load() {
    // 프라이버시 모드에서는 접근 자체가 throw 할 수 있다.
    // 아래 최상위 함수가 삼킨다.
    const raw = localStorage.getItem(KEY);
    return Promise.resolve(
      raw === null ? DEFAULT_TIMELAPSE_SETTINGS : parseTimelapseSettings(JSON.parse(raw)),
    );
  },
  save(settings) {
    localStorage.setItem(KEY, JSON.stringify(settings));
    return Promise.resolve();
  },
};

/** 테스트용 인메모리 저장소 */
export function createMemoryTimelapseSettingsStore(
  initial: TimelapseSettings = DEFAULT_TIMELAPSE_SETTINGS,
): TimelapseSettingsStore {
  let current = initial;
  return {
    load: () => Promise.resolve(current),
    save: (settings) => {
      current = settings;
      return Promise.resolve();
    },
  };
}

let store: TimelapseSettingsStore = localStorageTimelapseSettingsStore;

/** 테스트가 저장소 구현체를 바꿀 때 쓴다. */
export function setTimelapseSettingsStore(next: TimelapseSettingsStore): void {
  store = next;
}

/** 테스트가 끝나면 localStorage 구현으로 되돌린다. */
export function resetTimelapseSettingsStore(): void {
  store = localStorageTimelapseSettingsStore;
}

/**
 * 설정 조회
 *
 * 실패하면 기본값을 준다.
 * 세션 시작이 저장소 사정에 막히면 안 된다.
 */
export async function loadTimelapseSettings(): Promise<TimelapseSettings> {
  try {
    return await store.load();
  } catch (error) {
    console.warn("[timelapse] 설정 조회 실패, 기본값을 쓴다", error);
    return DEFAULT_TIMELAPSE_SETTINGS;
  }
}

/**
 * 설정 저장
 *
 * 실패해도 reject 하지 않는다.
 * 설정 화면이 저장소 사정으로 멈추면 안 된다.
 */
export async function saveTimelapseSettings(settings: TimelapseSettings): Promise<void> {
  try {
    await store.save(settings);
  } catch (error) {
    console.warn("[timelapse] 설정 저장 실패, 다음 세션에 반영되지 않는다", error);
  }
}
