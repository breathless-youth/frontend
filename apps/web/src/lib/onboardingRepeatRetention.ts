import { KOREA_TIME_ZONE, localDateKey } from "./dateKey";

const WINDOW_MS = 168 * 60 * 60 * 1000;
const STORAGE_PREFIX = "fm:onboarding-repeat:v1:";

interface RepeatState {
  readonly onboardedAt: number;
  readonly insertId: string;
  readonly firstDay: string | null;
  readonly seenSessionStarts: readonly number[];
  readonly completed: boolean;
}

function parseState(raw: string): RepeatState | null {
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null) return null;
  const state = value as Partial<RepeatState>;
  if (
    typeof state.onboardedAt !== "number" ||
    !Number.isSafeInteger(state.onboardedAt) ||
    state.onboardedAt < 0 ||
    typeof state.insertId !== "string" ||
    state.insertId.length === 0 ||
    (state.firstDay !== null &&
      (typeof state.firstDay !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(state.firstDay))) ||
    typeof state.completed !== "boolean" ||
    !Array.isArray(state.seenSessionStarts) ||
    !state.seenSessionStarts.every((startedAt) => Number.isSafeInteger(startedAt) && startedAt >= 0)
  ) {
    return null;
  }
  return state as RepeatState;
}

/**
 * 최초 온보딩 기준 시각 저장
 *
 * 저장이 된 사용자만 새 집계 버전의 분모에 포함한다.
 * 이미 남은 시각은 덮어쓰지 않고, 손상된 기록도 새 온보딩으로 간주하지 않는다.
 */
export function startOnboardingRepeatTracking(userId: string, at: number): boolean {
  try {
    const key = STORAGE_PREFIX + userId;
    const raw = localStorage.getItem(key);
    if (raw !== null) return false;
    const state: RepeatState = {
      onboardedAt: at,
      insertId: crypto.randomUUID(),
      firstDay: null,
      seenSessionStarts: [],
      completed: false,
    };
    localStorage.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/**
 * 온보딩 후 7일 안의 두 번째 인정 날짜 판정
 *
 * 종료 시각의 한국 날짜를 쓰고, 단일 세션이 300초에 못 미치면 누적하지 않는다.
 * 완료 표시를 먼저 저장하고, 다른 웹뷰에서 중복 전송해도 같은 insert_id를 사용한다.
 */
export function qualifyOnboardingRepeat(
  userId: string,
  focusSec: number,
  endedAt: number,
  startedAt: number,
): string | null {
  if (
    !Number.isFinite(focusSec) ||
    focusSec < 300 ||
    !Number.isFinite(endedAt) ||
    !Number.isSafeInteger(startedAt) ||
    startedAt < 0 ||
    startedAt > endedAt
  )
    return null;
  try {
    const key = STORAGE_PREFIX + userId;
    const raw = localStorage.getItem(key);
    const state = raw === null ? null : parseState(raw);
    if (
      state === null ||
      state.completed ||
      state.seenSessionStarts.includes(startedAt) ||
      endedAt < state.onboardedAt ||
      endedAt >= state.onboardedAt + WINDOW_MS
    ) {
      return null;
    }
    const day = localDateKey(new Date(endedAt), KOREA_TIME_ZONE);
    const completed = state.firstDay !== null && state.firstDay !== day;
    localStorage.setItem(
      key,
      JSON.stringify({
        ...state,
        firstDay: state.firstDay ?? day,
        seenSessionStarts: [...state.seenSessionStarts, startedAt],
        completed,
      }),
    );
    return completed ? state.insertId : null;
  } catch {
    return null;
  }
}
