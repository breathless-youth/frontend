import type {
  StatusEventPayload,
  StudySessionCreateRequest,
  StudySessionResponse,
} from "@focuson/types";

import { API_BASE_URL, parseErrorMessage } from "@/lib/api";

/**
 * 세션 제출 입력. 이 모듈은 값을 계산하지 않고 받기만 한다 —
 * studySec/focusSec/events는 `sessionTimeline.ts`(순수 로직)가 세션 상태 머신으로 계산해서 넘긴다.
 * 감지 신호는 아직 mock이라 실측 정확도는 실기기 스파이크 이후에 검증한다.
 */
export interface SessionInput {
  userId: number;
  startedAtMs: number;
  endedAtMs: number;
  studySec: number;
  focusSec: number;
  events?: StatusEventPayload[];
}

/**
 * 이벤트에 실린 PAUSE 구간의 합 — **ms 그대로** 돌려준다.
 *
 * ⚠️ **여기서 초로 반올림하지 않는다.** 상한 계산은 `(세션 길이 − PAUSE 합)`을 ms에서 끝낸 뒤
 * **마지막에 한 번만** 내림해야 한다. 세션 길이와 PAUSE를 따로 반올림하면
 * `floor(S) − ceil(P)`가 되어 계약값 `floor(S − P)`보다 최대 1초 작아진다 —
 * 그러면 방어선이어야 할 클램프가 정상 경로의 `studySec`을 상시 1초 깎고,
 * `focusSec ≤ studySec` 체인을 타고 순공시간까지 함께 깎인다.
 * 세션 시각·일시정지 경계가 전부 `Date.now()` 밀리초라 소수부가 0인 쪽이 오히려 드물다.
 * (qa-WG4 F1 실측 지적 — 회귀 테스트가 `__tests__/submitStudySession.test.ts`에 있다.)
 */
function pauseMsOf(events: StatusEventPayload[]): number {
  return events.reduce((sum, event) => {
    if (event.status !== "PAUSE") {
      return sum;
    }
    return sum + Math.max(0, Date.parse(event.endedAt) - Date.parse(event.startedAt));
  }, 0);
}

/**
 * 서버 검증 규칙 위반(400)을 예방하는 클램프 체인:
 * `0 ≤ focusSec ≤ studySec ≤ (endedAt − startedAt) − PAUSE 합`.
 *
 * ⚠️ **PAUSE를 빼는 것이 핵심이다.** 서버 규칙(`packages/types` 주석)은 총 공부 시간에서
 * 일시정지를 제외한 값을 상한으로 요구하는데, 예전 클램프는 벽시계 길이(`sessionSec`)까지만
 * 막았다. 현재 호출부(`computeSessionTotals`)가 이미 PAUSE를 제외한 값을 넘기고 있어 활성
 * 버그는 아니었지만, **계약 검증 로직이 계약과 어긋난 채 남으면 다음 호출부가 같은 함정을
 * 밟는다** — 그래서 방어선 자체를 계약에 맞춘다(SCR-S3-7·S3-8 Implementation Notes 5,
 * SCR-S4 "WG4 하드닝 항목").
 *
 * 회귀 관측 신호: 일시정지가 있었던 세션인데 S4 헤더의 `총 공부`가 `HH:MM – HH:MM` 벽시계
 * 범위와 같게 나오면 그건 S4 버그가 아니라 이 경로가 깨졌다는 신호다.
 */
export function buildSessionRequest(input: SessionInput): StudySessionCreateRequest {
  const events = input.events ?? [];
  // ms에서 빼고 **마지막에 한 번만** 내림한다 — 두 번 반올림하면 상한이 1초 엄격해진다.
  // 이 식은 호출부(`computeSessionTotals`)의 `floor((벽시계 − 일시정지)/1000)`과 정확히 같다.
  const sessionMs = Math.max(0, input.endedAtMs - input.startedAtMs);
  const studyCapSec = Math.floor(Math.max(0, sessionMs - pauseMsOf(events)) / 1000);
  const studySec = Math.min(Math.max(0, input.studySec), studyCapSec);
  const focusSec = Math.min(Math.max(0, input.focusSec), studySec);
  return {
    userId: input.userId,
    startedAt: new Date(input.startedAtMs).toISOString(),
    endedAt: new Date(input.endedAtMs).toISOString(),
    studySec,
    focusSec,
    events,
  };
}

/** 응답은 항상 배열 — KST 자정을 넘는 세션은 날짜별 2개로 분할되어 내려온다. */
export async function submitStudySession(input: SessionInput): Promise<StudySessionResponse[]> {
  const res = await fetch(`${API_BASE_URL}/api/study-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildSessionRequest(input)),
  });
  if (!res.ok) {
    throw await parseErrorMessage(res, "세션 제출 실패");
  }
  return (await res.json()) as StudySessionResponse[];
}
