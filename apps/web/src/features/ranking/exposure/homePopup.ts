import type { RankingOvertaken } from "@focusmakers/types";

import { todayKstDateKey } from "@/lib/dateKst";

/**
 * 홈 랭킹 팝업 판단
 *
 * 공지·인터뷰·복구 창이 먼저이고, 그다음 마감 메달 모달, 그다음 추월 시트 순이다.
 * 한 실행에 팝업은 하나라 공지가 남기는 '이번 실행에 띄움' 표시를 같이 본다.
 * 날짜는 서버 집계와 같은 KST 날짜 키로 비교한다.
 */

const OVERTAKE_CHECKED_KEY = "focuson.ranking.overtakeCheckedOn";
const MEDAL_SHOWN_KEY = "focuson.ranking.medalShownOn";

/**
 * 랭킹 팝업을 띄울 수 있는 실행
 *
 * 공지·인터뷰·복구 창 중 하나라도 떴으면 쉰다.
 */
export function rankingPopupAllowed(input: {
  noticeShown: boolean;
  recoveryShown: boolean;
}): boolean {
  return !input.noticeShown && !input.recoveryShown;
}

export interface RankingPopupDays {
  /** 추월을 마지막으로 확인한 KST 날짜. */
  overtakeCheckedOn: string | null;
  /** 메달 모달을 마지막으로 띄운 KST 날짜. */
  medalShownOn: string | null;
}

export type AfterUnseen =
  | { kind: "medal"; dayKey: string }
  | { kind: "overtake"; dayKey: string; since: string | null }
  | { kind: "rest" };

/**
 * 안 본 메달 응답 뒤의 다음 단계
 *
 * 안 본 메달이 있으면 메달 모달이다.
 * 없으면 그날 첫 확인일 때만 추월을 묻고, 메달 모달을 띄운 날에는 묻지 않는다.
 * 서버는 `since`를 받을 때마다 이번 주를 다시 세므로 하루 한 번만 묻는다.
 * 날짜 기록을 읽지 못하면 하루 한 번을 지킬 수 없어 쉰다.
 * `since`가 없어도 그날 확인한 것으로 적어야 해서 추월 단계로 넘기고, 호출부는 적기만 하고 묻지 않는다.
 * 가려진 시각 기록이 깨져 날짜로 바꿀 수 없으면 ISO 문자열로 바꾸다 throw하므로 없는 것과 같이 다룬다.
 */
export function afterUnseen(input: {
  unseenCount: number;
  nowMs: number;
  lastHiddenAtMs: number | null;
  days: RankingPopupDays | null;
}): AfterUnseen {
  const dayKey = todayKstDateKey(new Date(input.nowMs));
  if (input.unseenCount > 0) {
    return { kind: "medal", dayKey };
  }
  if (input.days === null) {
    return { kind: "rest" };
  }
  if (input.days.overtakeCheckedOn === dayKey || input.days.medalShownOn === dayKey) {
    return { kind: "rest" };
  }
  const hiddenAt = input.lastHiddenAtMs === null ? null : new Date(input.lastHiddenAtMs);
  const since =
    hiddenAt !== null && Number.isFinite(hiddenAt.getTime()) ? hiddenAt.toISOString() : null;
  return { kind: "overtake", dayKey, since };
}

/**
 * 띄울 만한 추월
 *
 * 서버는 순위가 내려가지 않았으면 null을 준다.
 * 그래도 인원이 없거나 순위가 내려가지 않은 값이 오면 `0명이 추월했어요` 같은 시트가 뜨지 않게 막는다.
 */
export function overtakeToShow(overtaken: RankingOvertaken | null): RankingOvertaken | null {
  if (overtaken === null || overtaken.count < 1 || overtaken.toRank <= overtaken.fromRank) {
    return null;
  }
  return overtaken;
}

/**
 * 날짜 기록 읽기
 *
 * 읽지 못하면 null이고, 그날 추월 확인을 쉬는 쪽으로 떨어진다.
 */
export function loadRankingPopupDays(): RankingPopupDays | null {
  try {
    return {
      overtakeCheckedOn: localStorage.getItem(OVERTAKE_CHECKED_KEY),
      medalShownOn: localStorage.getItem(MEDAL_SHOWN_KEY),
    };
  } catch (error) {
    console.warn("[ranking] 홈 팝업 날짜 기록을 읽지 못해 추월 확인을 쉰다", error);
    return null;
  }
}

export function markOvertakeChecked(dayKey: string): void {
  writeDay(OVERTAKE_CHECKED_KEY, dayKey);
}

export function markMedalShown(dayKey: string): void {
  writeDay(MEDAL_SHOWN_KEY, dayKey);
}

/**
 * 날짜 기록 쓰기
 *
 * 날짜는 앱을 다시 켜도 남아야 해서 localStorage에 둔다.
 */
function writeDay(key: string, dayKey: string): void {
  try {
    localStorage.setItem(key, dayKey);
  } catch (error) {
    console.warn("[ranking] 홈 팝업 날짜를 저장하지 못했다", error);
  }
}
