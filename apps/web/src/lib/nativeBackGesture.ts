import { useEffect } from "react";

import { postToNative } from "@/lib/bridge";

/**
 * 마운트 동안 iOS 웹뷰의 가장자리 스와이프(back-forward) 제스처를 끈다 — 언마운트에서 되켠다.
 *
 * 소셜룸 세션이 쓴다: 세션 중 가장자리 스와이프의 히스토리 back으로 방을 나가면 제출 없이 측정이 유실된다.
 * 상세는 `packages/types`의 `SetBackGestureMessage` 주석 참고.
 *
 * `nativeTabBar`처럼 라우트 목록으로 전역 동기화하지 않는 이유: 이 제스처를 꺼야 하는 화면이
 * 소셜룸 세션 하나뿐이고, 문의하기·약관 등 나머지 전체 화면 라우트는 오히려 이 제스처가 복귀
 * 수단이다 — 집합이 다른데 같은 목록에 섞으면 한쪽을 고칠 때 다른 쪽이 알리지 않고 깨진다.
 *
 * 브라우저 단독 모드에서는 `postToNative`가 조용히 무동작이라 어디서든 안전하다.
 */
export function useNativeBackGestureLock(): void {
  useEffect(() => {
    postToNative({ type: "set-back-gesture", enabled: false, atMs: Date.now() });
    return () => {
      postToNative({ type: "set-back-gesture", enabled: true, atMs: Date.now() });
    };
  }, []);
}

/**
 * 마운트 동안 Android 하드웨어 뒤로가기를 잠근다 — 언마운트에서 되푼다.
 *
 * 소셜룸 세션이 위 제스처 잠금과 함께 쓴다: 세션 종료가 나가기 버튼으로만 확정되게
 * 두 플랫폼의 뒤로가기 출구를 모두 막는다(`SetBackLockMessage` 주석 참고).
 * 네이티브는 이 잠금 동안을 세션 중으로 보고 업데이트 알림창을 미루므로 세션이 아닌 화면에서는 쓰지 않는다.
 */
export function useNativeBackLock(): void {
  useEffect(() => {
    postToNative({ type: "set-back-lock", locked: true, atMs: Date.now() });
    return () => {
      postToNative({ type: "set-back-lock", locked: false, atMs: Date.now() });
    };
  }, []);
}

/**
 * 마운트 동안 화면 회전 잠금 해제를 요청한다 — 언마운트에서 세로 복원을 요청한다.
 *
 * 실시간 룸이 쓴다: 룸은 탭 웹뷰 안 웹 라우팅으로 돌아 네이티브 화면 전환이 없고, 솔로
 * 세션처럼 화면 마운트에서 잠금을 풀 자리가 없다. 네이티브 반응은 양 플랫폼 공통이다
 * (BY-444, `set-orientation` 계약 주석 참고). 브라우저 단독 모드에서는 조용히 무동작이다.
 */
export function useNativeOrientationUnlock(): void {
  useEffect(() => {
    const stop = holdOrientation(true);
    return () => {
      stop();
      postOrientation(false);
    };
  }, []);
}

/**
 * 마운트 동안 세로 잠금을 요청한다
 *
 * 공부 결과 화면이 쓴다: 싱글룸 네이티브 화면이 회전을 열어 두고, 결과는 같은 웹뷰 안 이동이라 그대로 두면 가로로 돈다.
 * 언마운트에서는 아무것도 보내지 않는다: 결과를 떠나면 다음 룸이나 앱 셸이 자기 방향을 정한다.
 */
export function useNativePortraitLock(): void {
  useEffect(() => holdOrientation(false), []);
}

function postOrientation(unlocked: boolean): void {
  postToNative({ type: "set-orientation", unlocked, atMs: Date.now() });
}

/**
 * 방향 요청을 지금 보내고 화면이 다시 보일 때마다 다시 보내는 구독
 *
 * Android에서 앱 화면이 잠시 가려졌다 돌아오면 앱 셸이나 화면 옵션이 방향을 제 기본값으로 되돌려서 다시 보낸다.
 * 홈 화면에서 돌아올 때는 visibilitychange가 오고, 공유 시트에서 돌아올 때는 resize만 온다.
 * 반환값은 구독을 거두는 함수다.
 */
function holdOrientation(unlocked: boolean): () => void {
  const sendWhenVisible = () => {
    if (document.visibilityState === "visible") {
      postOrientation(unlocked);
    }
  };
  postOrientation(unlocked);
  document.addEventListener("visibilitychange", sendWhenVisible);
  window.addEventListener("resize", sendWhenVisible);
  return () => {
    document.removeEventListener("visibilitychange", sendWhenVisible);
    window.removeEventListener("resize", sendWhenVisible);
  };
}
