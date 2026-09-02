import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * 초대 링크 딥링크 진입 리다이렉터
 *
 * 유니버설 링크·App Links·Install Referrer·커스텀 스킴 모두 이 라우트로 들어와
 * 소셜 탭 안의 웹으로 합류한다.
 */
export default function SocialJoinDeepLinkScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const params = typeof code === "string" && code !== "" ? { code } : {};
  return <Redirect href={{ pathname: "/(tabs)/social", params }} />;
}
