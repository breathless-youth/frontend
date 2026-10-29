/**
 * 홈에서 고른 과목을 세션 화면에 넘기는 기록
 *
 * 앱에서는 홈과 세션이 서로 다른 웹뷰라 둘이 함께 쓰는 기기 저장소로 넘긴다.
 * 앱은 세션 화면에 시작 요청의 시각을 넘기지 않아서, 세션 화면은 남긴 지 30초 안의 기록만 쓴다.
 * 실패한 시작이 남긴 기록이 과목 없이 시작한 다음 세션에 붙지 않게 하려는 것이다.
 * `atMs`는 같은 시작의 `start-session` 메시지와 같은 값이다.
 */
const KEY = "focusmakers:start-subject";

export const START_SUBJECT_TTL_MS = 30_000;

export interface StartSubject {
  readonly userId: number;
  readonly subjectId: number;
  readonly atMs: number;
}

/** 시작 직전에 남기는 기록 */
export function saveStartSubject(userId: number, subjectId: number, atMs: number): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ userId, subjectId, atMs }));
  } catch {
    // 저장소를 쓸 수 없으면 과목 없이 시작할 뿐이다.
  }
}

export function clearStartSubject(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 삭제하지 못한 기록도 30초가 지나면 쓰이지 않는다.
  }
}

/**
 * 남긴 지 30초 안의 기록
 *
 * 읽기만 하고 삭제하지 않는다.
 * 남긴 시각이 읽는 때보다 뒤면 기기 시계가 바뀐 것이라 버린다.
 */
export function readStartSubject(nowMs: number): StartSubject | null {
  try {
    const raw = localStorage.getItem(KEY);
    const record = raw === null ? null : (JSON.parse(raw) as Partial<StartSubject> | null);
    if (
      !Number.isInteger(record?.userId) ||
      !Number.isInteger(record?.subjectId) ||
      typeof record?.atMs !== "number"
    ) {
      return null;
    }
    const ageMs = nowMs - record.atMs;
    return ageMs >= 0 && ageMs <= START_SUBJECT_TTL_MS ? (record as StartSubject) : null;
  } catch {
    return null;
  }
}
