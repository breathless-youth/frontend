import type { SessionState } from "../sessionState";

/**
 * 스프라이트 시트 칸 번호
 *
 * 시트의 표정 순서와 같다.
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
} as const;

export type MascotCell = (typeof MASCOT_CELL)[keyof typeof MASCOT_CELL];

export const BLINK_DURATION_MS = 333;
export const JUMP_DURATION_MS = 500;
export const SQUASH_DURATION_MS = 300;

/**
 * 깜빡임 키프레임
 *
 * 30fps 기준 화남 3f, 정색 4f, 화남 3f를 오프셋으로 바꾼 값이다.
 * 끝나면 애니메이션이 풀려 원래 칸으로 돌아온다.
 */
export const BLINK_FRAMES: readonly { cell: MascotCell; offset: number }[] = [
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
          return MASCOT_CELL.surprised;
        case "PHONE":
        case "DEVICE":
          return MASCOT_CELL.blank;
      }
  }
}

export function shouldJump(prev: SessionState | null, next: SessionState): boolean {
  return prev !== null && prev.kind !== "FOCUS" && next.kind === "FOCUS";
}

export function canBlink(cell: MascotCell): boolean {
  return cell === MASCOT_CELL.base || cell === MASCOT_CELL.focus;
}

/** 매번 같은 박자로 깜빡이면 기계처럼 보여서 4~6초 사이에서 고른다. */
export function nextBlinkDelayMs(random: () => number = Math.random): number {
  return 4000 + Math.floor(random() * 2000);
}
