/**
 * 세션 화면 모드 기억
 *
 * 심플 모드와 카메라 크게 보기를 기기에 저장해 다음 세션을 마지막 모드로 연다.
 * 저장소를 쓸 수 없으면 둘 다 꺼진 기본 모드(카메라 작은 창)로 시작한다.
 */
const SIMPLE_MODE_KEY = "focuson.sessionSimpleMode.v1";
const CAMERA_EXPANDED_KEY = "focuson.sessionCameraExpanded.v1";

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    // 저장하지 못해도 이번 화면의 모드는 상태로 바뀌므로 공부를 막지 않는다.
  }
}

export function readSessionSimpleMode(): boolean {
  return readFlag(SIMPLE_MODE_KEY);
}

export function writeSessionSimpleMode(on: boolean): void {
  writeFlag(SIMPLE_MODE_KEY, on);
}

export function readSessionCameraExpanded(): boolean {
  return readFlag(CAMERA_EXPANDED_KEY);
}

export function writeSessionCameraExpanded(on: boolean): void {
  writeFlag(CAMERA_EXPANDED_KEY, on);
}
