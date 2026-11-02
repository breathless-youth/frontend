import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { postToNative } from "./bridge";

let sent = false;

/**
 * 첫 화면을 보여도 된다고 앱에 알린다
 *
 * 앱은 이 신호가 올 때까지 스플래시를 유지한다(`apps/mobile/lib/launchReady.ts`).
 * 홈은 온보딩으로 보낼지 판정한 뒤에, 다른 화면은 처음 그릴 때 보낸다.
 * 문서당 한 번이면 되고, 신호를 모르는 구버전 앱은 버린다.
 */
export function signalLaunchReady(): void {
  if (sent) return;
  sent = true;
  postToNative({ type: "launch-ready", atMs: Date.now() });
}

export function __resetLaunchReadyForTests(): void {
  sent = false;
}

/**
 * 홈 밖의 화면으로 시작한 문서의 시작 신호
 *
 * 푸시 알림으로 다른 탭이 먼저 열려도 앱이 스플래시 상한까지 기다리지 않게 한다.
 * 홈과 온보딩은 판정이 끝난 뒤에 스스로 보낸다.
 * 첫 경로만 보므로 `App`에서 한 번만 마운트한다.
 */
export function useLaunchReadyOutsideHome(): void {
  const { pathname } = useLocation();
  const startPath = useRef(pathname);
  useEffect(() => {
    const path = startPath.current;
    if (!path.startsWith("/home") && !path.startsWith("/onboarding")) {
      signalLaunchReady();
    }
  }, []);
}
