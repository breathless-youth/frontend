import type { DetectorSignal, FocusDetector } from "./focusDetector";

/**
 * 화면 조작 감지기 — 세션 화면을 만지는 동안 `TOUCH` 원신호를 켠다.
 *
 * 누르고 있는 동안 켜 두고, 손을 뗀 뒤에도 `holdMs` 동안 더 켜 둔다. 한 번 탭은 유예 진입 시간보다 짧게 끝나고,
 * 계속 만지거나 길게 끌면 원신호가 이어져 유예를 거쳐 비집중이 된다. 유지시간 판정은 `../detection.ts`가 한다.
 */

export const TOUCH_HOLD_MS = 2000;

export interface TouchDetectorOptions {
  readonly target?: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  readonly holdMs?: number;
}

export function createTouchDetector(options: TouchDetectorOptions = {}): FocusDetector {
  const target = options.target ?? document;
  const holdMs = options.holdMs ?? TOUCH_HOLD_MS;
  const listeners = new Set<(signal: DetectorSignal) => void>();
  let active = false;
  let running = false;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;
  const pressed = new Set<number | undefined>();

  function notify(next: boolean): void {
    if (next === active) {
      return;
    }
    active = next;
    for (const listener of [...listeners]) {
      listener({ source: "TOUCH", active: next });
    }
  }

  function pointerIdOf(event: Event): number | undefined {
    return (event as Partial<PointerEvent>).pointerId;
  }

  function onPress(event: Event): void {
    pressed.add(pointerIdOf(event));
    clearTimeout(releaseTimer);
    notify(true);
  }

  // 손가락을 모두 뗀 뒤에만 끄기 타이머를 건다.
  function onRelease(event: Event): void {
    pressed.delete(pointerIdOf(event));
    if (pressed.size > 0) {
      return;
    }
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => notify(false), holdMs);
  }

  return {
    start(): void {
      if (running) {
        return;
      }
      running = true;
      target.addEventListener("pointerdown", onPress, { passive: true });
      target.addEventListener("pointerup", onRelease, { passive: true });
      target.addEventListener("pointercancel", onRelease, { passive: true });
    },

    stop(): void {
      if (!running) {
        return;
      }
      running = false;
      target.removeEventListener("pointerdown", onPress);
      target.removeEventListener("pointerup", onRelease);
      target.removeEventListener("pointercancel", onRelease);
      clearTimeout(releaseTimer);
      pressed.clear();
      notify(false);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
