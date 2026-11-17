import type { Mascot } from "../types";

/**
 * 마스코트를 화면에 늘어놓는 순서
 *
 * 공부 시간으로 여는 마스코트를 여는 시간 순서로 두고, 포인트로 사는 마스코트는 그 뒤에 둔다.
 * 서버는 포인트로 사는 마스코트의 여는 시간을 0으로 주므로 시간만으로 늘어놓으면 처음부터 열린 마스코트 옆에 끼어든다.
 * 기준이 같으면 서버가 준 순서를 지킨다.
 */
export function sortMascots(mascots: readonly Mascot[]): Mascot[] {
  return mascots.toSorted(
    (a, b) =>
      Number(a.price !== null) - Number(b.price !== null) || a.unlockFocusSec - b.unlockFocusSec,
  );
}
