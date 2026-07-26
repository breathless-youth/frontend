/**
 * 세션 튜닝 파라미터 — 정책 상수를 하드코딩 대신 모아 두는 자리.
 */

export interface SessionTuningConfig {
  /**
   * 일시정지가 N분 유지되면 세션을 자동 종료하고 그때까지의 기록을 저장한다(S3-8).
   * 수동 일시정지와 화면 꺼짐·백그라운드가 **같은 규칙·같은 감시 로직**을 공유한다 —
   * 트리거별로 타이머를 2개 만들지 않는다.
   *
   * **확정값: 20분**(2026-07-26 리더 확정). `null` = 감시 비활성.
   */
  readonly autoEndPauseMinutes: number | null;
}

export const DEFAULT_SESSION_TUNING: SessionTuningConfig = {
  autoEndPauseMinutes: 20,
};

/**
 * 감시 임계값(ms) — `usePauseAutoEnd`가 보는 **유일한** 값. `null`이면 감시하지 않는다.
 *
 * SCR-S3-7·S3-8 Interaction Contract가 `autoEndAfterPauseMs`라는 이름으로 요구한 값이다.
 * 설정 필드는 사람이 읽는 단위(분)로 두고 여기서 한 번만 ms로 환산한다 — 두 단위가 코드
 * 여기저기에 섞이면 60배 실수가 난다.
 */
export function autoEndAfterPauseMs(config: SessionTuningConfig): number | null {
  const minutes = config.autoEndPauseMinutes;
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  return minutes * 60_000;
}
