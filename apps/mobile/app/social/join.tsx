import { useLocalSearchParams } from "expo-router";

import { RemoteScreen } from "../../components/RemoteScreen";
import { SocialTabSkeleton } from "../../components/RemoteSplashSkeletons";

/**
 * 초대 링크 딥링크 진입 화면 (`https://web.sunqstudio.kr/social/join?code=NNNN`).
 *
 * 유니버설/앱 링크(또는 dev의 `exp://…/--/social/join?code=NNNN`)가 앱을 열면 expo-router가
 * 이 라우트로 보낸다. 소셜 탭과 별개의 스택 화면으로 뜨며, 웹 `/social/join`을 코드가
 * 채워진 채(`?code` 프리필) 로드한다 — 사용자는 참여하기만 누르면 된다.
 *
 * 링크 연결이 실제로 동작하려면 스토어 빌드 쪽 선행이 남아 있다:
 * `.well-known/`의 APPLE_TEAM_ID·서명 인증서 지문 채우기(apps/web/public/.well-known) +
 * EAS 재빌드. Expo Go에서는 `exp://` 스킴으로만 검증 가능하다.
 */
export default function SocialJoinDeepLinkScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();

  return (
    <RemoteScreen
      testID="social-join-webview"
      path="/social/join"
      extraQuery={typeof code === "string" && code !== "" ? { code } : undefined}
      splash={<SocialTabSkeleton />}
    />
  );
}
