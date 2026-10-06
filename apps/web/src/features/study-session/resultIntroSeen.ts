/**
 * 결과 화면 연출을 이미 봤다는 히스토리 표시
 *
 * 인터뷰 폼은 문서 단위로 떠나서 뒤로 오면 결과 문서가 새로 뜨고 도장·색종이가 다시 돈다.
 * 세션이 실린 그 히스토리 항목에 표시를 남겨 돌아온 결과 화면이 연출을 건너뛰게 한다.
 */

const INTRO_SEEN_KEY = "introSeen";

/** react-router가 쓰는 key·idx는 그대로 두고 사용자 state에만 표시를 더한다. */
export function markResultIntroSeen(): void {
  const current: unknown = window.history.state;
  const base = typeof current === "object" && current !== null ? current : {};
  const usr: unknown = (base as { usr?: unknown }).usr;
  const usrBase = typeof usr === "object" && usr !== null ? usr : {};
  window.history.replaceState({ ...base, usr: { ...usrBase, [INTRO_SEEN_KEY]: true } }, "");
}

/** 히스토리 state는 남의 값도 들어올 수 있어 true일 때만 본 것으로 친다. */
export function readResultIntroSeen(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as Record<string, unknown>)[INTRO_SEEN_KEY] === true
  );
}
