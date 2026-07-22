/**
 * 순간적인 Vision AI 판정 상태(온디바이스). 세션 전체 생명주기를 나타내는
 * `@focuson/types`의 `SessionStatus`("active"|"paused"|"ended")와는 다른 축이다.
 */
export type StudyStatus = "STUDYING" | "AWAY" | "PAUSED" | "CAMERA_OFF";

/**
 * 클라이언트 내부에서 시간 계산에 쓰는 순수 타임라인 이벤트(상태 + 시각).
 * 서버로 전송되는 이벤트 레코드는 `@focuson/types`의 `FocusEvent`를 사용한다(용도가 다름).
 */
export interface FocusTimelineEvent {
  status: StudyStatus;
  /** 이벤트 발생 시각(epoch ms 또는 단조 증가 ms). */
  timestampMs: number;
}

export interface StudySessionSummary {
  /** 총 공부시간(초). 공부 중 + 자리 비움 구간. 일시정지·카메라 꺼짐 제외. */
  totalStudySeconds: number;
  /** 순공시간(초). 공부 중(STUDYING) 구간만. */
  pureStudySeconds: number;
  /** 집중률 = 순공시간/총공부시간. 총공부시간 0이면 0. 범위 0~1. */
  focusRate: number;
}
