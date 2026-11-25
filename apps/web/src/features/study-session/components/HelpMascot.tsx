import { useEffect, useRef } from "react";

import sheetUrl from "@/assets/session/mascot-stopwatch-sprite.webp";
import { prefersReducedMotion } from "@/lib/prefersReducedMotion";

import { BLINK_DURATION_MS, MASCOT_CELL, type MascotCell } from "../mascot/mascotExpression";
import type { SessionHelpMascotPose } from "../sessionGuide";

/** 시트는 칸 72와 간격 2를 이어 붙였고 도움말 마스코트는 72px 고정이라 칸 이동을 px로 계산한다. */
const CELL_STEP_PX = 74;
const shift = (cell: MascotCell) => `translateX(${-CELL_STEP_PX * cell}px)`;

const POSE_CELL: Record<SessionHelpMascotPose, MascotCell> = {
  joy: MASCOT_CELL.joy,
  focus: MASCOT_CELL.focus,
  sleepy: MASCOT_CELL.sleepy,
  jump: MASCOT_CELL.jump,
};

/** 깜빡임은 30fps로 화남 3f, 정색 4f, 화남 3f다. */
const BLINK_CLOSE_MS = 100;
const BLINK_OPEN_MS = 233;

/** [시각(ms), 칸] 목록을 한 주기 시트 키프레임으로 바꾼다. 칸은 다음 시각까지 그대로 머문다. */
function sheetFrames(cycleMs: number, cells: readonly (readonly [number, MascotCell])[]) {
  return [
    ...cells.map(([at, cell]) => ({
      transform: shift(cell),
      offset: at / cycleMs,
      easing: "steps(1, end)",
    })),
    { transform: shift(cells[0]![1]), offset: 1 },
  ];
}

/** 쉬다가 마지막에 한 번 깜빡이는 시트 주기 */
function blinkAtEnd(cell: MascotCell, idleMs: number) {
  return sheetFrames(idleMs + BLINK_DURATION_MS, [
    [0, cell],
    [idleMs, MASCOT_CELL.angry],
    [idleMs + BLINK_CLOSE_MS, MASCOT_CELL.blank],
    [idleMs + BLINK_OPEN_MS, MASCOT_CELL.angry],
  ]);
}

/** 쉬다가 위로 떴다 내려온 뒤 다시 쉬는 몸 주기 */
function hopFrames(cycleMs: number, waitMs: number, riseMs: number, heightPx: number) {
  return [
    { transform: "none", offset: 0 },
    { transform: "none", offset: waitMs / cycleMs, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    {
      transform: `translateY(${-heightPx}px)`,
      offset: (waitMs + riseMs) / cycleMs,
      easing: "ease-in-out",
    },
    { transform: "none", offset: (waitMs + riseMs * 2) / cycleMs },
    { transform: "none", offset: 1 },
  ];
}

interface Loop {
  body?: Keyframe[];
  sheet?: Keyframe[];
  cycleMs: number;
}

/** 기쁨: 대기 1초, 3px 떠올랐다 내려옴 0.7초, 대기 1.4초, 깜빡임 */
const JOY_IDLE_MS = 3100;
/** 점프: 대기 0.8초, 6px 폴짝·착지 0.6초, 대기 1.5초 */
const JUMP_CYCLE_MS = 2900;
/** 집중: 대기 3.4초, 깜빡임 */
const FOCUS_IDLE_MS = 3400;
/** 졸림: 대기 2.1초, 꾸벅 0.9초, 번쩍 0.1초, 반쯤 뜬 눈 0.3초, 다시 감음 0.3초 */
const NOD_CYCLE_MS = 3700;

const LOOPS: Record<SessionHelpMascotPose, Loop> = {
  joy: {
    cycleMs: JOY_IDLE_MS + BLINK_DURATION_MS,
    body: hopFrames(JOY_IDLE_MS + BLINK_DURATION_MS, 1000, 350, 3),
    sheet: blinkAtEnd(MASCOT_CELL.joy, JOY_IDLE_MS),
  },
  focus: {
    cycleMs: FOCUS_IDLE_MS + BLINK_DURATION_MS,
    sheet: blinkAtEnd(MASCOT_CELL.focus, FOCUS_IDLE_MS),
  },
  // 점프 칸은 몸이 기운 웃는 얼굴이라 똑바로 선 깜빡임 칸과 섞으면 어색해서 깜빡이지 않는다.
  jump: {
    cycleMs: JUMP_CYCLE_MS,
    body: hopFrames(JUMP_CYCLE_MS, 800, 300, 6),
  },
  sleepy: {
    cycleMs: NOD_CYCLE_MS,
    body: [
      { transform: "none", offset: 0 },
      { transform: "none", offset: 2100 / NOD_CYCLE_MS, easing: "ease-in-out" },
      { transform: "translateY(2px) rotate(5deg)", offset: 3000 / NOD_CYCLE_MS },
      { transform: "none", offset: 3100 / NOD_CYCLE_MS },
      { transform: "none", offset: 1 },
    ],
    sheet: sheetFrames(NOD_CYCLE_MS, [
      [0, MASCOT_CELL.sleepy],
      [3000, MASCOT_CELL.angry],
      [3400, MASCOT_CELL.blank],
    ]),
  },
};

/**
 * 도움말 말풍선 옆 마스코트
 *
 * 시트 한 장의 위치를 옮겨 표정을 바꾸고 단계마다 정해진 짧은 동작을 끝없이 되풀이한다.
 * 졸림은 깜빡임 대신 꾸벅 졸다가 깨는 동작만 하고, 점프는 깜빡이지 않고 폴짝 뛰기만 한다.
 * 모션 축소를 켰거나 Web Animations API가 없으면 표정만 보인다.
 */
export function HelpMascot({ pose }: { pose: SessionHelpMascotPose }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLImageElement>(null);
  const cell = POSE_CELL[pose];

  useEffect(() => {
    const body = bodyRef.current;
    const sheet = sheetRef.current;
    if (!body || !sheet || typeof sheet.animate !== "function" || prefersReducedMotion()) return;
    const loop = LOOPS[pose];
    const options = { duration: loop.cycleMs, iterations: Infinity };
    const running = [
      ...(loop.body ? [body.animate(loop.body, options)] : []),
      ...(loop.sheet ? [sheet.animate(loop.sheet, options)] : []),
    ];
    return () => {
      for (const animation of running) animation.cancel();
    };
  }, [pose]);

  return (
    // 졸림의 꾸벅은 발끝을 축으로 기운다.
    <div ref={bodyRef} aria-hidden="true" className="size-18 shrink-0 origin-bottom">
      <div className="size-full overflow-hidden">
        <img
          ref={sheetRef}
          data-testid="help-mascot"
          data-cell={cell}
          src={sheetUrl}
          alt=""
          decoding="async"
          draggable={false}
          className="h-full w-166 max-w-none"
          style={{ transform: shift(cell) }}
        />
      </div>
    </div>
  );
}
