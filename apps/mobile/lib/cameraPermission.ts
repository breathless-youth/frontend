import { Linking } from "react-native";

/**
 * 카메라 권한 어댑터 (`frontend/docs/screens/SCR-S2-camera-permission.md` Data Contract).
 *
 * UI 컴포넌트가 카메라 SDK를 직접 호출하지 않게 격리하는 계층이다(`apps/mobile/CLAUDE.md` 경계 규칙).
 * 권한 상태는 OS가 가진 기기 로컬 상태이며 서버로 보내지 않는다 — `granted` 플래그를
 * SecureStore/AsyncStorage에 미러링하지 않는다(설정 앱에서 바뀐 값과 어긋난다).
 *
 * ⚠️ 조회/요청의 실제 네이티브 구현은 **아직 없다**. `expo-camera` 등 권한 조회 모듈이
 * 2026-07-25 기능 리셋으로 제거됐고, 어떤 모듈을 쓸지는 미확정이다.
 * TODO(SCR-S2-camera-permission.md): 카메라 권한 조회/요청에 쓸 네이티브 모듈 확정 필요
 *   (`expo-camera` 추가 vs WebView 계층 위임) — 새 의존성 추가는 리더 승인 후.
 *   확정되면 `setCameraPermissionAdapter()`로 실제 구현을 주입하고 아래 mock을 제거한다.
 *
 * `openAppSettings()`만은 새 의존성 없이 지금 바로 실제 동작한다(RN 코어 `Linking`).
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

type MockCameraPermissionState = {
  /** 현재 권한 상태. */
  status: CameraPermissionStatus;
  /** `undetermined`에서 `request()`를 부를 때 OS 다이얼로그가 돌려줬다고 가정할 값. */
  dialogOutcome: "granted" | "denied";
};

const INITIAL_MOCK_STATE: MockCameraPermissionState = {
  status: "undetermined",
  // 실제 OS 다이얼로그를 띄울 수단이 없는 상태에서 "허용됐다"고 꾸며내면 후속 화면이
  // 존재하지도 않는 세션으로 넘어간다. 기본값을 거부로 두어 S2-3 안내 화면까지의
  // 경로를 검증 가능하게 한다 — 실제 모듈이 붙으면 이 mock 전체가 사라진다.
  dialogOutcome: "denied",
};

const mockState: MockCameraPermissionState = { ...INITIAL_MOCK_STATE };

/** 개발·테스트에서 권한 분기를 재현하기 위한 mock 제어. 실제 모듈 연결 시 함께 제거한다. */
export function setMockCameraPermissionState(next: Partial<MockCameraPermissionState>): void {
  if (next.status !== undefined) {
    mockState.status = next.status;
  }
  if (next.dialogOutcome !== undefined) {
    mockState.dialogOutcome = next.dialogOutcome;
  }
}

/** 테스트 격리용 — mock 상태를 초기값으로 되돌린다. */
export function resetMockCameraPermissionState(): void {
  setMockCameraPermissionState(INITIAL_MOCK_STATE);
}

export const mockCameraPermissionAdapter: CameraPermissionAdapter = {
  getStatus() {
    return Promise.resolve(mockState.status);
  },
  request() {
    // iOS는 한 번 결정된 뒤에는 시스템 다이얼로그를 다시 띄우지 않는다 —
    // 실제 모듈도 이 자리에서 현재 상태를 그대로 돌려준다.
    if (mockState.status !== "undetermined") {
      return Promise.resolve(mockState.status);
    }
    mockState.status = mockState.dialogOutcome;
    return Promise.resolve(mockState.status);
  },
};

let adapter: CameraPermissionAdapter = mockCameraPermissionAdapter;

/** 실제 네이티브 구현이 확정되면 앱 부트스트랩에서 한 번 주입한다. */
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
