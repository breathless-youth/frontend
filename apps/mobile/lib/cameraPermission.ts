import { Camera } from "expo-camera";
import { Linking } from "react-native";

/**
 * 카메라 권한 어댑터 (`frontend/docs/screens/SCR-S2-camera-permission.md` Data Contract).
 *
 * UI 컴포넌트가 카메라 SDK를 직접 호출하지 않게 격리하는 계층이다(`apps/mobile/CLAUDE.md` 경계 규칙).
 * 권한 상태는 OS가 가진 기기 로컬 상태이며 서버로 보내지 않는다 — `granted` 플래그를
 * SecureStore/AsyncStorage에 미러링하지 않는다(설정 앱에서 바뀐 값과 어긋난다).
 *
 * 조회/요청은 `expo-camera`의 권한 API로 구현한다(ADR 0004). 카메라 프리뷰(`CameraView`)는
 * 쓰지 않는다 — 카메라 스트림은 `apps/web`의 WebView `getUserMedia` 소유다(ADR 0001).
 */

export type CameraPermissionStatus = "undetermined" | "granted" | "denied";

export type CameraPermissionAdapter = {
  /** OS가 보유한 현재 권한 상태를 조회한다. 다이얼로그를 띄우지 않는다. */
  getStatus(): Promise<CameraPermissionStatus>;
  /**
   * OS 권한 다이얼로그(S2-2)를 띄우고 사용자의 응답을 반환한다.
   * iOS는 최초 1회만 다이얼로그를 띄우므로, 이미 결정된 상태에서는 다이얼로그 없이
   * 현재 상태를 그대로 반환해야 한다.
   */
  request(): Promise<CameraPermissionStatus>;
};

/**
 * `expo-camera` 권한 API 어댑터.
 *
 * `PermissionStatus` enum의 문자열 값이 `"granted"`/`"undetermined"`/`"denied"`로
 * `CameraPermissionStatus`와 그대로 일치해서 변환표가 필요 없다.
 *
 * 두 함수는 개별 export가 아니라 집계 객체 `Camera`로만 도달할 수 있다(타입 정의상 `@hidden`
 * 표시이며 deprecated는 아니다). 상위 버전에서 경로가 바뀌면 이 어댑터만 고치면 된다.
 */
export const expoCameraPermissionAdapter: CameraPermissionAdapter = {
  async getStatus() {
    return (await Camera.getCameraPermissionsAsync()).status;
  },
  async request() {
    return (await Camera.requestCameraPermissionsAsync()).status;
  },
};

let adapter: CameraPermissionAdapter = expoCameraPermissionAdapter;

/** 테스트에서 권한 분기를 재현하기 위해 어댑터를 교체한다. */
export function setCameraPermissionAdapter(next: CameraPermissionAdapter): void {
  adapter = next;
}

export function getCameraPermissionStatus(): Promise<CameraPermissionStatus> {
  return adapter.getStatus();
}

/** OS 다이얼로그(S2-2)를 띄운다. denied 상태에서는 다이얼로그 없이 즉시 denied를 반환한다. */
export function requestCameraPermission(): Promise<CameraPermissionStatus> {
  return adapter.request();
}

/**
 * OS 설정 앱의 이 앱 설정 화면으로 이동한다. iOS/Android 동일 API.
 * S6 설정의 "카메라 권한" 행에서도 이 함수를 쓴다 — 중복 구현하지 않는다.
 */
export async function openAppSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch (error) {
    // 설정 앱을 열지 못해도 S2-3 화면은 그대로 유지된다(사용자가 수동으로 이동 가능).
    console.warn("[camera-permission] 설정 앱 열기 실패", error);
  }
}
