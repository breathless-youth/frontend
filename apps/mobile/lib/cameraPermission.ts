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
    const { status, canAskAgain } = await Camera.getCameraPermissionsAsync();
    /**
     * **다시 물어볼 수 있는 거부는 `undetermined`로 좁힌다.** 이 타입의 `undetermined`는
     * "아직 물어본 적 없음"이 아니라 게이트가 쓰는 의미 그대로 "OS 다이얼로그를 띄워야 하는
     * 상태"다(`cameraPermissionGate.ts`의 분기).
     *
     * Android는 사용자가 설정 앱에서 권한을 끄면 `denied` + `canAskAgain: true`가 된다 —
     * 다이얼로그를 다시 띄울 수 있는데도 `denied`를 그대로 넘기면 게이트가 요청 단계를 건너뛰고
     * 곧장 안내 화면으로 보낸다(2026-08-25 실기기 확인: 권한 없는 상태로 소셜 룸에 들어가면
     * 다이얼로그 없이 안내 화면만 떴다).
     *
     * iOS는 한 번 거부하면 `canAskAgain: false`라 이 분기를 타지 않는다 — "denied에서 다시
     * 요청하면 아무 일도 일어나지 않아 버튼이 안 먹는 것처럼 보인다"는 기존 판단이 그대로
     * 유지된다.
     */
    return status === "denied" && canAskAgain ? "undetermined" : status;
  },
  async request() {
    // 요청 결과는 그대로 돌려준다 — 방금 거부한 응답을 "다시 물어볼 수 있다"는 이유로
    // 뒤집으면 게이트가 같은 다이얼로그를 반복해 띄우게 된다.
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
