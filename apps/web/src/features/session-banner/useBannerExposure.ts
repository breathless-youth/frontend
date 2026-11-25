import { type RefObject, useEffect, useRef, useState } from "react";

import { trackSessionBannerImpression, trackSessionBannerShown } from "@/lib/amplitude";

import {
  SESSION_BANNER_COPIES,
  SESSION_BANNER_ROTATE_MS,
  type SessionBannerCopy,
} from "./sessionBanner";

const TICK_MS = 1000;

const copyAt = (impressions: number): SessionBannerCopy =>
  SESSION_BANNER_COPIES[impressions % SESSION_BANNER_COPIES.length]!;

/**
 * 배너 노출 시간 집계와 문구 교체
 *
 * `active`가 참이고 앱이 앞에 있으며 배너 요소가 CSS로 숨겨지지 않은 동안만 보인 시간을 1초씩 쌓는다.
 * 가로 화면과 태블릿에서는 배너를 CSS로만 숨겨서 요소의 계산된 display를 함께 본다.
 * 보인 시간이 5분 쌓일 때마다 노출을 한 번 보내고 다음 문구로 바꾼다.
 * 세션 화면이 내려가면 기록도 사라져 세션마다 첫 문구부터 다시 센다.
 */
export function useBannerExposure({
  active,
  target,
}: {
  active: boolean;
  target: RefObject<HTMLElement | null>;
}): SessionBannerCopy {
  const [impressions, setImpressions] = useState(0);
  const impressionsRef = useRef(0);
  const visibleMsRef = useRef(0);
  // StrictMode가 effect를 두 번 돌려도 처음 보인 것은 한 번만 보낸다.
  const shownRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    const showing = () =>
      document.visibilityState === "visible" &&
      target.current !== null &&
      getComputedStyle(target.current).display !== "none";
    const markShown = () => {
      if (shownRef.current) return;
      shownRef.current = true;
      trackSessionBannerShown({ copy: copyAt(impressionsRef.current) });
    };
    if (showing()) markShown();
    const id = window.setInterval(() => {
      if (!showing()) return;
      markShown();
      visibleMsRef.current += TICK_MS;
      if (visibleMsRef.current < SESSION_BANNER_ROTATE_MS) return;
      visibleMsRef.current -= SESSION_BANNER_ROTATE_MS;
      const count = impressionsRef.current;
      trackSessionBannerImpression({ copy: copyAt(count), sequence: count + 1 });
      impressionsRef.current = count + 1;
      setImpressions(count + 1);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [active, target]);

  return copyAt(impressions);
}
