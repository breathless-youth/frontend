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
    // 새 터치의 첫 손가락이면 이전 손가락은 모두 뗀 것이다. 떼는 신호를 놓쳐도 여기서 정리된다.
    if ((event as Partial<PointerEvent>).isPrimary === true) {
      pressed.clear();
    }
    pressed.add(pointerIdOf(event));
    clearTimeout(releaseTimer);
    notify(true);
  }

  function scheduleOff(): void {
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => notify(false), holdMs);
  }

  // 손가락을 모두 뗀 뒤에만 끄기 타이머를 건다.
  function onRelease(event: Event): void {
    pressed.delete(pointerIdOf(event));
    if (pressed.size === 0) {
      scheduleOff();
    }
  }

  // 화면이 가려지면 떼는 신호가 오지 않을 수 있어 눌린 손가락을 모두 잊는다.
  function onVisibilityChange(): void {
    pressed.clear();
    if (active) {
      scheduleOff();
    }
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
      target.addEventListener("visibilitychange", onVisibilityChange);
    },

    stop(): void {
      if (!running) {
        return;
      }
      running = false;
      target.removeEventListener("pointerdown", onPress);
      target.removeEventListener("pointerup", onRelease);
      target.removeEventListener("pointercancel", onRelease);
      target.removeEventListener("visibilitychange", onVisibilityChange);
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
