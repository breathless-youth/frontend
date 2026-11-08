/** BE dev 17ae022c, GET/POST /api/home/mission 계열의 직접 JSON 응답. */
export interface HomeMissionResponse {
  version: string;
  startsOn: string;
  completedSteps: 0 | 1 | 2;
  currentStep: 1 | 2 | null;
  eligible: boolean;
  /** startsOn 이후 단일 현지 날짜의 측정 순공 합계 중 최댓값. 오늘 합계나 여러 날짜 누적이 아니다. */
  measuredFocusSec: number;
}
