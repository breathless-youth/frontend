import { useEffect } from "react";

import { trackAppLockToggled } from "@/lib/amplitude";

import { hasAppLockCapability } from "./appLockCapability";
import { readAppLockEnabled, writeAppLockEnabled } from "./appLockSettings";
import { queryAppLock } from "./nativeAppLock";

/**
 * 권한이 꺼져 기능 끄기
 *
 * 홈과 설정 화면이 따로 묻기 때문에, 이미 꺼져 있으면 다른 화면이 먼저 끈 것으로 보고 이벤트를 남기지 않는다.
 */
export function turnOffForLostPermission(): void {
  if (!readAppLockEnabled()) return;
  writeAppLockEnabled(false);
  trackAppLockToggled({ on: false, source: "permission_lost" });
}

/**
 * 스크린타임 권한 꺼짐 확인
 *
 * 설정 앱에서 권한을 끄면 iOS가 잠금을 바로 풀어서, 켜짐으로 남겨 두면 잠그는 줄 알고 공부하게 된다.
 * 홈이 열릴 때와 다시 보일 때 물어 꺼졌으면 기능을 끈다.
 * 설정 앱에 다녀와도 웹뷰는 다시 그려지지 않아서 보임 신호로도 묻는다.
 * 묻는 중에 또 보이면 같은 결과로 이벤트가 두 번 남으므로 앞 질문이 끝날 때까지 건너뛴다.
 */
export function useAppLockRevokeCheck(): void {
  useEffect(() => {
    if (!hasAppLockCapability()) return;
    let active = true;
    let checking = false;
    const check = () => {
      if (checking || !readAppLockEnabled()) return;
      checking = true;
      void queryAppLock().then((state) => {
        checking = false;
        if (active && state?.revoked) turnOffForLostPermission();
      });
    };
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    check();
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, []);
}
