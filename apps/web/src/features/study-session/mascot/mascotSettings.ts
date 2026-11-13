const KEY = "focuson.sessionMascot.v1";

/**
 * 공부 화면 마스코트 표시 여부
 *
 * 저장소를 쓸 수 없는 창에서는 기본값인 켜짐으로 본다.
 */
export function readSessionMascotOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeSessionMascotOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // 저장하지 못해도 이번 화면의 표시는 상태로 바뀌므로 공부를 막지 않는다.
  }
}
