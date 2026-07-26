import { useEffect, useRef } from "react";

import type { SystemPauseSource } from "./adapters/systemPauseSource";
import type { PauseTrigger } from "./sessionState";
import type { SessionTuningConfig } from "./sessionTuning";
import { autoEndAfterPauseMs } from "./sessionTuning";

/**
 * 일시정지 자동 종료 감시자 — **단 하나**(S3-8, SCR-S3-7·S3-8 Interaction Contract).
 *
 * ## 왜 하나인가
 *
 * `mvp-scope.md`·`policies.md`·6차 인터뷰 노트가 모두 "수동 일시정지·화면 꺼짐 **동일 규칙**,
 * N값 **공용** 튜닝 파라미터"로 확정했다. 일시정지는 트리거가 둘이어도 **상태는 하나**이므로
 * (WG2가 이미 하나의 프레젠테이션으로 구현) 감시도 그 하나의 상태 위에서 한 번만 돈다.
 * 트리거별 타이머를 두 개 만들면 두 경로가 겹치는 흔한 조합("수동 일시정지 중 화면 꺼짐")에서
 * 어느 쪽이 먼저 터지는지가 값에 따라 달라진다.
 *
 * **`PauseTrigger`는 임계값 판정에 쓰지 않는다** — `onAutoEnd`로 그대로 되돌려 주는 것이 전부이고,
 * 받는 쪽은 S3-8 본문 문구를 고르는 데만 쓴다.
 *
 * ## 왜 setTimeout 하나로는 안 되는가
 *
 * 화면 꺼짐·백그라운드에서 WebView/브라우저는 타이머를 스로틀링하거나 아예 멈춘다 —
 * 정해진 시각에 콜백이 오지 않는다. 그래서 이 훅은 **누적하지 않고**, 매번
 * `now() - paused.sinceMs`(일시정지 시작 **벽시계** 시각과의 차)를 임계값과 비교한다.
 * 판정 경로는 둘이지만 **같은 `sinceMs`·같은 임계값**을 본다:
 *
 * 1. **포그라운드 감시** — `pollMs` 인터벌. 수동 일시정지를 화면을 보면서 방치하는 경우.
 * 2. **복귀 재계산** — `SystemPauseSource.onReturn`에서 즉시 1회. 화면이 꺼져 있던 동안
 *    인터벌이 몇 번 돌았는지와 무관하게, 복귀 시점의 실제 경과로 판정한다.
 *
 * 감지 수단을 `SystemPauseSource` 어댑터 뒤에 두는 이유는 그 파일의 주석과 같다 —
 * WKWebView 실기기 검증 후 네이티브 브리지로 갈아끼울 때 여기를 고치지 않기 위해서다.
 */

export interface PausedSnapshot {
  /** 일시정지가 시작된 **벽시계** 시각(`Date.now()` 기준 ms). 트리거와 무관한 유일한 판정 기준. */
  readonly sinceMs: number;
  /** ⚠️ **S3-8 문구 선택 전용.** 임계값 판정에 절대 쓰지 않는다. */
  readonly trigger: PauseTrigger;
}

export interface UsePauseAutoEndArgs {
  /** 일시정지가 아니면 `null` — 감시하지 않는다. 세션이 끝난 뒤에도 호출부가 `null`을 넘긴다. */
  readonly paused: PausedSnapshot | null;
  readonly config: SessionTuningConfig;
  /** 임계값 도달 시 1회 호출. 같은 일시정지 구간에서 두 번 호출되지 않는다. */
  readonly onAutoEnd: (trigger: PauseTrigger) => void;
  /** 복귀 신호원. 없으면 포그라운드 인터벌만 돈다. */
  readonly systemPause?: SystemPauseSource;
  /** 포그라운드 감시 주기(ms). 기본 1초 — 초 단위 임계값이면 충분하다. */
  readonly pollMs?: number;
  /** 테스트 주입용 시계. */
  readonly now?: () => number;
}

export function usePauseAutoEnd({
  paused,
  config,
  onAutoEnd,
  systemPause,
  pollMs = 1000,
  now = Date.now,
}: UsePauseAutoEndArgs): void {
  // 콜백·시계는 매 렌더 새 참조가 되기 쉬운데, effect 의존성에 넣으면 인터벌이 재시작된다.
  // 판정 기준(sinceMs·임계값)이 아니므로 ref로 흘려보낸다.
  const onAutoEndRef = useRef(onAutoEnd);
  onAutoEndRef.current = onAutoEnd;
  const nowRef = useRef(now);
  nowRef.current = now;
  /**
   * 이미 자동 종료를 알린 일시정지 구간의 시작 시각. effect 바깥(ref)에 두는 이유는
   * **effect가 다시 실행돼도 같은 구간에서 두 번 발화하지 않게** 하기 위해서다 —
   * StrictMode의 이중 마운트나 prop 변화로 재구독될 때 이미 임계값을 넘긴 상태라면
   * 지역 변수 플래그로는 막지 못한다. 새 구간이 시작되면 `sinceMs`가 달라져 자동으로 풀린다.
   */
  const firedForSinceMsRef = useRef<number | null>(null);

  const thresholdMs = autoEndAfterPauseMs(config);
  const pausedSinceMs = paused?.sinceMs ?? null;
  const pauseTrigger = paused?.trigger ?? null;

  useEffect(() => {
    if (pausedSinceMs === null || pauseTrigger === null || thresholdMs === null) {
      return;
    }

    const check = () => {
      if (firedForSinceMsRef.current === pausedSinceMs) {
        return;
      }
      // **누적하지 않는다** — 매번 벽시계 경과를 다시 계산한다. 스로틀된 인터벌이 몇 번
      // 걸렀는지와 무관하게 같은 답이 나오는 것이 이 훅의 핵심이다.
      if (nowRef.current() - pausedSinceMs < thresholdMs) {
        return;
      }
      firedForSinceMsRef.current = pausedSinceMs;
      onAutoEndRef.current(pauseTrigger);
    };

    // 구독 직후 1회 — 일시정지 중에 임계값 설정이 바뀌거나 재마운트된 경우를 즉시 판정한다.
    check();
    const interval = setInterval(check, pollMs);
    const unsubscribe = systemPause?.subscribe({ onLeave: check, onReturn: check });

    return () => {
      clearInterval(interval);
      unsubscribe?.();
    };
  }, [pausedSinceMs, pauseTrigger, pollMs, systemPause, thresholdMs]);
}
