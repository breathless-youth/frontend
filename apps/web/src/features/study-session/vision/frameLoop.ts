import type { SessionState } from "../sessionState";
import { FRAME_INTERVAL_MS } from "./visionConfig";

/**
 * 고정 주기 프레임 스케줄러(설계 §3).
 *
 * 추론 자체는 모른다 — `onFrame` 하나만 받는다. 그래서 이 모듈은 MediaPipe에도 카메라에도
 * 의존하지 않고, 테스트는 fake timer만으로 돈다.
 */

/**
 * 설계 §3의 `SessionPhase`에 해당한다.
 *
 * 그 이름의 타입은 이 저장소에 아직 없다. 이름만 새로 만들면 `SessionState`와 값이 갈라질 수
 * 있으므로 **기존 상태 모델의 판별자를 그대로 재사용**한다(`FOCUS` | `DISTRACTION` | `PAUSE`).
 * `packages/study-core`가 신설되면(설계 §6) 이 타입도 그쪽으로 따라간다.
 */
export type FramePhase = SessionState["kind"];

/**
 * 다음 프레임까지의 간격(ms).
 *
 * **지금은 phase와 무관하게 상수를 돌려준다.** 그래도 함수로 감싸 호출부를 미리 분리해 두는 이유는,
 * M1에서 적응형(집중이 안정되면 느리게)으로 바꿀 때 **이 함수 안만 고치면 되도록** 하기 위해서다
 * (설계 §3). 지금 인라인 상수로 쓰면 그때 프레임 루프·훅·테스트가 전부 딸려 바뀐다.
 *
 * `PAUSE`에서 간격을 늘리지 않는 것도 의도다 — 일시정지는 **추론을 아예 멈추는** 정책이라
 * (설계 §3, 카메라 스트림은 유지) 호출부가 `stop()`을 부른다. 여기서 간격만 늘리면
 * "멈춘 줄 알았는데 가끔 도는" 상태가 되어 조용히 틀린다.
 */
export function nextFrameIntervalMs(_phase: FramePhase): number {
  return FRAME_INTERVAL_MS;
}

export interface FrameLoop {
  readonly isRunning: boolean;
  /** 이미 돌고 있으면 아무것도 하지 않는다(멱등). */
  start(): void;
  /** 이미 멈춰 있어도 안전하다(멱등). */
  stop(): void;
}

export interface FrameLoopOptions {
  /**
   * 한 프레임 처리. 동기·비동기 둘 다 받는다 — 비동기면 **해결될 때까지 다음 호출을 걸지 않는다.**
   * 여기서 던지거나 거부해도 루프는 계속 돈다(한 프레임 실패로 세션 측정을 포기하지 않는다).
   */
  onFrame: () => void | Promise<void>;
  /** 현재 세션 phase. 매 프레임 다시 읽으므로 적응형 주기로 바꿀 때 호출부가 안 바뀐다. */
  phase?: () => FramePhase;
}

/**
 * 고정 주기 루프를 만든다.
 *
 * **`setInterval`을 쓰지 않는다.** `setInterval`은 콜백이 끝났는지 보지 않고 주기마다 큐에
 * 쌓는다. 추론이 주기(`FRAME_INTERVAL_MS`)보다 오래 걸리는 순간(저사양 기기에서 실제로
 * 일어난다) 호출이 겹쳐 쌓이고, MediaPipe `detectForVideo`는 재진입 안전이 보장되지 않는다.
 * 게다가 밀린 호출을 몰아 처리하면 프레임 간격 전제가 깨져 배터리만 태운다.
 *
 * 그래서 **직전 추론이 안 끝났으면 이번 프레임을 통째로 버린다.** 지금 주기(1000ms)는 추론
 * 실측(int8 213~371ms)보다 길어 평소엔 버릴 일이 없다.
 *
 * ⚠️ 다만 **버려진 프레임은 관측 공백이지 지연이 아니다.** 유지시간 디바운스가 벽시계
 * 기반(`../detection.ts`)이라 이미 관측된 신호의 판정이 뒤집히지는 않지만, 공백 안에서
 * 시작해 공백 안에서 끝난 신호는 어느 프레임에도 걸리지 않아 **아예 없었던 일이 된다.**
 * 이 루프가 만드는 신호는 AWAY·PHONE뿐이고(`DEVICE`는 가속도 센서 경로라 무관 —
 * `../adapters/deviceHandlingDetector.ts`), 그중 확정 유지시간이 주기보다 짧은
 * PHONE(`enterMs` 500ms)이 취약하다. AWAY는 1500ms라 최소 한 샘플이 보장된다.
 *
 * 타이머는 매 tick에서 **먼저 다음 주기를 예약한 뒤** 프레임을 처리한다. 추론 시간이 주기에
 * 누적되지 않게 하기 위해서다.
 */
export function createFrameLoop(options: FrameLoopOptions): FrameLoop {
  const { onFrame, phase = () => "FOCUS" as FramePhase } = options;

  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** 직전 추론이 아직 진행 중인가. 이 값이 프레임 겹침을 막는 유일한 장치다. */
  let busy = false;
  /**
   * 현재 실행 세대. `stop()`이 이 값을 올리므로, **진행 중이던 추론이 뒤늦게 끝나도**
   * 다음 세대의 `busy`를 건드리지 않는다. React 19 StrictMode가 effect를 두 번 실행해
   * start → stop → start가 한 틱 안에 일어나는 경로에서 실제로 필요하다
   * (`../devMockDetector.ts` 주석 참고).
   */
  let generation = 0;

  function scheduleNext(id: number): void {
    timer = setTimeout(() => {
      if (!running || id !== generation) {
        return;
      }
      timer = null;
      scheduleNext(id);
      fire(id);
    }, nextFrameIntervalMs(phase()));
  }

  function fire(id: number): void {
    if (busy) {
      // 직전 추론이 아직 안 끝났다 — 이번 프레임은 버린다. 밀린 만큼 몰아서 처리하지 않는다.
      return;
    }
    busy = true;
    void (async () => {
      try {
        await onFrame();
      } catch (error: unknown) {
        // 프레임 하나가 실패해도 루프는 계속 돈다. 감지가 실제로 불가능해졌는지는
        // 검출기가 자기 상태로 표현하고(`objectDetector.ts`), 호출부가 그걸 보고 판단한다.
        console.warn("[vision] 프레임 처리 실패", error);
      } finally {
        if (id === generation) {
          busy = false;
        }
      }
    })();
  }

  return {
    get isRunning() {
      return running;
    },
    start() {
      if (running) {
        return;
      }
      running = true;
      generation += 1;
      const id = generation;
      scheduleNext(id);
      // 첫 프레임은 즉시 처리한다 — 기다리면 세션 시작 직후 한 주기만큼 판정 공백이 생기고,
      // 그 구간은 "사람 없음"과 구분되지 않는다.
      fire(id);
    },
    stop() {
      running = false;
      generation += 1;
      busy = false;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
