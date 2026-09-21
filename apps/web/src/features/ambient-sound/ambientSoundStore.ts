/**
 * 배경음 설정(마지막 믹스·집중 연동 토글)의 영속 저장
 *
 * localStorage 를 쓰는 이유는 `social-room/socialRoomNotice.ts` 상단 주석과 같다.
 * 탭 화면과 세션 화면이 별도 WebView 라 sessionStorage 가 공유되지 않는다.
 */
import { setLevel } from "./mix";
import type { Mix } from "./mix";

const KEY = "focuson.ambientSound.v1";

export type AmbientSoundSettings = {
  mix: Mix;
  duckEnabled: boolean;
};

export const DEFAULT_AMBIENT_SETTINGS: AmbientSoundSettings = {
  mix: {},
  duckEnabled: true,
};

export interface AmbientSoundStore {
  load(): Promise<AmbientSoundSettings>;
  save(settings: AmbientSoundSettings): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 숫자가 아닌 레벨은 버리고 나머지는 setLevel 규칙(0~100 자르기, 0 제거)을 탄다. */
function parseMix(raw: unknown): Mix {
  if (!isRecord(raw)) return {};
  let mix: Mix = {};
  for (const [id, level] of Object.entries(raw)) {
    if (typeof level === "number" && Number.isFinite(level)) mix = setLevel(mix, id, level);
  }
  return mix;
}

/** 저장된 값이 어떤 모양이든 예외 없이 정상 설정으로 만든다. */
export function parseAmbientSettings(raw: unknown): AmbientSoundSettings {
  if (!isRecord(raw)) return DEFAULT_AMBIENT_SETTINGS;
  return {
    mix: parseMix(raw.mix),
    duckEnabled: typeof raw.duckEnabled === "boolean" ? raw.duckEnabled : true,
  };
}

export const localStorageAmbientSoundStore: AmbientSoundStore = {
  load() {
    // 접근 자체가 throw 할 수 있다(프라이버시 모드 등) — 아래 최상위 함수가 삼킨다.
    const raw = localStorage.getItem(KEY);
    return Promise.resolve(
      raw === null ? DEFAULT_AMBIENT_SETTINGS : parseAmbientSettings(JSON.parse(raw)),
    );
  },
  save(settings) {
    localStorage.setItem(KEY, JSON.stringify(settings));
    return Promise.resolve();
  },
};

/** 테스트·개발용 인메모리 구현. */
export function createMemoryAmbientSoundStore(
  initial: AmbientSoundSettings = DEFAULT_AMBIENT_SETTINGS,
): AmbientSoundStore {
  let current = initial;
  return {
    load: () => Promise.resolve(current),
    save: (settings) => {
      current = settings;
      return Promise.resolve();
    },
  };
}

let store: AmbientSoundStore = localStorageAmbientSoundStore;

/** 저장소 구현체를 교체한다(테스트용). */
export function setAmbientSoundStore(next: AmbientSoundStore): void {
  store = next;
}

/** 테스트 격리용 — 기본(localStorage) 구현으로 되돌린다. */
export function resetAmbientSoundStore(): void {
  store = localStorageAmbientSoundStore;
}

/** 조회 실패는 기본값(빈 믹스)으로 떨어진다. 최악의 결과가 "배경음이 안 켜진다"에 그친다. */
export async function loadAmbientSoundSettings(): Promise<AmbientSoundSettings> {
  try {
    return await store.load();
  } catch (error) {
    console.warn("[ambient-sound] 설정 조회 실패 — 기본값을 쓴다", error);
    return DEFAULT_AMBIENT_SETTINGS;
  }
}

/** 저장 실패는 reject 하지 않는다. 세션 진행이 저장소 사정에 막히면 안 된다. */
export async function saveAmbientSoundSettings(settings: AmbientSoundSettings): Promise<void> {
  try {
    await store.save(settings);
  } catch (error) {
    console.warn("[ambient-sound] 설정 저장 실패 — 다음 세션에 기억되지 않는다", error);
  }
}
