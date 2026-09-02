import { useRef } from "react";
import { useSearchParams } from "react-router-dom";

import { detectStorePlatform } from "@/features/social-room/storeLink";

import { openAppStore } from "./store";
import { shouldForceUpdate } from "./version";

/**
 * 네이티브 셸이 웹뷰 URL 쿼리 `appVersion`에 실어 보내는 값을 읽어 강제 업데이트
 * 여부를 판정한다(`SettingsPage`의 `appVersion` 읽기와 같은 계약).
 * 브라우저 단독 접속은 쿼리 자체가 없어 `shouldForceUpdate`가 자연히 false로 fail-open한다.
 *
 * 버전이 낮아도 보낼 스토어를 못 정하면(데스크톱 UA 등) 강제하지 않는다(fail-open)
 */
export function useForceUpdateGate(): { forced: boolean; onUpdate: () => void } {
  const [searchParams] = useSearchParams();
  // appVersion은 첫 렌더링 시의 값으로 고정
  const appVersion = useRef(searchParams.get("appVersion")).current;
  const platform =
    typeof navigator === "undefined"
      ? null
      : detectStorePlatform(navigator.userAgent, navigator.maxTouchPoints);
  const forced = platform !== null && shouldForceUpdate(appVersion);

  return {
    forced,
    onUpdate: () => {
      if (platform) openAppStore(platform);
    },
  };
}
