import { useEffect } from "react";

import { postToNative } from "@/lib/bridge";

/**
 * 마운트 동안 iOS 웹뷰의 가장자리 스와이프(back-forward) 제스처를 끈다 — 언마운트에서 되켠다.
 *
 * 온보딩 가이드(G1~G5)가 쓴다: 스텝 이동은 가이드 내부 상태라 웹 히스토리에 쌓이지 않으므로,
 * 가장자리 스와이프의 히스토리 back이 곧장 진입 전 화면(설정·홈)으로 떨어진다 — 가이드 종료는
 * X·완료·건너뛰기로만 확정한다는 계약(SCR-G1-G5)과 어긋나는 우발 이탈이다. 상세는
 * `packages/types`의 `SetBackGestureMessage` 주석 참고.
 *
 * `nativeTabBar`처럼 라우트 목록으로 전역 동기화하지 않는 이유: 이 제스처를 꺼야 하는 라우트가
 * 가이드 하나뿐이고, 문의하기·약관 등 나머지 전체 화면 라우트는 오히려 이 제스처가 복귀
 * 수단이다 — 집합이 다른데 같은 목록에 얹으면 한쪽을 고칠 때 다른 쪽이 조용히 깨진다.
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
 * 세션처럼 화면 마운트에서 잠금을 풀 자리가 없다. 네이티브 반응은 Android 전용이다
 * (`set-orientation` 계약 주석 참고). 브라우저 단독 모드에서는 조용히 무동작이다.
 */
export function useNativeOrientationUnlock(): void {
  useEffect(() => {
    postToNative({ type: "set-orientation", unlocked: true, atMs: Date.now() });
    return () => {
      postToNative({ type: "set-orientation", unlocked: false, atMs: Date.now() });
    };
  }, []);
}
