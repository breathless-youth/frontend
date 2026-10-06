import type { InterviewState } from "./interviewStore";

/**
 * 인터뷰 안내 노출 판정
 *
 * 누가 대상인지는 서버가 정하고, 여기서는 언제 얼마나 자주 띄울지만 판단한다.
 * 저장소를 만지지 않는 순수 함수라 화면과 테스트가 같은 규칙을 쓴다.
 */

export const MODAL_MAX_COUNT = 2;
export const MODAL_INTERVAL_MS = 168 * 60 * 60 * 1000;
export const REVISIT_GAP_MS = 30 * 60 * 1000;

/** 하루 하나 규칙의 날짜는 사용자가 보는 기기 날짜를 따른다. */
export function localDateKey(nowMs: number): string {
  const d = new Date(nowMs);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function isRevisit(lastHiddenAt: number | null, nowMs: number): boolean {
  return lastHiddenAt !== null && nowMs - lastHiddenAt > REVISIT_GAP_MS;
}

function promptedToday(state: InterviewState, nowMs: number): boolean {
  return state.lastPromptDate === localDateKey(nowMs);
}

export function canShowInterviewModal(state: InterviewState, nowMs: number): boolean {
  if (state.applied || state.modalNeverAgain || promptedToday(state, nowMs)) {
    return false;
  }
  if (state.modalCount >= MODAL_MAX_COUNT) {
    return false;
  }
  if (state.modalCount === 0) {
    return true;
  }
  // 저장값이 일부 깨져 첫 노출 시각만 사라졌으면 간격을 지켰는지 알 수 없어 띄우지 않는다.
  if (state.firstModalAt === null) {
    return false;
  }
  return nowMs - state.firstModalAt >= MODAL_INTERVAL_MS;
}

/** 카드 X는 따로 저장하지 않는다. 하루 한 번 규칙이 그날 다시 뜨지 않게 한다. */
export function canShowInterviewCard(state: InterviewState, nowMs: number): boolean {
  if (state.applied || promptedToday(state, nowMs)) {
    return false;
  }
  return state.cardShownDate !== localDateKey(nowMs);
}

export function afterModalShown(state: InterviewState, nowMs: number): InterviewState {
  return {
    ...state,
    modalCount: state.modalCount + 1,
    firstModalAt: state.firstModalAt ?? nowMs,
    lastPromptDate: localDateKey(nowMs),
  };
}

export function afterCardShown(state: InterviewState, nowMs: number): InterviewState {
  const today = localDateKey(nowMs);
  return {
    ...state,
    cardShownCount: state.cardShownCount + 1,
    cardShownDate: today,
    lastPromptDate: today,
  };
}

export function afterApplied(state: InterviewState): InterviewState {
  return { ...state, applied: true };
}

export function afterModalNeverAgain(state: InterviewState): InterviewState {
  return { ...state, modalNeverAgain: true };
}
