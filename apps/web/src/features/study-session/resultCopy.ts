/**
 * S4(공부 결과) 확정 문구 — `ai-wiki/product/voice-tone.md`·`project/glossary.md`에서 **그대로**
 * 인용한다(의역 금지). 문구를 컴포넌트에 흩뿌리지 않고 여기 한 곳에 모은다.
 *
 * ## BY-560(2026-09-13~14) 시안 문구
 *
 * 완료 히어로·CTA·타임라인 최고 집중·요약 카드 문구는 BY-557 시안(프로토타입·스크린샷)에서 왔다.
 * voice-tone.md에 아직 없는 문구는 시안 그대로 쓰고, wiki 반영은 BY-557 확정 후로 미룬다.
 *
 * ## ⚠️ `화면 꺼짐`은 이 파일에 없다 — 없는 게 맞다
 *
 * 2026-07-26 6차 인터뷰에서 화면 꺼짐·백그라운드는 별도 비집중 유형이 아니라 **일시정지에
 * 합산**되는 것으로 확정됐고, 사용자 노출 표기도 `일시정지` 하나로 통합됐다(`glossary.md`).
 * 그래서 이 라벨은 코드 어디에도 두지 않는다.
 */
export const RESULT_COPY = {
  /**
   * 완료 히어로 타이틀·설명(BY-560). 출처는 BY-557 시안 프로토타입이다 — voice-tone.md에는 아직
   * 없는 문구라 시안 문구를 그대로 쓴다(wiki 반영은 BY-557 확정 후).
   *
   * 예전 타이틀 `공부 결과`(voice-tone §4)와 우상단 닫기(`64:553`)는 시안에서 빠졌다 —
   * 이탈은 하단 CTA 둘로만 한다.
   */
  completeTitle: "오늘 공부 완료!",
  completeDescription: "끝까지 해낸 시간이 그대로 기록됐어요",
  /**
   * 히어로 지표 라벨(glossary 노출 표기). 시안은 `순공 시간`(띄어쓰기)이지만 glossary가 SSOT라
   * 붙여 쓴다 — 용어 교체는 BY-574 범위다.
   */
  focusLabel: "순공시간",
  /**
   * 총 공부 시간 접두어. 2026-09-14 사용자 결정으로 `총 공부` → `총 공부시간`(이 화면 한정 — S3-8 요약
   * 카드 `AUTO_END_COPY.summaryLabels.studySec`는 아직 `총 공부`).
   */
  totalPrefix: "총 공부시간",
  /** 타임라인 카드 타이틀(Figma `64:562` — voice-tone에 별도 규정 없음). */
  timelineTitle: "공부 타임라인",
  /**
   * 타임라인의 최고 집중 구간 라벨(BY-560 시안 스크린샷 "최고 집중 시간 37분"). 바 위 배지와
   * 바 아래 행이 같은 라벨을 쓴다. 홈(S1)의 `longestFocusSec` 타일과 같은 개념이다.
   */
  longestFocusLabel: "최고 집중 시간",
  /**
   * 요약 카드 두 행(BY-560 시안 스크린샷) — 옛 비집중 통계 카드를 대체한다.
   * `오늘 누적 순공시간`은 오늘(KST) 순공 합계, `누적 공부 일 수`는 지금까지 공부한 날 수.
   */
  todayFocusLabel: "오늘 누적 순공시간",
  studyDaysLabel: "누적 공부 일 수",
  /** 요약 값을 아직 못 받았거나(조회 중) 못 받은(오류) 자리 — 숫자를 지어내지 않는다. */
  summaryUnavailable: "—",
  /**
   * 하단 CTA 둘(BY-560, BY-557 시안 프로토타입 문구). 예전 단일 `확인`(voice-tone §4)을 대체한다.
   * `홈으로`는 솔로면 앱 홈, 소셜이면 소셜 홈이고 `기록으로 가기`는 기록 탭(S5)이다.
   */
  ctaHome: "홈으로",
  ctaRecords: "기록으로 가기",
} as const;

/**
 * 집중률 필 문구 — **`N% 집중` 형식**이다.
 *
 * voice-tone §2는 지표 라벨(`집중률 N%`)과 필/헤더 표기(`N% 집중`)를 구분한다. 여기는 후자다.
 */
export function focusRateLabel(percent: number): string {
  return `${percent}% 집중`;
}

/** 누적 공부 일 수 표기 — `{N}일`(시안 스크린샷 "23일"). */
export function studyDaysLabel(days: number): string {
  return `${days}일`;
}

/**
 * 타임라인 범례 라벨. 셋 다 도트와 **함께** 쓴다(색 단독 전달 금지).
 *
 * `focus`는 glossary 노출 표기 `순공`을 따른다. `distract`는 glossary의 `휴식` 대신 시안 문구
 * `자동 멈춤`을 쓰는 이 화면 한정 예외다.
 */
export const LEGEND_COPY = {
  focus: "순공",
  distract: "자동 멈춤",
  pause: "일시정지",
} as const;
