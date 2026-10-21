import {
  createFrameLoop as createRealFrameLoop,
  nextFrameIntervalMs,
} from "@/features/study-session/vision/frameLoop";
import type { FrameLoop, FrameLoopOptions } from "@/features/study-session/vision/frameLoop";

/**
 * 벤치 빌드 전용 프레임 루프 — `focusDetector.ts`의 `../vision/frameLoop` import만 이 파일로 바뀐다
 * (`bench/vite.config.ts`의 alias). 판정 코드는 한 줄도 바뀌지 않는다.
 *
 * 프로덕션 루프는 벽시계 `setTimeout`으로 1초마다 `onFrame`을 부른다. 영상 파일을 그대로 틀면
 * 추론 속도가 결과를 흔들고, 1시간짜리 벤치에 1시간이 걸린다. 그래서 두 모드를 둔다.
 *
 * - `manual`: 하네스가 영상을 다음 샘플 시각으로 옮긴 뒤 `step()`으로 한 프레임씩 직접 돌린다.
 *   추론을 끝까지 기다리므로 프레임 버림이 없다(= 추론이 주기 안에 끝나는 기기 조건).
 * - `realtime`: 프로덕션 루프를 그대로 쓴다. 영상을 1배속으로 틀어 실제 버림·지연까지 재현한다.
 */

export type { FrameLoop, FrameLoopOptions };
export { nextFrameIntervalMs };

export type LoopMode = "manual" | "realtime";

export interface ManualFrameLoop extends FrameLoop {
  /** 한 프레임을 처리하고 끝날 때까지 기다린다. 멈춰 있으면 아무것도 하지 않고 false. */
  step(): Promise<boolean>;
}

let mode: LoopMode = "manual";
let lastManualLoop: ManualFrameLoop | null = null;

export function setLoopMode(next: LoopMode): void {
  mode = next;
}

/** 방금 만든 검출기가 만든 수동 루프를 넘겨받는다. 검출기 하나가 루프 하나를 만든다. */
export function takeManualLoop(): ManualFrameLoop {
  const loop = lastManualLoop;
  lastManualLoop = null;
  if (loop === null) {
    throw new Error("수동 프레임 루프가 없습니다 — setLoopMode('manual') 뒤에 검출기를 만드세요");
  }
  return loop;
}

export function createFrameLoop(options: FrameLoopOptions): FrameLoop {
  if (mode === "realtime") {
    return createRealFrameLoop(options);
  }
  let running = false;
  const loop: ManualFrameLoop = {
    get isRunning() {
      return running;
    },
    start() {
      running = true;
    },
    stop() {
      running = false;
    },
    async step() {
      if (!running) {
        return false;
      }
      try {
        await options.onFrame();
      } catch (error: unknown) {
        // 프로덕션 루프와 같다 — 프레임 하나의 실패로 측정을 멈추지 않는다.
        console.warn("[bench] 프레임 처리 실패", error);
      }
      return true;
    },
  };
  lastManualLoop = loop;
  return loop;
}
