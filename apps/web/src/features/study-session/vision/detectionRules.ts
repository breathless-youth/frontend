import { SCORE_THRESHOLDS } from "./visionConfig";

/**
 * 검출 → 감지 신호(boolean) 판정 — **순수 함수만** 있다(설계 §4).
 *
 * 모델은 "cell phone이 이 위치에 이 점수로 있다"까지만 알려준다. **"사용 중"인지는 알려주지
 * 않는다.** 그 변환 규칙이 이 모듈이고, 여기서 나온 boolean 뒤의 **유지시간 디바운스(1.5초/0.5초)와
 * 상태 전이는 기존 `../detection.ts`·상태기계가 그대로 담당**한다. 이 모듈은 그 앞단에서 멈춘다.
 *
 * MediaPipe에 의존하지 않는다 — `objectDetector.ts`가 자체 타입으로 정규화한 값만 받는다.
 * 그래서 이 모듈의 테스트는 모델도 wasm도 없이 픽스처 배열만으로 돈다.
 */

/**
 * 검출 박스. **화면·로그 어디에도 나가지 않는다** — `frontend/CLAUDE.md`의 개인정보 원칙이
 * 랜드마크 좌표의 로그 기록을 금지하고, 설계 §8이 bbox도 같은 성격으로 못박았다.
 * 여기 남겨 두는 이유는 오직 하나, 후속 폰 사용 규칙(박스 크기·프레임 간 이동량)이
 * 이 값으로 구현되기 때문이다.
 */
export interface DetectionBox {
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
}

/** 정규화된 검출 하나. MediaPipe의 `Detection`(categories 배열)과 다른 우리 타입이다. */
export interface Detection {
  readonly label: string;
  readonly score: number;
  readonly box: DetectionBox;
}

export interface FrameSize {
  readonly width: number;
  readonly height: number;
}

/**
 * 규칙이 판정에 쓰는 한 프레임분 입력(설계 §4 스케치 그대로).
 *
 * `previous`와 `frameSize`는 **지금 규칙이 쓰지 않는다.** 그래도 인터페이스에 넣는 이유는
 * 설계 §4가 정리한 후속 규칙 후보가 **전부 이 둘로 구현되기 때문**이다 —
 * 박스 크기 임계는 `frameSize` 대비 면적을, 프레임 간 이동량은 `previous`를 쓴다.
 * 나중에 넣으면 규칙 시그니처가 바뀌고, 그러면 호출부(프레임 루프·훅)까지 함께 고쳐야 한다.
 */
export interface DetectionFrame {
  readonly detections: readonly Detection[];
  readonly previous: readonly Detection[] | null;
  readonly frameSize: FrameSize;
  readonly atMs: number;
}

/** COCO 라벨. `visionConfig`의 `CATEGORY_ALLOWLIST`와 같은 문자열이어야 한다. */
export const PERSON_LABEL = "person";
export const PHONE_LABEL = "cell phone";

/** 해당 라벨의 최고 score. 없으면 0 — "검출되지 않음"과 "0점으로 검출됨"을 같게 다룬다. */
export function maxScoreFor(detections: readonly Detection[], label: string): number {
  let best = 0;
  for (const detection of detections) {
    if (detection.label === label && detection.score > best) {
      best = detection.score;
    }
  }
  return best;
}

/**
 * 라벨 → 최고 score 맵. **진단 로그(§8)가 남겨도 되는 유일한 검출 정보**라 여기서 만든다.
 * 반환값에 좌표가 섞이지 않는 것이 이 함수의 계약이다.
 */
export function topScoresByLabel(detections: readonly Detection[]): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const detection of detections) {
    const current = scores[detection.label];
    if (current === undefined || detection.score > current) {
      scores[detection.label] = detection.score;
    }
  }
  return scores;
}

/** 자리 이탈 판정에 쓰는 "사람 있음" 규칙. 교체 가능하도록 타입을 노출한다. */
export type PersonPresenceRule = (frame: DetectionFrame) => boolean;

