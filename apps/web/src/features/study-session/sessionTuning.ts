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

/**
 * 감시 임계값(ms) — `usePauseAutoEnd`가 보는 **유일한** 값. `null`이면 감시하지 않는다.
 *
 * SCR-S3-7·S3-8 Interaction Contract가 `autoEndAfterPauseMs`라는 이름으로 요구한 값이다.
 * 설정 필드는 사람이 읽는 단위(분)로 두고 여기서 한 번만 ms로 환산한다 — 두 단위가 코드
 * 여기저기에 섞이면 60배 실수가 난다.
 *
 * ⚠️ **프로덕션 기본값은 여전히 `null`(감시 비활성)이다.** 임계값 N분의 실제 값이
 * `mvp-scope.md`·`policies.md`·`design.md` 어디에도 없어(전부 "튜닝 파라미터"로만 표기)
 * 임의의 숫자를 확정값처럼 넣지 않는다. **값이 정해지면 `DEFAULT_SESSION_TUNING`의
 * `autoEndPauseMinutes` 한 줄만 채우면 감시와 S3-8이 그대로 켜진다** — 나머지 코드는 준비돼 있다.
 * 테스트는 짧은 값을 주입해서 동작을 고정한다.
 */
export function autoEndAfterPauseMs(config: SessionTuningConfig): number | null {
  const minutes = config.autoEndPauseMinutes;
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  return minutes * 60_000;
}
