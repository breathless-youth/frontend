/**
 * AI 측정 만족도 카드 노출 기록의 저장
 *
 * 결과 화면은 세션마다 새로 열리는 웹뷰라 localStorage에 둬야 3일 간격 규칙이 이어진다.
 * 지워져도 카드가 한 번 더 뜰 뿐이라 네이티브 저장소를 쓰지 않는다.
 * 서버 명세가 아니므로 packages/types에 두지 않는다.
 */

const LAST_SHOWN_KEY = "focuson.measurementFeedback.lastShownAt";

export interface MeasurementFeedbackState {
  /** 카드가 마지막으로 보인 시각(epoch ms). 본 적이 없으면 null */
  lastShownAt: number | null;
}

export interface MeasurementFeedbackStore {
  readLastShownAt(): number | null;
  writeLastShownAt(atMs: number): void;
}

const localStorageMeasurementFeedbackStore: MeasurementFeedbackStore = {
  readLastShownAt: () => {
    const raw = localStorage.getItem(LAST_SHOWN_KEY);
    const value = Number(raw);
    // 깨진 값은 NaN이 되어 간격 계산이 늘 거짓이 된다.
    // 그대로 두면 카드가 영영 뜨지 않아 본 적이 없는 것으로 읽는다.
    return raw !== null && Number.isFinite(value) ? value : null;
  },
  writeLastShownAt: (atMs) => localStorage.setItem(LAST_SHOWN_KEY, String(atMs)),
};

/** 테스트용 인메모리 구현 */
export function createMemoryMeasurementFeedbackStore(
  lastShownAt: number | null = null,
): MeasurementFeedbackStore {
  let value = lastShownAt;
  return {
    readLastShownAt: () => value,
    writeLastShownAt: (atMs) => {
      value = atMs;
    },
  };
}

let store: MeasurementFeedbackStore = localStorageMeasurementFeedbackStore;

export function setMeasurementFeedbackStore(next: MeasurementFeedbackStore): void {
  store = next;
}

export function resetMeasurementFeedbackStore(): void {
  store = localStorageMeasurementFeedbackStore;
}

/**
 * 노출 기록 읽기
 *
 * 읽지 못하면 null을 돌려 화면이 카드를 띄우지 않게 한다.
 * 반대로 처리하면 저장소가 막힌 기기에서 결과 화면마다 카드가 뜬다.
 */
export function loadMeasurementFeedbackState(): MeasurementFeedbackState | null {
  try {
    return { lastShownAt: store.readLastShownAt() };
  } catch (error) {
    console.warn("[measurement-feedback] 노출 기록을 읽지 못해 카드를 띄우지 않는다", error);
    return null;
  }
}

/**
 * 노출 시각 기록
 *
 * 쓰기에 실패해도 화면 흐름을 막지 않는다.
 */
export function recordMeasurementFeedbackShown(atMs: number): void {
  try {
    store.writeLastShownAt(atMs);
  } catch (error) {
    console.warn("[measurement-feedback] 노출 시각을 저장하지 못했다", error);
  }
}
