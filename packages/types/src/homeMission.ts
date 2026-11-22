export type HomeMissionStep = 1 | 2 | 3;

/** GET/POST /api/home/mission 계열의 직접 JSON 응답이며 백엔드 Swagger 스키마 `HomeMissionResponse` 기준이다. */
export interface HomeMissionResponse {
  version: string;
  startsOn: string;
  completedSteps: 0 | HomeMissionStep;
  currentStep: HomeMissionStep | null;
  eligible: boolean;
  /** startsOn 이후 단일 현지 날짜의 측정 순공 합계 중 최댓값. 오늘 합계나 여러 날짜 누적이 아니다. */
  measuredFocusSec: number;
  /** 이번 요청으로 받은 미션 포인트. 조회이거나 받은 것이 없으면 0이고, 미션 포인트가 생기기 전의 서버는 주지 않는다. */
  rewardedPoints?: number;
  /** 완료했지만 아직 안 받은 미션 포인트. 0보다 크면 rewards/claim으로 받는다. 비회원은 늘 0이다. */
  claimablePoints?: number;
  /** 단계별 미션 포인트이며 첫 값이 1단계(과목 만들기), 둘째 값이 2단계(공부 5분)이며 첫 소품 구매가 켜지면 셋째 값이 3단계다. 이 필드가 생기기 전의 서버는 주지 않는다. */
  stepPoints?: number[];
}

/** POST /api/home/mission/rewards/claim의 응답이며 백엔드 Swagger 스키마 `ClaimResponse` 기준이다. 받을 것이 없으면 granted가 false다. */
export interface HomeMissionRewardClaimResponse {
  granted: boolean;
  points: number;
  balance: number;
}
