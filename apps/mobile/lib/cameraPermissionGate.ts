import {
  getCameraPermissionStatus,
  requestCameraPermission,
  type CameraPermissionStatus,
} from "./cameraPermission";
import { trackNativeEvent } from "./nativeAnalytics";

/**
 * 세션 진입 권한 게이트 (`frontend/docs/screens/SCR-S2-camera-permission.md` Interaction Contract).
 *
 * ```
 * getCameraPermissionStatus()
 *   ├─ granted      → 세션 시작 (S3-1)
 *   ├─ undetermined → requestCameraPermission() = OS 다이얼로그(S2-2)
 *   │                   ├─ 허용 → 세션 시작
 *   │                   └─ 거부 → S2-3
 *   └─ denied       → S2-2를 띄울 수 없다(iOS는 최초 1회만) → 즉시 S2-3
 * ```
 *
 * 권한 요청은 앱 실행·홈 진입이 아니라 **"집중 시작" 이후**에만 일어난다(`mvp-scope.md` 확정).
 * 화면에 의존하지 않는 순수 분기라 `lib/`에 두고 테스트한다.
 */

/** 권한 상태를 확인한 결과 다음에 해야 할 일. */
export type CameraPermissionGateOutcome =
  /** 세션(S3-1)으로 진행한다. */
  | "start-session"
  /** OS 다이얼로그(S2-2)를 띄워 사용자 응답을 받아야 한다. */
  | "request-permission"
  /** 권한 거부 안내(S2-3)로 보낸다. */
  | "show-denied-guide";

/** 조회된 권한 상태 하나를 다음 행동으로 매핑한다(부수효과 없음). */
export function decideFromPermissionStatus(
  status: CameraPermissionStatus,
): CameraPermissionGateOutcome {
  switch (status) {
    case "granted":
      return "start-session";
    case "undetermined":
      return "request-permission";
    // denied에서 시스템 다이얼로그를 다시 요청하지 않는다 — iOS에서 아무 일도 일어나지 않아
    // "버튼이 안 먹는" 것처럼 보인다. 상태를 먼저 조회해 S2-3으로 보낸다.
    case "denied":
      return "show-denied-guide";
  }
}

/** 게이트 실행 결과 — 화면 전환 목적지 두 가지로 좁혀진다. */
export type CameraPermissionGateResult = "start-session" | "show-denied-guide";

/**
 * 권한 상태를 조회하고 필요하면 OS 다이얼로그까지 띄운 뒤 최종 목적지를 돌려준다.
 *
 * 조회·요청은 `expo-camera` 권한 API로 실제 동작한다(`lib/cameraPermission.ts`, ADR 0004).
 *
 * **실패 시 닫히는(fail-closed) 게이트다.** 어댑터가 throw하면 상태를 알 수 없으므로
 * 세션을 시작하지 않고 S2-3으로 보낸다 —
 * "카메라 권한 없이 사용 불가"(`policies.md` §3)에 맞고, 사용자에게 "설정 열기"라는
 * 행동 가능한 경로가 남는다. 버튼이 아무 반응 없는 상태로 두지 않는다.
 * 이 함수는 reject하지 않으므로 호출부는 결과 분기만 하면 된다.
 *
 * 분기 결과는 `camera_permission_gate_resolved`로 웹 Amplitude에 넘긴다(`lib/nativeAnalytics.ts`) —
 * OS 다이얼로그 거부율은 웹이 관측할 수 없는 값이고, 수동 타이머 모드 우선순위의 직접 근거다.
 * `roomType`은 집중 시작(`single`)과 소셜룸 입장 게이트(`social`)를 가른다.
 */
export async function runCameraPermissionGate(
  roomType: "single" | "social" = "single",
): Promise<CameraPermissionGateResult> {
  // 이번 호출에서 OS 다이얼로그(S2-2)를 실제로 띄웠는지 — 실패(catch)도 그 시점에 따라 갈린다.
  let prompted = false;
  try {
    const decision = decideFromPermissionStatus(await getCameraPermissionStatus());
    if (decision !== "request-permission") {
      trackNativeEvent("camera_permission_gate_resolved", {
        result: decision === "start-session" ? "granted" : "already_denied",
        prompted,
        room_type: roomType,
      });
      return decision;
    }
    prompted = true;
    const granted = decideFromPermissionStatus(await requestCameraPermission()) === "start-session";
    trackNativeEvent("camera_permission_gate_resolved", {
      result: granted ? "granted" : "denied",
      prompted,
      room_type: roomType,
    });
    return granted ? "start-session" : "show-denied-guide";
  } catch (error) {
    console.warn("[camera-permission] 권한 조회 실패 — 세션을 시작하지 않고 안내 화면으로", error);
    trackNativeEvent("camera_permission_gate_resolved", {
      result: "error",
      prompted,
      room_type: roomType,
    });
    return "show-denied-guide";
  }
}
