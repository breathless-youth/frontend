import type {
  StudySessionEventCounts,
  StudySessionListResponse,
  StudySessionSummary,
} from "@focusmakers/types";

/**
 * 사용자에게 **보여줄** 통계로 좁힌다 — 순공 1분 미만 세션을 제외하고 합산을 다시 계산한다.
 *
 * ## 왜 필요한가
 *
 * 2026-07-27 확정(ai-wiki `product/mvp-scope.md` "기록 저장·표시 기준"):
 *
 * - 백엔드는 **모든 세션을 시간 무관 전부 저장**한다 — 제출을 건너뛰는 일은 없다.
 * - 화면에는 **순공 1분 이상** 세션만 표시한다.
 * - 홈·기록의 순공시간·집중률·스트릭 **합산에서도 제외**한다.
 *
 * ## 왜 목록만 걸러서는 안 되는가
 *
 * 서버가 내려주는 `sessionCount`·`totalFocusSec` 등은 **모든** 세션을 포함한 값이다. 목록만
 * 걸러내면 `공부 횟수 3회`라고 써 놓고 항목이 2개만 보이는, 눈에 보이는 모순이 생긴다.
 * 그래서 살아남은 세션에서 **파생 가능한 값은 전부 다시 계산한다** — 목록과 합산이 같은
 * 출처(필터된 세션 배열)를 갖게 되어 구조적으로 어긋날 수 없다.
 *
 * ## 다시 계산하지 않는 값 두 개
 *
 * - `studiedDatesInMonth` — 한 달 전체에 대한 값이라 이 응답(하루치 세션)에서 파생할 수 없다.
 * - **스트릭** — 별도 엔드포인트(`/api/stats/streak`)이고 전체 이력이 필요하다.
 *
 * 둘은 서버 값을 그대로 쓴다. 그래서 **1분 미만 세션만 있는 날이 달력에 공부한 날로 찍히거나
 * 스트릭에 포함될 수 있다.** 이건 여기서 고칠 수 없고, 서버가 같은 규칙을 반영해야 사라진다
 * (mvp-scope의 **BE 계약 합의 ③** — "통계 집계 시 순공 1분 미만 세션은 합산에서 제외").
 *
 * ## 서버가 합의 ③을 반영하면
 *
 * 이 함수는 **자동으로 무해해진다** — 걸러낼 세션이 애초에 안 오므로 필터는 전부 통과하고
 * 재계산 결과는 서버 값과 같아진다. 그때 지워도 되고 방어선으로 남겨도 된다.
 *
 * ⚠️ `homeSummary.ts`의 "서버 계산 값을 그대로 쓴다(로컬 보정 금지)"와 상충해 보이지만, 저쪽이
 * 막으려던 것은 **임의 보정**이다. 이건 확정된 표시 정책이고, 적용하지 않으면 화면이 정책을
 * 위반한다.
 */

/** 표시 최소 순공시간(초). 이 값 미만 세션은 사용자에게 보이지 않는다. */
export const MIN_DISPLAYED_FOCUS_SEC = 60;

/** 화면에 남을 세션인가 — 판정 기준은 **순공시간**이다(총 공부 시간이 아니다). */
export function isDisplayedSession(session: StudySessionSummary): boolean {
  return session.focusSec >= MIN_DISPLAYED_FOCUS_SEC;
}

const ZERO_EVENT_COUNTS: StudySessionEventCounts = { PHONE: 0, DEVICE: 0, AWAY: 0, PAUSE: 0 };

function sumEventCounts(sessions: readonly StudySessionSummary[]): StudySessionEventCounts {
  return sessions.reduce<StudySessionEventCounts>(
    (total, session) => ({
      PHONE: total.PHONE + session.eventCounts.PHONE,
      DEVICE: total.DEVICE + session.eventCounts.DEVICE,
      AWAY: total.AWAY + session.eventCounts.AWAY,
      PAUSE: total.PAUSE + session.eventCounts.PAUSE,
    }),
    ZERO_EVENT_COUNTS,
  );
}

/**
 * 집중률(%) — 서버 계약과 같은 **소수 1자리**로 맞춘다. 화면은 여기서 다시 정수로 반올림하지만
 * (`formatFocusRate`), 값 자체가 계약과 다른 정밀도로 돌아다니면 서버 값과 비교할 때 헷갈린다.
 *
 * 총 공부 시간이 0이면 0을 준다 — 0으로 나눠 `NaN`/`Infinity`가 화면까지 새어나가지 않게 한다.
 */
function focusRateOf(totalFocusSec: number, totalStudySec: number): number {
  if (totalStudySec <= 0) {
    return 0;
  }
  return Math.round((totalFocusSec / totalStudySec) * 1000) / 10;
}

export function toDisplayedStats(stats: StudySessionListResponse): StudySessionListResponse {
  const sessions = stats.sessions.filter(isDisplayedSession);

  // 전부 살아남았으면 새 객체를 만들지 않는다 — react-query 캐시 참조가 유지되어야
  // 화면의 `useMemo`(records.tsx의 정렬)가 실제로 메모로 동작한다.
  if (sessions.length === stats.sessions.length) {
    return stats;
  }

  const totalStudySec = sessions.reduce((sum, session) => sum + session.studySec, 0);
  const totalFocusSec = sessions.reduce((sum, session) => sum + session.focusSec, 0);

  return {
    ...stats,
    sessions,
    sessionCount: sessions.length,
    totalStudySec,
    totalFocusSec,
    // 빈 배열에 `Math.max()`를 쓰면 `-Infinity`가 된다.
    longestFocusSec: sessions.reduce((longest, session) => Math.max(longest, session.focusSec), 0),
    focusRate: focusRateOf(totalFocusSec, totalStudySec),
    totalEventCounts: sumEventCounts(sessions),
    // `studiedDatesInMonth`는 위 주석대로 서버 값을 그대로 둔다(스프레드로 승계).
  };
}
