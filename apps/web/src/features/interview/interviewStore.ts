/**
 * 인터뷰 안내 노출 기록의 저장
 *
 * 홈 웹뷰와 세션 웹뷰는 서로 다른 문서라 localStorage로 공유해야 빈도 규칙이 화면을 가로질러 맞는다.
 * 서버 명세가 아니므로 packages/types에 두지 않는다.
 * 지워져도 안내가 한 번 더 뜰 뿐이라 네이티브 저장소를 쓰지 않는다.
 */

const STATE_KEY = "focuson.interview.v1";
const LAST_HIDDEN_KEY = "focuson.interview.lastHiddenAt";

export interface InterviewState {
  /** 신청 버튼을 누른 적이 있다. 이후 모달·카드를 띄우지 않는다 */
  applied: boolean;
  modalCount: number;
  /** epoch ms */
  firstModalAt: number | null;
  modalNeverAgain: boolean;
  /** 기기 로컬 날짜 YYYY-MM-DD */
  lastPromptDate: string | null;
  cardShownDate: string | null;
  cardShownCount: number;
}

export const INITIAL_INTERVIEW_STATE: InterviewState = {
  applied: false,
  modalCount: 0,
  firstModalAt: null,
  modalNeverAgain: false,
  lastPromptDate: null,
  cardShownDate: null,
  cardShownCount: 0,
};

export interface InterviewStore {
  read(): InterviewState;
  write(state: InterviewState): void;
  readLastHiddenAt(): number | null;
  writeLastHiddenAt(atMs: number): void;
}

function pick<T>(value: unknown, guard: (v: unknown) => v is T, fallback: T): T {
  return guard(value) ? value : fallback;
}
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isTime = (v: unknown): v is number | null => v === null || Number.isFinite(v);
const isDate = (v: unknown): v is string | null =>
  v === null || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v));

/** 다른 버전의 앱이 쓴 값이나 손상된 값이 와도 필드 단위로 살린다. */
function parseState(raw: string | null): InterviewState {
  if (raw === null) {
    return INITIAL_INTERVIEW_STATE;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return INITIAL_INTERVIEW_STATE;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return INITIAL_INTERVIEW_STATE;
  }
  const s = parsed as Record<string, unknown>;
  const d = INITIAL_INTERVIEW_STATE;
  return {
    applied: pick(s.applied, isBool, d.applied),
    modalCount: pick(s.modalCount, isCount, d.modalCount),
    firstModalAt: pick(s.firstModalAt, isTime, d.firstModalAt),
    modalNeverAgain: pick(s.modalNeverAgain, isBool, d.modalNeverAgain),
    lastPromptDate: pick(s.lastPromptDate, isDate, d.lastPromptDate),
    cardShownDate: pick(s.cardShownDate, isDate, d.cardShownDate),
    cardShownCount: pick(s.cardShownCount, isCount, d.cardShownCount),
  };
}

export const localStorageInterviewStore: InterviewStore = {
  read: () => parseState(localStorage.getItem(STATE_KEY)),
  write: (state) => localStorage.setItem(STATE_KEY, JSON.stringify(state)),
  readLastHiddenAt: () => {
    const raw = localStorage.getItem(LAST_HIDDEN_KEY);
    // Number("")가 0이라 빈 값을 그대로 바꾸면 아주 오래전에 나간 재방문으로 읽힌다.
    const value = raw === null || raw.trim() === "" ? NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  },
  writeLastHiddenAt: (atMs) => localStorage.setItem(LAST_HIDDEN_KEY, String(atMs)),
};

/** 테스트용 인메모리 구현 */
export function createMemoryInterviewStore(
  initial: Partial<InterviewState> = {},
  lastHiddenAt: number | null = null,
): InterviewStore {
  let state: InterviewState = { ...INITIAL_INTERVIEW_STATE, ...initial };
  let hiddenAt = lastHiddenAt;
  return {
    read: () => state,
    write: (next) => {
      state = next;
    },
    readLastHiddenAt: () => hiddenAt,
    writeLastHiddenAt: (atMs) => {
      hiddenAt = atMs;
    },
  };
}

let store: InterviewStore = localStorageInterviewStore;

export function setInterviewStore(next: InterviewStore): void {
  store = next;
}

export function resetInterviewStore(): void {
  store = localStorageInterviewStore;
}

/**
 * 노출 기록 읽기
 *
 * 읽지 못하면 null을 돌려 화면이 안내를 띄우지 않게 한다.
 * 반대로 처리하면 저장소가 막힌 기기에서 빈도 제한 없이 매번 뜬다.
 */
export function loadInterviewState(): InterviewState | null {
  try {
    return store.read();
  } catch (error) {
    console.warn("[interview] 노출 기록을 읽지 못해 안내를 띄우지 않는다", error);
    return null;
  }
}

/** 노출 기록 갱신. 쓰기에 실패해도 화면 흐름을 막지 않는다. */
export function updateInterviewState(
  update: (state: InterviewState) => InterviewState,
): InterviewState | null {
  const current = loadInterviewState();
  if (current === null) {
    return null;
  }
  const next = update(current);
  try {
    store.write(next);
  } catch (error) {
    console.warn("[interview] 노출 기록을 저장하지 못했다", error);
  }
  return next;
}

/** 읽지 못하면 첫 방문과 같게 null이다. 1번 모달을 띄우지 않는 쪽으로 떨어진다. */
export function loadLastHiddenAt(): number | null {
  try {
    return store.readLastHiddenAt();
  } catch (error) {
    console.warn("[interview] 마지막으로 떠난 시각을 읽지 못했다", error);
    return null;
  }
}

export function recordLastHiddenAt(atMs: number): void {
  try {
    store.writeLastHiddenAt(atMs);
  } catch (error) {
    console.warn("[interview] 마지막으로 떠난 시각을 저장하지 못했다", error);
  }
}
