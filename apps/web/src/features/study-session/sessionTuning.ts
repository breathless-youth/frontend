/**
 * 세션 튜닝 파라미터 — **값이 아직 확정되지 않은** 정책 상수를 하드코딩 대신 모아 두는 자리.
 *
 * `ai-wiki/product/mvp-scope.md` 미확정 항목: "AI 에이전트는 이 값들을 임의로 확정하지 말고,
 * 구현 시 팀에 확인하거나 **설정 가능한 파라미터로 열어둘 것**."
 */

export interface SessionTuningConfig {
  /**
   * 일시정지가 N분 유지되면 세션을 자동 종료하고 그때까지의 기록을 저장한다(S3-8).
   * 수동 일시정지와 화면 꺼짐·백그라운드가 **같은 규칙·같은 감시 로직**을 공유한다 —
   * 트리거별로 타이머를 2개 만들지 않는다.
   *
   * ⚠️ **N값 미정.** `mvp-scope.md` 미확정 항목("일시정지 자동 종료 대기 시간 N분")이며
   * ai-wiki 어디에도 숫자가 없다. `null` = 감시 비활성(임의의 기본값을 지어내지 않는다).
   * TODO(WG4/리더 확정): 값이 정해지면 여기만 채운다.
   *
   * 실제 감시 타이머는 **WG4(S3-7/S3-8 종료 플로우) 범위**다 — WG2는 이 파라미터 자리만 연다.
   */
  readonly autoEndPauseMinutes: number | null;
}

export const DEFAULT_SESSION_TUNING: SessionTuningConfig = {
  autoEndPauseMinutes: null,
};
