import type { SessionState } from "../sessionState";

/**
 * 스프라이트 시트 칸 번호
 *
 * 시트의 표정 순서와 같다.
 * 점프 칸은 시트에 있지만 지금은 어떤 상태에도 쓰지 않는다.
 * 실루엣 칸은 자리를 비운 상태에만 쓴다.
 */
export const MASCOT_CELL = {
  base: 0,
  focus: 1,
  joy: 2,
  blank: 3,
  sleepy: 4,
  angry: 5,
  surprised: 6,
  jump: 7,
  silhouette: 8,
} as const;

export type MascotCell = (typeof MASCOT_CELL)[keyof typeof MASCOT_CELL];

export type MascotFrame = { cell: MascotCell; offset: number };

export const BLINK_DURATION_MS = 333;

/**
 * 깜빡임 키프레임
 *
 * 30fps 기준 화남 3f, 정색 4f, 화남 3f를 오프셋으로 바꾼 값이다.
 * 끝나면 애니메이션이 풀려 원래 칸으로 돌아온다.
 */
export const BLINK_FRAMES: readonly MascotFrame[] = [
  { cell: MASCOT_CELL.angry, offset: 0 },
  { cell: MASCOT_CELL.blank, offset: 0.3 },
  { cell: MASCOT_CELL.angry, offset: 0.7 },
];

export function mascotCellFor(state: SessionState): MascotCell {
  switch (state.kind) {
    case "FOCUS":
      return MASCOT_CELL.focus;
    case "PAUSE":
      return MASCOT_CELL.base;
    case "DISTRACTION":
      switch (state.trigger) {
        case "SLEEP":
          return MASCOT_CELL.sleepy;
        case "AWAY":
          return MASCOT_CELL.silhouette;
        case "PHONE":
        case "DEVICE":
          return MASCOT_CELL.blank;
      }
  }
}

/**
 * 표정이 바뀔 때의 키프레임
 *
 * 눈이 한 번에 바뀌면 튀어 보여서 한 번 눈을 감았다가 새 표정으로 넘어간다.
 * 깜빡임처럼 화남을 두 번 거치면 여러 번 깜빡이는 것처럼 보여서 감은 눈 다음에 바로 새 표정을 보인다.
 * 새 표정이 정색이면 감은 눈 그대로 끝난다.
 */
export function transitionFramesTo(cell: MascotCell): readonly MascotFrame[] {
  const closing = [BLINK_FRAMES[0]!, BLINK_FRAMES[1]!];
  if (cell === MASCOT_CELL.blank) {
    return [...closing, { cell, offset: 1 }];
  }
  return [...closing, { cell, offset: 0.7 }, { cell, offset: 1 }];
}

export function canBlink(cell: MascotCell): boolean {
  return cell === MASCOT_CELL.base || cell === MASCOT_CELL.focus;
}

/** 매번 같은 박자로 깜빡이면 기계처럼 보여서 4~6초 사이에서 고른다. */
export function nextBlinkDelayMs(random: () => number = Math.random): number {
  return 4000 + Math.floor(random() * 2000);
}
