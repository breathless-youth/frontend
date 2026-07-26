import type { StudyEventStatus } from "@focuson/types";

/**
 * S4(공부 결과) 확정 문구 — `ai-wiki/product/voice-tone.md`·`project/glossary.md`에서 **그대로**
 * 인용한다(의역 금지). 문구를 컴포넌트에 흩뿌리지 않고 여기 한 곳에 모은다.
 *
 * ## ⚠️ `화면 꺼짐`은 이 파일에 없다 — 없는 게 맞다
 *
 * Figma 원본(`64:645`)에는 아직 `화면 꺼짐` 행이 남아 있지만 이는 **알려진 반영 지연**이다
 * (`design.md` 백로그 7번①). 2026-07-26 6차 인터뷰에서 화면 꺼짐·백그라운드는 별도 비집중
 * 유형이 아니라 **일시정지에 합산**되는 것으로 확정됐고, 사용자 노출 표기도 `일시정지` 하나로
 * 통합됐다(`glossary.md`). 그래서 이 라벨은 코드 어디에도 두지 않는다.
 */
export const RESULT_COPY = {
  /** 화면 타이틀(voice-tone §4 "공부 결과"). */
  title: "공부 결과",
  /**
   * 우상단 닫기 버튼의 접근성 이름. Figma에는 아이콘만 있고(`64:553`) 텍스트가 없다 —
   * voice-tone.md에도 규정이 없어 일반 표기를 쓴다(리뷰 항목).
   */
  close: "닫기",
  /** 헤더 지표 라벨(glossary 노출 표기). */
  focusLabel: "순공시간",
  /** 총 공부 시간 접두어 — S3-8 요약 카드(`AUTO_END_COPY.summaryLabels.studySec`)와 같은 표기다. */
  totalPrefix: "총 공부",
  /** 타임라인 카드 타이틀(Figma `64:562` — voice-tone에 별도 규정 없음). */
  timelineTitle: "공부 타임라인",
  /** 통계 카드 타이틀 접두어 — 뒤에 **비집중 3종 합계**만 붙는다(PAUSE 제외). */
  distractionTitlePrefix: "비집중",
  /** 비집중 3종이 모두 0일 때(voice-tone §4 — 느낌표 없음). */
  noDistraction: "비집중 없이 이어간 공부예요",
  /** CTA(voice-tone §4). */
  cta: "확인",
} as const;

/**
 * 집중률 필 문구 — **`N% 집중` 형식**이다.
 *
 * voice-tone §2는 지표 라벨(`집중률 N%`)과 필/헤더 표기(`N% 집중`)를 구분한다. 여기는 후자다.
 */
export function focusRateLabel(percent: number): string {
  return `${percent}% 집중`;
}

/** 통계 행 값 — `{N}회 · {시간 길이}`(design.md 6차 / voice-tone §4). */
export function eventCountLabel(count: number, durationLabel: string): string {
  return `${count}회 · ${durationLabel}`;
}

/**
 * 상태 → 사용자 노출 라벨(`glossary.md` 노출 표기).
 *
 * ⚠️ **통계 행에는 축약형(`휴대폰 N회`)을 쓰지 않는다** — 축약은 S5 기록 리스트 뱃지 전용이다
 * (glossary "비집중 뱃지 축약").
 */
export const EVENT_STATUS_LABEL: Record<StudyEventStatus, string> = {
  AWAY: "자리 이탈",
  PHONE: "휴대폰 사용",
  DEVICE: "기기 조작",
  PAUSE: "일시정지",
};

/** 타임라인 범례 라벨. 셋 다 도트와 **함께** 쓴다(색 단독 전달 금지). */
export const LEGEND_COPY = {
  focus: "집중",
  distract: "비집중",
  pause: EVENT_STATUS_LABEL.PAUSE,
} as const;
