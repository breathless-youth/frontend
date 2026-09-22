import type { StatusEventPayload, SubjectTimePayload } from "@focusmakers/types";

/**
 * 이벤트에 실린 PAUSE 구간의 합을 ms 그대로 돌려준다.
 *
 * 초로 반올림하지 않는다 — 상한 계산은 (세션 길이 − PAUSE 합)을 ms에서 끝낸 뒤 마지막에
 * 한 번만 내림해야 계약값 `floor(S − P)`와 맞는다. 세션 길이와 PAUSE를 따로 반올림하면
 * `floor(S) − ceil(P)`가 되어 상한이 최대 1초 엄격해지고, 정상 경로의 studySec을 상시 깎는다.
 */
export function pauseMsOf(events: StatusEventPayload[]): number {
  return events.reduce((sum, event) => {
    if (event.status !== "PAUSE") {
      return sum;
    }
    return sum + Math.max(0, Date.parse(event.endedAt) - Date.parse(event.startedAt));
  }, 0);
}

/**
 * 서버 검증 규칙을 미리 적용하는 클램프. 최종 제출과 진행 스냅샷이 함께 쓴다 —
 * 제출은 boundaryMs로 endedAt을, 스냅샷은 reportedAt을 넘긴다.
 * `0 ≤ focusSec ≤ studySec ≤ (boundaryMs − startedAtMs) − PAUSE 합`.
 */
export function clampSessionSeconds(params: {
  startedAtMs: number;
  boundaryMs: number;
  studySec: number;
  focusSec: number;
  events: StatusEventPayload[];
}): { studySec: number; focusSec: number } {
  const sessionMs = Math.max(0, params.boundaryMs - params.startedAtMs);
  const studyCapSec = Math.floor(Math.max(0, sessionMs - pauseMsOf(params.events)) / 1000);
  const studySec = Math.min(Math.max(0, params.studySec), studyCapSec);
  const focusSec = Math.min(Math.max(0, params.focusSec), studySec);
  return { studySec, focusSec };
}

/**
 * 항목별 시간의 서버 규칙을 미리 적용한다 — `항목 studySec 합 ≤ 세션 studySec`,
 * `항목 focusSec ≤ 항목 studySec`. 세션 studySec이 위 클램프로 깎였을 때 항목 합이 그보다
 * 커지는 경우를 막는다. 앞 항목부터 채우고 넘치는 몫은 뒤 항목에서 잘라낸다.
 */
export function clampSubjectTimes(
  items: readonly SubjectTimePayload[],
  studySec: number,
): SubjectTimePayload[] {
  let remaining = Math.max(0, studySec);
  return items.map((item) => {
    const itemStudy = Math.min(Math.max(0, item.studySec), remaining);
    remaining -= itemStudy;
    return {
      ...item,
      studySec: itemStudy,
      focusSec: Math.min(Math.max(0, item.focusSec), itemStudy),
    };
  });
}
