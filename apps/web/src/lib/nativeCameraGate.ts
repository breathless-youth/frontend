import { isNativeBridgeAvailable, postToNative, subscribeToNativeMessages } from "./bridge";

/**
 * 이 메시지를 모르는 구버전 앱을 가려내는 한도. 응답이 올 수 없는 셸이므로 짧게 끊고 통과시킨다.
 */
const LEGACY_SHELL_TIMEOUT_MS = 3000;

/**
 * 게이트를 처리하는 셸의 응답 한도. **OS 권한 다이얼로그 앞에서 사용자가 고민하는 시간이 이
 * 안에 들어간다** — 네이티브는 사용자가 다이얼로그에 답한 뒤에야 결과를 보내기 때문이다
 * (`apps/mobile/lib/cameraPermissionGate.ts`). 짧게 잡으면 뒤늦게 누른 허용이 버려지고 이미
 * 소셜 홈으로 나간 뒤가 된다(2026-08-25 채점 지적). 이 시간까지도 답이 없으면 다이얼로그를
 * 방치한 것으로 보고 차단한다.
 */
const GATE_TIMEOUT_MS = 120_000;

/**
 * 셸이 `request-camera-gate`를 처리할 수 있는지 — 네이티브가 웹뷰 URL에 붙이는 표시다
 * (`apps/mobile/lib/remoteQueryParams.ts`의 `cameraGate=1`).
 *
 * 이 값이 무응답의 해석을 가른다. **표시가 있으면 무응답을 차단으로 본다** — 권한을 확인하지
 * 못한 채 룸에 들여보내지 않는다는 정책이고, 응답을 보낼 수 있는 셸이 침묵했다면 그 자체가
 * 비정상이다. **표시가 없으면 통과시킨다** — 이 메시지를 모르는 구버전 앱에서는 응답이 올 수가
 * 없고, 원격 웹은 구버전 앱에도 즉시 배포되므로 여기서 막으면 그 사용자들의 소셜 룸 입장이
 * 통째로 끊긴다.
 */
function shellHandlesGate(): boolean {
  return new URLSearchParams(window.location.search).get("cameraGate") === "1";
}

/**
 * 진행 중인 게이트 요청 하나 — 동시 호출이 같은 결과를 공유한다. StrictMode의 effect 이중
 * 실행(dev)이나 빠른 재진입에서 요청이 두 번 나가면 네이티브 게이트가 두 번 돌아 OS
 * 다이얼로그·안내 화면이 겹쳐 뜬다(2026-08-25 실기기 확인).
 *
 * ⚠️ **응답이 유실되면 이 공유가 다음 입장 시도까지 번진다** — 답이 없는 요청이 최대
 * `GATE_TIMEOUT_MS` 동안 살아 있고, 그 사이 다시 입장하면 새 요청을 보내지 않고 이 죽은
 * 약속을 물려받아 타이머가 끝난 뒤 차단으로 떨어진다. 한 번의 입장 시도를 버리는 대신
 * 그 뒤에는 `pendingGate`가 비워져 스스로 회복한다(2026-08-25 봇 리뷰).
 *
 * 이 공유를 언마운트에서 취소하는 방식은 쓰지 않는다 — 호출부(`LiveRoomEntry`)가
 * `gateRequestedRef`로 인스턴스당 한 번만 요청하므로, StrictMode의 정리 단계에서 취소하면
 * 뒤이은 재실행이 요청을 다시 보내지 않아 게이트가 영영 결착되지 않는다. 유실은 브리지가
 * 살아 있는데 발신만 삼켜진 좁은 경우뿐이라(네이티브 핸들러는 예외에도 반드시 답한다)
 * 자기 회복에 맡긴다.
 */
let pendingGate: Promise<boolean> | null = null;

/**
 * 네이티브 카메라 권한 게이트를 요청하고 입장 가능 여부를 돌려준다.
 *
 * 실시간 룸 입장이 카메라를 열기 전에 부른다. Android 웹뷰는 앱에 OS 권한이 없으면 묻지 않고
 * 거부하므로, 웹이 먼저 네이티브 게이트(솔로 세션 `start-session`과 같은 분기)를 태워 OS
 * 다이얼로그·권한 안내 화면을 연결한다. `false`면 네이티브가 안내 화면을 이미 띄운 상태라
 * 호출부는 입장을 중단하기만 하면 된다.
 *
 * 브라우저 단독 모드는 브리지가 없어 즉시 `true`다 — 브라우저 자체 권한 프롬프트가 기존대로
 * 동작하고, OS 권한과 기준이 다르므로 차단 대상이 아니다.
 */
export function requestCameraGate(): Promise<boolean> {
  if (!isNativeBridgeAvailable()) {
    return Promise.resolve(true);
  }
  if (pendingGate !== null) {
    return pendingGate;
  }
  pendingGate = new Promise((resolve) => {
    let settled = false;
    const settle = (granted: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      pendingGate = null;
      unsubscribe();
      clearTimeout(timer);
      resolve(granted);
    };
    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type === "camera-gate-result") {
        settle(message.granted);
      }
    });
    const handlesGate = shellHandlesGate();
    const timer = setTimeout(
      () => settle(!handlesGate),
      handlesGate ? GATE_TIMEOUT_MS : LEGACY_SHELL_TIMEOUT_MS,
    );
    postToNative({ type: "request-camera-gate", atMs: Date.now() });
  });
  return pendingGate;
}