/**
 * 자리 이탈(`away`) — **관대한 쪽으로 기운다.**
 *
 * `person`이 **하나라도** 낮은 임계(`SCORE_THRESHOLDS.person`) 이상으로 검출되면 "사람 있음"이다.
 *
 * 관대하게 두는 이유는 오탐의 **방향** 때문이다. 책을 보려고 고개를 숙이거나 거치 각도 때문에
 * `person`을 놓치면 **공부 중인데 순공에서 빠진다.** mvp-scope의 "측정할 수 없는 시간은 집중으로
 * 인정하지 않는다"는 **부풀리지 말라**는 뜻이지 깎으라는 뜻이 아니다 — 자리 이탈 오탐은 원칙을
 * 지나치게 적용해 사용자가 실제로 한 공부를 지우는 결과가 된다(설계 §4).
 *
 * 1.5초 확정 유지시간(`../detection.ts`의 `AWAY.enterMs`)이 순간적 미검출을 이미 걸러주므로,
 * 낮은 임계와 합쳐지면 실용적인 안정성이 나온다.
 *
 * **알려진 한계.** 이 규칙 때문에 다중 인물 동작이 자동으로 정해진다 — 도서관에서 옆 사람이
 * 보이면 "사람 있음"이라 자리 이탈이 아니다. 반대로 **본인이 자리를 떠도 옆 사람 때문에 안 잡히는
 * 오차**가 남고, 이쪽은 순공을 부풀리는 방향이라 대원칙에 어긋난다. 임계 조정으로는 풀리지
 * 않으므로 `vision` 레포의 다중 인물 과제로 넘긴다(설계 §4·§12).
 */
export const personPresenceRule: PersonPresenceRule = (frame) =>
  maxScoreFor(frame.detections, PERSON_LABEL) >= SCORE_THRESHOLDS.person;

/**
 * 폰 사용 판정 규칙 — **교체 지점**(설계 §4).
 *
 * 인터페이스를 하나 세워 두는 이유는 V1.0 규칙이 알려진 한계를 안고 들어가기 때문이다.
 * 이 인터페이스를 구현한 다른 객체로 갈아끼울 때 **상태기계·타이머·이벤트 변환은 한 줄도
 * 바뀌지 않는다.**
 */
export interface PhoneUsageRule {
  evaluate(frame: DetectionFrame): boolean;
}

/**
 * V1.0 — **검출되면 곧바로 사용 중으로 본다** (2026-07-27 리더 결정).
 *
 * ⚠️ **알려진 한계.** 대부분의 사용자는 공부 중 폰을 책상에 올려두며, 그 폰이 전면 카메라
 * 시야에 들어오면 **계속 검출되어 순공시간이 0에 수렴한다.** 이건 voice-tone의 추정형
 * 문구("~것 같아요")가 흡수하도록 설계된 수준의 오탐이 아니다. 리더는 이 한계를 인지한 상태에서
 * V1.0 범위를 단순하게 유지하기로 했고, 정교화는 후속으로 반영한다(설계 §4).
 *
 * 그래서 규칙을 함수 하나로 흘려두지 않고 `PhoneUsageRule` 뒤로 격리했다. 후속 후보는 전부
 * `DetectionFrame`의 `previous`·`frameSize`로 구현된다 —
 * 박스 크기 임계(가까이 들면 커진다) · 프레임 간 이동량(놓인 폰은 안 움직인다) ·
 * 사람 박스 상단과의 겹침 · 세션 초 N초 기준선 학습. 크기와 이동량은 서로의 약점을 메우는
 * 조합이라 함께 쓰는 것이 유력하다(설계 §4 표).
 *
 * 검출기 임계(`DETECTOR_SCORE_THRESHOLD`)는 person·phone 중 **낮은 쪽**이라 배열에는 phone의
 * 임계 미만 검출도 섞여 온다. 그래서 여기서 라벨별 임계로 한 번 더 거른다.
 */
export const detectedAsUsedRule: PhoneUsageRule = {
  evaluate: (frame) => maxScoreFor(frame.detections, PHONE_LABEL) >= SCORE_THRESHOLDS.phone,
};

/** 한 프레임에서 나온 **원신호**. 유지시간 판정은 하지 않는다 — `../detection.ts`의 몫이다. */
export interface FrameSignals {
  readonly personPresent: boolean;
  readonly phoneInUse: boolean;
}

/**
 * 한 프레임을 두 규칙에 통과시킨다.
 *
 * `AWAY`는 여기서 만들지 않는다 — 배선 계층이 `!personPresent`로 뒤집어
 * `TriggerSignals`(`../detection.ts`)에 넣는다. "사람이 있다"와 "자리를 비웠다"를 이 모듈에서
 * 미리 합치면, 나중에 사람 유무를 다른 목적(예: 프리뷰 안내 문구)으로 쓸 때 되돌려야 한다.
 */
export function evaluateFrame(
  frame: DetectionFrame,
  phoneRule: PhoneUsageRule = detectedAsUsedRule,
  presenceRule: PersonPresenceRule = personPresenceRule,
): FrameSignals {
  return {
    personPresent: presenceRule(frame),
    phoneInUse: phoneRule.evaluate(frame),
  };
}
