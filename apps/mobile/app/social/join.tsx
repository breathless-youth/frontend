import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";

import { trackNativeEvent } from "../../lib/nativeAnalytics";

/**
 * 초대 링크 딥링크 진입 리다이렉터
 *
 * 유니버설 링크·App Links·Install Referrer·커스텀 스킴 모두 이 라우트로 들어와
 * 소셜 탭 안의 웹으로 합류한다.
 */
export default function SocialJoinDeepLinkScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const hasCode = typeof code === "string" && code !== "";
  const params = hasCode ? { code } : {};

  // 딥링크로 앱이 열렸다는 사실은 네이티브만 안다 — 웹 Amplitude로 넘긴다(`lib/nativeAnalytics.ts`).
  // 코드 값은 싣지 않는다(초대코드 값 속성 금지).
  useEffect(() => {
    trackNativeEvent("invite_deep_link_opened", { has_code: hasCode });
  }, [hasCode]);

  return <Redirect href={{ pathname: "/(tabs)/social", params }} />;
}
