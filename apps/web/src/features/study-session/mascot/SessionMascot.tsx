import { useEffect, useRef, useState, type CSSProperties } from "react";

import sheetUrl from "@/assets/session/mascot-stopwatch-sprite.webp";
import { prefersReducedMotion } from "@/lib/prefersReducedMotion";

import type { SessionState } from "../sessionState";
import {
  BLINK_DURATION_MS,
  BLINK_FRAMES,
  JUMP_DURATION_MS,
  MASCOT_CELL,
  SQUASH_DURATION_MS,
  canBlink,
  mascotCellFor,
  nextBlinkDelayMs,
  shouldJump,
  type MascotCell,
} from "./mascotExpression";

// 시트는 칸 72와 간격 2를 이어 붙인 폭 590이라 다음 칸을 보일 때마다 상자 크기의 74/72만큼 민다.
const SHEET_SHIFT = "translateX(calc(var(--mascot-box) * -74 / 72 * var(--mascot-cell)))";

// 옛 WebKit은 애니메이션 키프레임 안의 CSS 변수를 풀지 못해서 깜빡임은 측정한 상자 폭으로 px 값을 만든다.
function blinkShift(boxPx: number, cell: MascotCell): string {
  return `translateX(${(-boxPx * 74 * cell) / 72}px)`;
}

// 같은 이름의 index.css 토큰과 같은 곡선이다.
const EASE_OVERLAY = "cubic-bezier(0.23, 1, 0.32, 1)";

function canAnimate(): boolean {
  return typeof Element.prototype.animate === "function" && !prefersReducedMotion();
}

/**
 * 태블릿 공부 화면 마스코트
 *
 * 시트 한 장의 위치를 바꿔 표정을 바꾸고 상태가 바뀔 때만 다시 그려진다.
 * 움직임은 상태가 바뀔 때와 가끔 깜빡일 때 한 번씩만 재생해서 공부하는 동안 눈길을 끌지 않는다.
 * 모션 축소를 켰거나 Web Animations API가 없으면 칸만 바꾼다.
 */
export function SessionMascot({ state }: { state: SessionState }) {
  const [lastState, setLastState] = useState(state);
  const [jumping, setJumping] = useState(false);
  // 점프 칸을 거쳐야 하는지는 이전 상태를 알아야 해서 렌더 중에 정한다.
  if (lastState !== state) {
    setLastState(state);
    setJumping(shouldJump(lastState, state) && canAnimate());
  }
  const cell = jumping ? MASCOT_CELL.jump : mascotCellFor(state);

  const bodyRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLImageElement>(null);
  const prevCellRef = useRef<MascotCell | null>(null);

  useEffect(() => {
    const prevCell = prevCellRef.current;
    prevCellRef.current = cell;
    const body = bodyRef.current;
    if (prevCell === null || prevCell === cell || body === null) return;
    if (cell === MASCOT_CELL.jump) {
      const jump = body.animate(
        [
          { transform: "translateY(0)", easing: "ease-out" },
          { transform: "translateY(-8px)", offset: 0.4, easing: "ease-in" },
          { transform: "translateY(0)" },
        ],
        { duration: JUMP_DURATION_MS },
      );
      // 다른 상태로 넘어가 취소되면 거절되므로 그때는 칸을 건드리지 않는다.
      jump.finished.then(
        () => setJumping(false),
        () => {},
      );
      return () => jump.cancel();
    }
    // 점프에서 내려앉은 집중 칸은 이미 움직였으니 다시 누르지 않는다.
    if (prevCell === MASCOT_CELL.jump && cell === MASCOT_CELL.focus) return;
    if (!canAnimate()) return;
    const squash = body.animate([{ transform: "scale(0.94)" }, { transform: "scale(1)" }], {
      duration: SQUASH_DURATION_MS,
      easing: EASE_OVERLAY,
    });
    return () => squash.cancel();
  }, [cell]);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (sheet === null || !canBlink(cell) || !canAnimate()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let blink: Animation | null = null;
    const stop = () => {
      clearTimeout(timer);
      blink?.cancel();
      blink = null;
    };
    const schedule = () => {
      stop();
      // 화면이 꺼진 동안에는 아무도 보지 않으니 타이머를 걸지 않는다.
      if (document.hidden) return;
      timer = setTimeout(() => {
        // 기다리는 사이에 모션 축소를 켰으면 이 표정에서는 더 깜빡이지 않는다.
        if (!canAnimate()) return;
        const boxPx = sheet.parentElement?.clientWidth ?? 0;
        // 상자가 아직 그려지지 않아 폭이 0이면 엉뚱한 칸이 비치니 다음 차례로 미룬다.
        if (boxPx === 0) {
          schedule();
          return;
        }
        blink = sheet.animate(
          [
            ...BLINK_FRAMES.map(({ cell: frame, offset }) => ({
              transform: blinkShift(boxPx, frame),
              offset,
              easing: "steps(1, end)",
            })),
            { transform: blinkShift(boxPx, MASCOT_CELL.angry), offset: 1 },
          ],
          { duration: BLINK_DURATION_MS },
        );
        blink.finished.then(schedule, () => {});
      }, nextBlinkDelayMs());
    };
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [cell]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 right-full mr-3 size-(--mascot-box) -translate-y-1/2 [--mascot-box:5rem] short-side-lg:[--mascot-box:5.8125rem]"
    >
      <div ref={bodyRef} className="size-full overflow-hidden">
        <img
          ref={sheetRef}
          src={sheetUrl}
          alt=""
          decoding="async"
          draggable={false}
          className="h-full w-[calc(var(--mascot-box)*590/72)] max-w-none"
          style={
            {
              "--mascot-cell": String(cell),
              transform: SHEET_SHIFT,
            } as CSSProperties
          }
        />
      </div>
    </div>
  );
}
