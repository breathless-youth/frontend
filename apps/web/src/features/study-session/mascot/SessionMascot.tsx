import { useLayoutEffect, useRef, type CSSProperties } from "react";

import sheetUrl from "@/assets/session/mascot-stopwatch-sprite.webp";
import { prefersReducedMotion } from "@/lib/prefersReducedMotion";

import type { SessionState } from "../sessionState";
import {
  BLINK_DURATION_MS,
  BLINK_FRAMES,
  MASCOT_CELL,
  canBlink,
  mascotCellFor,
  nextBlinkDelayMs,
  transitionFramesTo,
  type MascotCell,
  type MascotFrame,
} from "./mascotExpression";

// 시트는 칸 72와 간격 2를 이어 붙인 폭 664라 다음 칸을 보일 때마다 상자 크기의 74/72만큼 민다.
const SHEET_SHIFT = "translateX(calc(var(--mascot-box) * -74 / 72 * var(--mascot-cell)))";

function canAnimate(): boolean {
  return typeof Element.prototype.animate === "function" && !prefersReducedMotion();
}

/**
 * 시트 칸을 넘기는 한 번의 애니메이션
 *
 * 옛 WebKit은 애니메이션 키프레임 안의 CSS 변수를 풀지 못해서 측정한 상자 폭으로 px 값을 만든다.
 * 상자가 아직 그려지지 않아 폭이 0이면 엉뚱한 칸이 비치니 재생하지 않고 null을 돌려준다.
 */
function playFrames(sheet: HTMLElement, frames: readonly MascotFrame[]): Animation | null {
  const boxPx = sheet.parentElement?.clientWidth ?? 0;
  if (boxPx === 0) return null;
  return sheet.animate(
    frames.map(({ cell, offset }) => ({
      transform: `translateX(${(-boxPx * 74 * cell) / 72}px)`,
      offset,
      easing: "steps(1, end)",
    })),
    { duration: BLINK_DURATION_MS },
  );
}

const IDLE_BLINK_FRAMES: readonly MascotFrame[] = [
  ...BLINK_FRAMES,
  { cell: MASCOT_CELL.angry, offset: 1 },
];

/**
 * 태블릿 공부 화면 마스코트
 *
 * 시트 한 장의 위치를 바꿔 표정을 바꾸고 상태가 바뀔 때만 다시 그려진다.
 * 움직임은 표정이 바뀔 때와 가끔 깜빡일 때 한 번씩만 재생해서 공부하는 동안 눈길을 끌지 않는다.
 * 모션 축소를 켰거나 Web Animations API가 없으면 칸만 바꾼다.
 */
export function SessionMascot({ state }: { state: SessionState }) {
  const cell = mascotCellFor(state);
  const sheetRef = useRef<HTMLImageElement>(null);
  const prevCellRef = useRef<MascotCell | null>(null);

  // 칸이 바뀐 화면이 그려지기 전에 전환을 걸어야 새 표정이 한 프레임 먼저 비치지 않는다.
  useLayoutEffect(() => {
    const prevCell = prevCellRef.current;
    prevCellRef.current = cell;
    const sheet = sheetRef.current;
    if (sheet === null || !canAnimate()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running: Animation | null = null;
    // 이미 끝난 애니메이션의 후속 처리는 정리 함수가 돈 뒤에도 실행되어서 지난 표정의 깜빡임을 잡지 않게 막는다.
    let active = true;
    const stop = () => {
      clearTimeout(timer);
      running?.cancel();
      running = null;
    };
    // 전환이 끝난 뒤에만 부르므로 깜빡임이 전환과 겹치지 않는다.
    const scheduleBlink = () => {
      if (!active) return;
      stop();
      // 화면이 꺼진 동안에는 아무도 보지 않으니 타이머를 걸지 않는다.
      if (!canBlink(cell) || document.hidden) return;
      timer = setTimeout(() => {
        // 기다리는 사이에 모션 축소를 켰으면 이 표정에서는 더 깜빡이지 않는다.
        if (!active || !canAnimate()) return;
        running = playFrames(sheet, IDLE_BLINK_FRAMES);
        if (running === null) {
          scheduleBlink();
          return;
        }
        running.finished.then(scheduleBlink, () => {});
      }, nextBlinkDelayMs());
    };
    running =
      prevCell === null || prevCell === cell ? null : playFrames(sheet, transitionFramesTo(cell));
    if (running === null) {
      scheduleBlink();
    } else {
      running.finished.then(scheduleBlink, () => {});
    }
    document.addEventListener("visibilitychange", scheduleBlink);
    return () => {
      active = false;
      stop();
      document.removeEventListener("visibilitychange", scheduleBlink);
    };
  }, [cell]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-0 size-(--mascot-box) -translate-y-1/2 overflow-hidden [--mascot-box:5rem] short-side-lg:[--mascot-box:5.8125rem]"
    >
      <img
        ref={sheetRef}
        src={sheetUrl}
        alt=""
        decoding="async"
        draggable={false}
        className="h-full w-[calc(var(--mascot-box)*664/72)] max-w-none"
        style={
          {
            "--mascot-cell": String(cell),
            transform: SHEET_SHIFT,
          } as CSSProperties
        }
      />
    </div>
  );
}
