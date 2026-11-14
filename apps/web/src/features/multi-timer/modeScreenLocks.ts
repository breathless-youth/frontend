import { useEffect } from "react";

import { postToNative } from "@/lib/bridge";

/**
 * 측정 화면이 열릴 때 회전 허용 다시 알리기
 *
 * 회전 규칙의 주인은 솔로 세션 화면이고, 앱은 그 화면을 띄울 때 한 번만 회전을 푼다.
 * 웹이 회전 허용을 보낸 기록이 남은 채 웹뷰가 죽으면 앱은 복구하며 세로로 잠그고, 다시 그린 문서는 그 잠금을 모른다.
 * 그래서 문서가 새로 열릴 때마다 회전 허용을 다시 보낸다.
 * 이 화면은 이미 회전을 허용하는 앱 화면에만 실려 같은 값을 다시 보내도 바뀌는 것이 없고, 브라우저에서는 보내는 곳이 없다.
 */
export function useSessionRotationRestore(): void {
  useEffect(() => {
    postToNative({ type: "set-orientation", unlocked: true, atMs: Date.now() });
  }, []);
}
