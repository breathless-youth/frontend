import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { detectStorePlatform, installLink, readInstallUtm } from "@/features/social-room/storeLink";
import { flushAmplitude, trackStoreLinkRedirected } from "@/lib/amplitude";

/** 분석 전송을 기다리는 상한. 네트워크가 느려도 사용자를 이 이상 붙잡지 않는다. */
const FLUSH_WAIT_MS = 800;

function replaceLocation(url: string) {
  // 뒤로 가기로 이 중간 페이지에 다시 들어오지 않게 기록을 바꿔 끼운다.
  window.location.replace(url);
}

/**
 * 설치 링크
 *
 * 공유 본문에 붙는 웹 주소 하나로 받는 사람을 기기에 맞는 스토어(그 밖은 랜딩)로 보낸다.
 * 유입 표시는 주소의 UTM이고, 이 페이지를 연 순간 Amplitude attribution이 자동으로 남긴다.
 */
export function DownloadPage({ go = replaceLocation }: { go?: (url: string) => void }) {
  const location = useLocation();
  const platform = detectStorePlatform(navigator.userAgent, navigator.maxTouchPoints);
  const target = installLink(platform, readInstallUtm(location.search));

  // StrictMode 개발 빌드가 effect를 두 번 돌려도 이동과 이벤트는 한 번만 한다.
  const movedRef = useRef(false);

  useEffect(() => {
    if (movedRef.current) return;
    movedRef.current = true;
    // 스토어 이동만 센다. PC는 랜딩으로 가므로 스토어 이동이 아니다.
    if (platform !== null) trackStoreLinkRedirected(platform);
    // 열자마자 떠나면 이동 이벤트와 UTM 유입 기록이 전송되기 전에 사라진다.
    // 전송을 기다리되 상한을 넘기면 그냥 이동한다.
    const waited = new Promise<void>((resolve) => window.setTimeout(resolve, FLUSH_WAIT_MS));
    void Promise.race([flushAmplitude().catch(() => {}), waited]).then(() => go(target));
  }, [go, platform, target]);

  return (
    <main className="theme-soft-blue bg-soft-blue text-foreground flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-[28px] leading-none font-extrabold tracking-tight">FocusMakers</p>
      <p role="status" className="text-muted-foreground text-sm">
        스토어로 이동하는 중…
      </p>
      <a
        href={target}
        className="text-primary inline-flex min-h-11 items-center px-3 text-sm font-semibold"
      >
        직접 이동하기
      </a>
    </main>
  );
}
